import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { once } from "node:events";
import { before, after, describe, test, mock } from "node:test";
import { app } from "../src/app.js";
import { User } from "../src/models/userModel.js";
import { Product } from "../src/models/productModel.js";
import { Vendor } from "../src/models/vendorModel.js";
import { Coupon } from "../src/models/couponModel.js";
import { Order } from "../src/models/orderModel.js";
import { cartStorage } from "../src/services/cartStorage.js";
import { razorpayGateway } from "../src/services/razorpayGateway.js";
import { createAccessToken } from "../src/services/tokenService.js";

describe(
  "Checkout preview without payment or image services",
  { concurrency: false },
  () => {
    const userId = "507f1f77bcf86cd799439011",
      productId = "507f1f77bcf86cd799439012",
      vendorId = "507f1f77bcf86cd799439013";
    const version = randomUUID();
    let server, base, token;
    const originalSecret = process.env.JWT_SECRET;
    const request = async (body = { cartVersion: version }, auth = token) => {
      const response = await fetch(`${base}/api/orders/quote`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(auth ? { Authorization: `Bearer ${auth}` } : {}),
        },
        body: JSON.stringify(body),
      });
      return { response, payload: await response.json() };
    };
    before(async () => {
      process.env.JWT_SECRET = randomBytes(64).toString("hex");
      token = createAccessToken(userId);
      mock.method(User, "findById", () => ({
        select: async () => ({
          _id: userId,
          name: "Buyer",
          emailNormalized: "buyer@example.test",
          roles: ["customer"],
          status: "active",
        }),
      }));
      mock.method(cartStorage, "read", async (owner) => {
        assert.equal(owner, userId);
        return { version, items: [{ productId, quantity: 2 }] };
      });
      mock.method(Product, "find", async () => [
        {
          _id: productId,
          vendorId,
          title: "Everyday mug",
          storeName: "Mug Store",
          priceInPaise: 10000,
          stock: 10,
          status: "active",
          image: { key: "PRIVATE_S3_KEY" },
        },
      ]);
      mock.method(Vendor, "find", async () => [
        { _id: vendorId, status: "approved", razorpayAccountId: null },
      ]);
      mock.method(Coupon, "findOne", async () => ({
        code: "SAVE10",
        kind: "percent",
        value: 10,
        used: 0,
        maxUses: 10,
        active: true,
        minSubtotalInPaise: 0,
        expiresAt: new Date(Date.now() + 60000),
      }));
      server = app.listen(0, "127.0.0.1");
      await once(server, "listening");
      base = `http://127.0.0.1:${server.address().port}`;
    });
    after(async () => {
      if (server) await new Promise((resolve) => server.close(resolve));
      mock.restoreAll();
      if (originalSecret === undefined) delete process.env.JWT_SECRET;
      else process.env.JWT_SECRET = originalSecret;
    });
    test("requires authentication before reading a cart", async () =>
      assert.equal(
        (await request({ cartVersion: version }, null)).response.status,
        401,
      ));
    test("previews current prices and discounts without linked accounts, payment calls or writes", async (context) => {
      const create = context.mock.method(Order, "create", async () => {
        throw new Error("Must not create order");
      });
      const gateway = context.mock.method(
        razorpayGateway,
        "createOrder",
        async () => {
          throw new Error("Must not call Razorpay");
        },
      );
      const cartWrite = context.mock.method(cartStorage, "mutate", async () => {
        throw new Error("Must not mutate cart");
      });
      const couponWrite = context.mock.method(Coupon, "updateOne", async () => {
        throw new Error("Must not consume coupon");
      });
      const stockWrite = context.mock.method(Product, "updateOne", async () => {
        throw new Error("Must not change stock");
      });
      const { response, payload } = await request({
        cartVersion: version,
        couponCode: " save10 ",
      });
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("cache-control"), "no-store");
      assert.equal(payload.data.quote.totalInPaise, 18000);
      assert.equal(payload.data.quote.discountInPaise, 2000);
      assert.equal(payload.data.quote.couponCode, "SAVE10");
      assert.equal(JSON.stringify(payload).includes("PRIVATE_S3_KEY"), false);
      assert.equal(
        JSON.stringify(payload).includes("razorpayAccountId"),
        false,
      );
      for (const operation of [
        create,
        gateway,
        cartWrite,
        couponWrite,
        stockWrite,
      ])
        assert.equal(operation.mock.callCount(), 0);
    });
    test("rejects customer supplied totals and owner fields", async () => {
      for (const extra of [{ totalInPaise: 1 }, { userId: vendorId }])
        assert.equal(
          (await request({ cartVersion: version, ...extra })).response.status,
          422,
        );
    });
    test("rejects a changed cart revision", async () =>
      assert.equal(
        (await request({ cartVersion: randomUUID() })).payload.error.code,
        "CART_CHANGED",
      ));
    test("rejects an expired coupon", async (context) => {
      context.mock.method(Coupon, "findOne", async () => ({
        active: true,
        used: 0,
        maxUses: 1,
        expiresAt: new Date(0),
      }));
      assert.equal(
        (await request({ cartVersion: version, couponCode: "EXPIRED" })).payload
          .error.code,
        "COUPON_UNAVAILABLE",
      );
    });
    test("rejects unavailable stores even if the product is still active", async (context) => {
      context.mock.method(Vendor, "find", async () => []);
      assert.equal(
        (await request()).payload.error.code,
        "CHECKOUT_STOCK_CHANGED",
      );
    });
  },
);
