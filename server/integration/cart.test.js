import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { once } from "node:events";
import { after, before, beforeEach, describe, mock, test } from "node:test";
import { app } from "../src/app.js";
import { User } from "../src/models/userModel.js";
import { Product } from "../src/models/productModel.js";
import { createAccessToken } from "../src/services/tokenService.js";
import { getRedisClient, closeRedisClient } from "../src/config/redis.js";
import { cartKey } from "../src/services/cartStorage.js";
import { CART_LIMITS } from "../src/config/cart.js";

describe(
  "Cart with real local Redis (MongoDB operations simulated)",
  { skip: process.env.REDIS_INTEGRATION !== "1", concurrency: false },
  () => {
    const userA = new User({
      name: "Buyer A",
      emailNormalized: "a@example.test",
      passwordHash: "unused",
    }).toObject();
    const userB = new User({
      name: "Buyer B",
      emailNormalized: "b@example.test",
      passwordHash: "unused",
    }).toObject();
    const users = new Map([
      [userA._id.toString(), userA],
      [userB._id.toString(), userB],
    ]);
    const products = new Map();
    const envKeys = [
      "JWT_SECRET",
      "JWT_ISSUER",
      "JWT_AUDIENCE",
      "NODE_ENV",
      "REDIS_URL",
      "REDIS_CART_PREFIX",
    ];
    const originalEnv = envKeys.map((key) => [key, process.env[key]]);
    let server;
    let baseUrl;
    let client;
    let tokens;
    let productA;
    let productB;
    const request = async (
      path = "",
      {
        method = "GET",
        body,
        token = tokens.a,
        version,
        operationId = randomUUID(),
      } = {},
    ) => {
      const response = await fetch(`${baseUrl}/api/cart${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          "Idempotency-Key": operationId,
          ...(version !== undefined ? { "If-Match": `"${version}"` } : {}),
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      return { response, payload: await response.json() };
    };
    const add = (id = productA._id.toString(), quantity = 1, options = {}) =>
      request("/items", {
        method: "POST",
        body: { productId: id, quantity },
        ...options,
      });
    before(async () => {
      Object.assign(process.env, {
        JWT_SECRET: randomBytes(64).toString("base64url"),
        JWT_ISSUER: "redis-cart-tests",
        JWT_AUDIENCE: "redis-cart-client",
        NODE_ENV: "test",
        REDIS_URL: "redis://127.0.0.1:6379",
        REDIS_CART_PREFIX: `marketplace:testcart:${randomUUID()}`,
      });
      client = await getRedisClient();
      assert.equal(await client.ping(), "PONG");
      tokens = {
        a: createAccessToken(userA._id.toString()),
        b: createAccessToken(userB._id.toString()),
      };
      mock.method(User, "findById", (id) => ({
        select: async () => users.get(id.toString()) ?? null,
      }));
      mock.method(Product, "findOne", (filter) => ({
        select: async () => {
          const product = products.get(filter._id.toString());
          return product?.status === filter.status ? product : null;
        },
      }));
      mock.method(Product, "find", (filter) => ({
        select: async () =>
          [...products.values()].filter(
            (product) =>
              filter._id.$in.includes(product._id.toString()) &&
              product.status === filter.status,
          ),
      }));
      server = app.listen(0, "127.0.0.1");
      await once(server, "listening");
      baseUrl = `http://127.0.0.1:${server.address().port}`;
    });
    beforeEach(async () => {
      client = await getRedisClient();
      await client.del([
        cartKey(userA._id.toString()),
        cartKey(userB._id.toString()),
      ]);
      userA.status = "active";
      products.clear();
      for (const [name, vendorId, price] of [
        ["Mug", userA._id, 19999],
        ["Shirt", userB._id, 30000],
      ]) {
        const product = new Product({
          vendorId,
          storeName: `${name} Store`,
          title: name,
          description: "A carefully made product for your everyday use.",
          category: "home",
          status: "active",
          stock: 99,
          priceInPaise: price,
        });
        await product.validate();
        products.set(product._id.toString(), product.toObject());
      }
      [productA, productB] = [...products.values()];
    });
    after(async () => {
      try {
        if (server) await new Promise((resolve) => server.close(resolve));
        if (
          process.env.REDIS_CART_PREFIX?.startsWith("marketplace:testcart:")
        ) {
          client = await getRedisClient();
          await client.del([
            cartKey(userA._id.toString()),
            cartKey(userB._id.toString()),
          ]);
        }
      } finally {
        mock.restoreAll();
        await closeRedisClient();
        for (const [key, value] of originalEnv) {
          if (value === undefined) delete process.env[key];
          else process.env[key] = value;
        }
      }
    });

    test("add, update, remove and clear work with current totals across multiple vendors", async () => {
      let result = await add(undefined, 2);
      assert.equal(result.response.status, 200, JSON.stringify(result.payload));
      assert.equal(result.payload.data.cart.summary.subtotalInPaise, 39998);
      result = await add(productB._id.toString(), 1);
      let cart = result.payload.data.cart;
      assert.equal(cart.items.length, 2);
      assert.equal(cart.summary.subtotalInPaise, 69998);
      result = await request(`/items/${productA._id}`, {
        method: "PATCH",
        version: cart.version,
        body: { quantity: 3 },
      });
      cart = result.payload.data.cart;
      assert.equal(cart.summary.subtotalInPaise, 89997);
      assert.equal(result.response.headers.get("etag"), `"${cart.version}"`);
      result = await request(`/items/${productB._id}`, {
        method: "DELETE",
        version: cart.version,
      });
      cart = result.payload.data.cart;
      assert.equal(cart.items.length, 1);
      result = await request("", { method: "DELETE", version: cart.version });
      assert.deepEqual(result.payload.data.cart.items, []);
      assert.equal(result.payload.data.cart.summary.subtotalInPaise, 0);
      assert.equal(productA.stock, 99);
    });

    test("each JWT owner has a separate cart, including reads with forged query parameters", async () => {
      await add();
      const other = await request(`?userId=${userA._id}`, { token: tokens.b });
      assert.deepEqual(other.payload.data.cart.items, []);
      await request(`/items/${productA._id}`, {
        token: tokens.b,
        method: "DELETE",
        version: "0",
      });
      assert.equal((await request()).payload.data.cart.items.length, 1);
    });

    test("concurrent adds do not lose quantities", async () => {
      const results = await Promise.all(
        Array.from({ length: 20 }, () => add()),
      );
      assert.ok(results.every((result) => result.response.status === 200));
      assert.equal((await request()).payload.data.cart.items[0].quantity, 20);
    });

    test("concurrent retries of one add operation only count once", async () => {
      const operationId = randomUUID();
      const results = await Promise.all(
        Array.from({ length: 8 }, () => add(undefined, 2, { operationId })),
      );
      assert.ok(results.every((result) => result.response.status === 200));
      assert.equal((await request()).payload.data.cart.items[0].quantity, 2);
      const conflict = await add(productB._id.toString(), 1, { operationId });
      assert.equal(conflict.response.status, 409);
      assert.equal(conflict.payload.error.code, "IDEMPOTENCY_CONFLICT");
    });

    test("a retry after clearing the cart cannot resurrect an old add", async () => {
      const operationId = randomUUID();
      const cart = (await add(undefined, 1, { operationId })).payload.data.cart;
      await request("", { method: "DELETE", version: cart.version });
      const replay = await add(undefined, 1, { operationId });
      assert.deepEqual(replay.payload.data.cart.items, []);
    });

    test("stock and quantity limits hold under competing writes", async () => {
      await add(undefined, 98);
      const results = await Promise.all([add(), add()]);
      assert.deepEqual(
        results.map((result) => result.response.status).sort(),
        [200, 409],
      );
      assert.equal((await request()).payload.data.cart.items[0].quantity, 99);
      productB.stock = 0;
      assert.equal(
        (await add(productB._id.toString())).payload.error.code,
        "CART_STOCK_LIMIT",
      );
    });

    test("stale update and clear revisions cannot overwrite another tab", async () => {
      const old = (await add()).payload.data.cart;
      await add(productB._id.toString());
      const changed = await request(`/items/${productA._id}`, {
        method: "PATCH",
        version: old.version,
        body: { quantity: 5 },
      });
      assert.equal(changed.payload.error.code, "CART_CHANGED");
      assert.equal(
        (await request("", { method: "DELETE", version: old.version })).payload
          .error.code,
        "CART_CHANGED",
      );
      assert.equal((await request()).payload.data.cart.items.length, 2);
    });

    test("prices and stock are re-read, and hidden products reveal no private fields", async () => {
      let cart = (await add(undefined, 5)).payload.data.cart;
      productA.priceInPaise = 25000;
      assert.equal(
        (await request()).payload.data.cart.summary.subtotalInPaise,
        125000,
      );
      productA.stock = 2;
      cart = (await request()).payload.data.cart;
      assert.equal(cart.items[0].issue, "INSUFFICIENT_STOCK");
      assert.equal(cart.summary.subtotalInPaise, 0);
      const updated = await request(`/items/${productA._id}`, {
        method: "PATCH",
        version: cart.version,
        body: { quantity: 2 },
      });
      assert.equal(updated.response.status, 200);
      productA.status = "draft";
      productA.title = "DO_NOT_EXPOSE_PRIVATE_DRAFT";
      const hidden = await request();
      assert.equal(hidden.payload.data.cart.items[0].product, null);
      assert.equal(
        JSON.stringify(hidden.payload).includes("DO_NOT_EXPOSE"),
        false,
      );
      cart = hidden.payload.data.cart;
      assert.equal(
        (
          await request(`/items/${productA._id}`, {
            method: "DELETE",
            version: cart.version,
          })
        ).response.status,
        200,
      );
    });

    test("carts survive reconnection and have a bounded lifetime", async () => {
      await add();
      const key = cartKey(userA._id.toString());
      const ttl = await client.ttl(key);
      assert.ok(
        ttl > CART_LIMITS.ttlSeconds - 10 && ttl <= CART_LIMITS.ttlSeconds,
      );
      await closeRedisClient();
      assert.equal((await request()).payload.data.cart.items.length, 1);
      client = await getRedisClient();
      await client.expire(key, 1);
      await new Promise((resolve) => setTimeout(resolve, 1100));
      assert.deepEqual((await request()).payload.data.cart.items, []);
    });

    test("full carts reject a new product without changing existing items", async () => {
      const fields = Object.fromEntries(
        Array.from({ length: 50 }, (_, index) => [
          (index + 1).toString(16).padStart(24, "0"),
          "1",
        ]),
      );
      await client.hSet(cartKey(userA._id.toString()), {
        ...fields,
        _version: randomUUID(),
      });
      const result = await add();
      assert.equal(result.payload.error.code, "CART_FULL");
      assert.equal(await client.hLen(cartKey(userA._id.toString())), 51);
    });

    test("disabled users are denied before reading an existing cart", async () => {
      await add();
      userA.status = "disabled";
      assert.equal((await request()).response.status, 401);
    });

    test("Redis connection failures are safe and recovery preserves stored items", async (context) => {
      await add();
      context.mock.method(console, "error", () => {});
      await closeRedisClient();
      process.env.REDIS_URL = "redis://127.0.0.1:1";
      try {
        const failed = await request();
        assert.equal(failed.response.status, 503);
        assert.equal(failed.payload.error.code, "CART_UNAVAILABLE");
        assert.equal(
          JSON.stringify(failed.payload).includes("127.0.0.1"),
          false,
        );
      } finally {
        process.env.REDIS_URL = "redis://127.0.0.1:6379";
      }
      assert.equal((await request()).payload.data.cart.items.length, 1);
    });
  },
);
