import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { once } from "node:events";
import { after, before, describe, mock, test } from "node:test";
import { app } from "../src/app.js";
import { User } from "../src/models/userModel.js";
import { Product } from "../src/models/productModel.js";
import { createAccessToken } from "../src/services/tokenService.js";
import { cartStorage } from "../src/services/cartStorage.js";
import { productImageStorage } from "../src/services/productImageStorage.js";
import { ApiError } from "../src/utils/ApiError.js";

describe(
  "Cart HTTP boundary (storage operations simulated)",
  { concurrency: false },
  () => {
    const userId = "000000000000000000000001";
    const productId = "000000000000000000000002";
    let token;
    let server;
    let baseUrl;
    const envKeys = ["JWT_SECRET", "JWT_ISSUER", "JWT_AUDIENCE"];
    const originalEnv = envKeys.map((key) => [key, process.env[key]]);
    const request = async (
      path = "",
      { method = "GET", body, auth = token, headers = {} } = {},
    ) => {
      const response = await fetch(`${baseUrl}/api/cart${path}`, {
        method,
        headers: {
          ...(auth ? { Authorization: `Bearer ${auth}` } : {}),
          ...headers,
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      return { response, payload: await response.json() };
    };
    before(async () => {
      Object.assign(process.env, {
        JWT_SECRET: randomBytes(64).toString("base64url"),
        JWT_ISSUER: "cart-tests",
        JWT_AUDIENCE: "cart-client-tests",
      });
      token = createAccessToken(userId);
      mock.method(User, "findById", () => ({
        select: async () => ({
          _id: userId,
          name: "Test Buyer",
          emailNormalized: "buyer@example.test",
          roles: ["customer"],
          status: "active",
        }),
      }));
      server = app.listen(0, "127.0.0.1");
      await once(server, "listening");
      baseUrl = `http://127.0.0.1:${server.address().port}`;
    });
    after(async () => {
      if (server) await new Promise((resolve) => server.close(resolve));
      mock.restoreAll();
      for (const [key, value] of originalEnv) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    });

    test("all cart endpoints reject missing or invalid authentication before Redis", async (context) => {
      const read = context.mock.method(cartStorage, "read", async () => {
        throw new Error("Must not read");
      });
      const mutate = context.mock.method(cartStorage, "mutate", async () => {
        throw new Error("Must not write");
      });
      for (const [path, method] of [
        ["", "GET"],
        ["/items", "POST"],
        [`/items/${productId}`, "PATCH"],
        [`/items/${productId}`, "DELETE"],
        ["", "DELETE"],
      ]) {
        assert.equal(
          (await request(path, { method, auth: null })).response.status,
          401,
        );
        assert.equal(
          (await request(path, { method, auth: "invalid" })).response.status,
          401,
        );
      }
      assert.equal(read.mock.callCount() + mutate.mock.callCount(), 0);
    });

    test("loads the JWT owner's empty cart with a private cache policy and version", async (context) => {
      context.mock.method(cartStorage, "read", async (owner) => {
        assert.equal(owner, userId);
        return { version: "0", items: [] };
      });
      const { response, payload } = await request("?userId=someone-else");
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("cache-control"), "no-store");
      assert.equal(response.headers.get("etag"), '"0"');
      assert.deepEqual(payload.data.cart.summary, {
        itemCount: 0,
        subtotalInPaise: 0,
        hasIssues: false,
      });
    });

    test("rejects invalid quantities and forged owner, price and product metadata", async (context) => {
      const mutate = context.mock.method(cartStorage, "mutate", async () => {
        throw new Error("Must not write");
      });
      for (const body of [
        { productId, quantity: 0 },
        { productId, quantity: 100 },
        { productId, quantity: 1.5 },
        { productId, quantity: "1" },
        { productId: "bad", quantity: 1 },
        { productId, quantity: 1, userId },
        { productId, quantity: 1, priceInPaise: 1 },
        { productId, stock: 99 },
      ]) {
        assert.equal(
          (
            await request("/items", {
              method: "POST",
              body,
              headers: { "Idempotency-Key": randomUUID() },
            })
          ).response.status,
          422,
        );
      }
      assert.equal(
        (
          await request("/items", {
            method: "POST",
            body: { productId, quantity: 1 },
          })
        ).response.status,
        422,
      );
      assert.equal(mutate.mock.callCount(), 0);
    });

    test("quantity updates require a quoted cart revision and valid product ID", async () => {
      for (const headers of [
        {},
        { "If-Match": "0" },
        { "If-Match": '"wrong"' },
      ]) {
        assert.equal(
          (
            await request(`/items/${productId}`, {
              method: "PATCH",
              body: { quantity: 1 },
              headers,
            })
          ).response.status,
          422,
        );
      }
      assert.equal(
        (
          await request("/items/wrong", {
            method: "DELETE",
            headers: { "If-Match": '"0"' },
          })
        ).response.status,
        422,
      );
      assert.equal(
        (await request("", { method: "DELETE" })).response.status,
        422,
      );
    });

    test("inactive products cannot be added even with valid cart input", async (context) => {
      context.mock.method(Product, "findOne", (filter) => {
        assert.equal(filter.status, "active");
        return { select: async () => null };
      });
      const write = context.mock.method(cartStorage, "mutate", async () => {
        throw new Error("Must not write");
      });
      assert.equal(
        (
          await request("/items", {
            method: "POST",
            body: { productId, quantity: 1 },
            headers: { "Idempotency-Key": randomUUID() },
          })
        ).response.status,
        404,
      );
      assert.equal(write.mock.callCount(), 0);
    });

    test("unavailable products are removable without exposing their private details", async (context) => {
      context.mock.method(cartStorage, "read", async () => ({
        version: randomUUID(),
        items: [{ productId, quantity: 2 }],
      }));
      context.mock.method(Product, "find", (filter) => {
        assert.equal(filter.status, "active");
        return { select: async () => [] };
      });
      const { payload } = await request();
      assert.equal(payload.data.cart.items[0].product, null);
      assert.equal(payload.data.cart.items[0].issue, "PRODUCT_UNAVAILABLE");
      assert.equal(payload.data.cart.summary.subtotalInPaise, 0);
      assert.equal(payload.data.cart.summary.hasIssues, true);
    });

    test("current product prices determine totals and missing S3 does not break the cart", async (context) => {
      context.mock.method(console, "error", () => {});
      context.mock.method(cartStorage, "read", async () => ({
        version: randomUUID(),
        items: [{ productId, quantity: 3 }],
      }));
      context.mock.method(Product, "find", () => ({
        select: async () => [
          {
            _id: productId,
            vendorId: userId,
            title: "Mug",
            storeName: "Store",
            currency: "INR",
            priceInPaise: 19999,
            stock: 8,
            image: { key: "private-key" },
            privateNote: "DO_NOT_EXPOSE",
          },
        ],
      }));
      context.mock.method(productImageStorage, "sign", async () => {
        throw new Error("No S3");
      });
      const { response, payload } = await request();
      assert.equal(response.status, 200);
      assert.equal(payload.data.cart.summary.subtotalInPaise, 59997);
      assert.equal(payload.data.cart.items[0].product.imageUrl, null);
      assert.equal(JSON.stringify(payload).includes("private-key"), false);
      assert.equal(JSON.stringify(payload).includes("DO_NOT_EXPOSE"), false);
    });

    test("storage outages return safe 503 errors through the central handler", async (context) => {
      context.mock.method(console, "error", () => {});
      context.mock.method(cartStorage, "read", async () => {
        throw new ApiError(
          503,
          "CART_UNAVAILABLE",
          "Your cart is temporarily unavailable.",
        );
      });
      const { response, payload } = await request();
      assert.equal(response.status, 503);
      assert.equal(payload.error.code, "CART_UNAVAILABLE");
    });
  },
);
