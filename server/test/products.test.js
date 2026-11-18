import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { after, before, beforeEach, describe, mock, test } from "node:test";
import sharp from "sharp";
import { app } from "../src/app.js";
import { User } from "../src/models/userModel.js";
import { Vendor } from "../src/models/vendorModel.js";
import { Product } from "../src/models/productModel.js";
import { createAccessToken } from "../src/services/tokenService.js";
import { productImageStorage } from "../src/services/productImageStorage.js";
import { getImageStorageConfig } from "../src/config/s3.js";

describe(
  "Product CRUD and image HTTP flow (database and S3 operations simulated)",
  { concurrency: false },
  () => {
    let server;
    let baseUrl;
    let accounts;
    let profiles;
    let tokens;
    let png;
    let failWrite = false;
    let loseImageRace = false;
    const users = new Map();
    const vendors = new Map();
    const products = new Map();
    const objects = new Map();
    const removed = [];
    const originalEnv = Object.fromEntries(
      [
        "JWT_SECRET",
        "JWT_ISSUER",
        "JWT_AUDIENCE",
        "AWS_REGION",
        "S3_BUCKET",
      ].map((key) => [key, process.env[key]]),
    );
    const input = {
      title: "  Everyday Mug  ",
      description: "A durable ceramic mug for your everyday tea and coffee.",
      category: " Home ",
      priceInPaise: 49999,
      stock: 12,
      status: "draft",
    };
    const matches = (record, filter) =>
      Object.entries(filter).every(([key, value]) => {
        const actual =
          key === "image.key" ? (record.image?.key ?? null) : record[key];
        return value?.$ne !== undefined
          ? actual !== value.$ne
          : actual?.toString() === value?.toString();
      });
    const query = (execute) => ({
      select: async () => execute(),
      then: (resolve, reject) =>
        Promise.resolve().then(execute).then(resolve, reject),
    });
    const request = async (
      path,
      { token = tokens.seller, body, method = "GET" } = {},
    ) => {
      const response = await fetch(`${baseUrl}/api${path}`, {
        method,
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      return {
        response,
        payload: response.status === 204 ? null : await response.json(),
      };
    };
    const create = async (body = input, token = tokens.seller) =>
      request("/vendor/products", { token, body, method: "POST" });
    const upload = async (
      id,
      buffer = png,
      type = "image/png",
      token = tokens.seller,
    ) => {
      const form = new FormData();
      if (buffer)
        form.append("image", new Blob([buffer], { type }), "cover.png");
      const response = await fetch(
        `${baseUrl}/api/vendor/products/${id}/image`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: form,
        },
      );
      return { response, payload: await response.json() };
    };

    before(async () => {
      Object.assign(process.env, {
        JWT_SECRET: randomBytes(64).toString("base64url"),
        JWT_ISSUER: "product-tests",
        JWT_AUDIENCE: "product-client-tests",
      });
      png = await sharp({
        create: { width: 24, height: 16, channels: 3, background: "#225544" },
      })
        .png()
        .toBuffer();
      mock.method(User, "findById", (id) => ({
        select: async () => users.get(id.toString()) || null,
      }));
      mock.method(Vendor, "findOne", (filter) => ({
        select: async () =>
          [...vendors.values()].find((vendor) => matches(vendor, filter)) ||
          null,
      }));
      mock.method(Product, "create", async (data) => {
        const doc = new Product(data);
        await doc.validate();
        const record = {
          ...doc.toObject(),
          createdAt: new Date(),
          updatedAt: new Date(),
          internalNote: "DO_NOT_EXPOSE_INTERNAL_NOTE",
        };
        products.set(record._id.toString(), record);
        return record;
      });
      mock.method(Product, "findOne", (filter) =>
        query(
          () =>
            [...products.values()].find((product) =>
              matches(product, filter),
            ) || null,
        ),
      );
      mock.method(Product, "findOneAndUpdate", (filter, update, options) =>
        query(async () => {
          assert.equal(options.runValidators, true);
          if (failWrite) throw new Error("DO_NOT_EXPOSE_WRITE_FAILURE");
          const existing = [...products.values()].find((product) =>
            matches(product, filter),
          );
          if (!existing) return null;
          if (loseImageRace && update.$set.image) return null;
          const doc = new Product({
            ...existing,
            ...update.$set,
            ...(update.$inc?.searchVersion
              ? {
                  searchVersion:
                    (existing.searchVersion ?? 0) + update.$inc.searchVersion,
                }
              : {}),
            updatedAt: new Date(),
          });
          await doc.validate();
          products.set(doc._id.toString(), doc.toObject());
          return doc;
        }),
      );
      mock.method(Product, "find", (filter) => {
        let offset = 0;
        let limit = 12;
        const list = {
          select: () => list,
          sort: () => list,
          skip: (value) => {
            offset = value;
            return list;
          },
          limit: (value) => {
            limit = value;
            return list;
          },
          then: (resolve, reject) =>
            Promise.resolve(
              [...products.values()]
                .filter((item) => matches(item, filter))
                .slice(offset, offset + limit),
            ).then(resolve, reject),
        };
        return list;
      });
      mock.method(
        Product,
        "countDocuments",
        async (filter) =>
          [...products.values()].filter((product) => matches(product, filter))
            .length,
      );
      mock.method(productImageStorage, "upload", async (key, bytes) => {
        objects.set(key, bytes);
      });
      mock.method(
        productImageStorage,
        "sign",
        async (key) => `https://images.example.test/${key}?signed=true`,
      );
      mock.method(productImageStorage, "remove", async (key) => {
        removed.push(key);
        objects.delete(key);
      });
      server = app.listen(0, "127.0.0.1");
      await once(server, "listening");
      baseUrl = `http://127.0.0.1:${server.address().port}`;
    });

    beforeEach(async () => {
      users.clear();
      vendors.clear();
      products.clear();
      objects.clear();
      removed.length = 0;
      failWrite = false;
      loseImageRace = false;
      accounts = {};
      profiles = {};
      tokens = {};
      for (const [name, roles, status] of [
        ["seller", ["customer", "vendor"], "approved"],
        ["other", ["vendor"], "approved"],
        ["pending", ["vendor"], "pending"],
        ["customer", ["customer"], "pending"],
        ["admin", ["admin"], "pending"],
      ]) {
        const user = new User({
          name: `Test ${name}`,
          emailNormalized: `${name}@example.com`,
          passwordHash: "not-used",
          roles,
          createdAt: new Date(),
        });
        await user.validate();
        users.set(user._id.toString(), user.toObject());
        accounts[name] = user.toObject();
        const vendor = new Vendor({
          ownerId: user._id,
          storeName: `Store ${name}`,
          description: "Quality products for every day.",
          status,
        });
        await vendor.validate();
        vendors.set(vendor._id.toString(), vendor.toObject());
        profiles[name] = vendor.toObject();
        tokens[name] = createAccessToken(user._id.toString());
      }
    });
    after(async () => {
      if (server) await new Promise((resolve) => server.close(resolve));
      mock.restoreAll();
      for (const [key, value] of Object.entries(originalEnv)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    });

    test("requires an authenticated vendor with an approved profile", async () => {
      assert.equal((await create(input, null)).response.status, 401);
      for (const name of ["customer", "admin", "pending"])
        assert.equal((await create(input, tokens[name])).response.status, 403);
      users.get(accounts.seller._id.toString()).status = "disabled";
      assert.equal((await create()).response.status, 401);
      assert.equal(products.size, 0);
    });

    test("creates a normalized product with fixed vendor ownership and integer money", async () => {
      const { response, payload } = await create();
      assert.equal(response.status, 201);
      assert.equal(payload.data.product.title, "Everyday Mug");
      assert.equal(payload.data.product.category, "home");
      assert.equal(
        payload.data.product.vendorId,
        profiles.seller._id.toString(),
      );
      assert.equal(payload.data.product.storeName, "Store seller");
      assert.equal(payload.data.product.priceInPaise, 49999);
      assert.equal(payload.data.product.currency, "INR");
      assert.equal(payload.data.product.imageUrl, null);
      assert.equal(JSON.stringify(payload).includes("DO_NOT_EXPOSE"), false);
    });

    test("rejects invalid values and injected ownership, currency and image metadata", async () => {
      for (const body of [
        { ...input, vendorId: profiles.other._id.toString() },
        { ...input, currency: "USD" },
        { ...input, image: { key: "foreign" } },
        { ...input, priceInPaise: 1.5 },
        { ...input, priceInPaise: 0 },
        { ...input, priceInPaise: 100000001 },
        { ...input, stock: -1 },
        { ...input, stock: 0.5 },
        { ...input, title: " A " },
        { ...input, description: "short" },
        { ...input, status: "archived" },
      ])
        assert.equal((await create(body)).response.status, 422);
      assert.equal(products.size, 0);
    });

    test("vendor lists are scoped and drafts stay out of public reads", async () => {
      const draft = (await create()).payload.data.product;
      await create({ ...input, status: "active" }, tokens.other);
      const own = await request("/vendor/products");
      assert.deepEqual(
        own.payload.data.products.map((item) => item.id),
        [draft.id],
      );
      const publicList = await request("/products", { token: null });
      assert.equal(publicList.payload.data.products.length, 1);
      assert.equal(
        publicList.payload.data.products[0].vendorId,
        profiles.other._id.toString(),
      );
      assert.equal(
        (await request(`/products/${draft.id}`, { token: null })).response
          .status,
        404,
      );
    });

    test("other vendors cannot read, edit, archive or upload to a product", async () => {
      const product = (await create()).payload.data.product;
      for (const options of [
        {},
        { method: "PATCH", body: { stock: 99 } },
        { method: "DELETE" },
      ]) {
        assert.equal(
          (
            await request(`/vendor/products/${product.id}`, {
              token: tokens.other,
              ...options,
            })
          ).response.status,
          404,
        );
      }
      assert.equal(
        (await upload(product.id, png, "image/png", tokens.other)).response
          .status,
        404,
      );
      assert.equal(objects.size, 0);
      assert.equal(products.get(product.id).stock, 12);
    });

    test("edits allowlisted fields and publishing exposes the product to the catalog", async () => {
      const product = (await create()).payload.data.product;
      assert.equal(
        (
          await request(`/vendor/products/${product.id}`, {
            method: "PATCH",
            body: {},
          })
        ).response.status,
        422,
      );
      const updated = await request(`/vendor/products/${product.id}`, {
        method: "PATCH",
        body: { status: "active", priceInPaise: 29950, stock: 3 },
      });
      assert.equal(updated.response.status, 200);
      const publicRead = await request(`/products/${product.id}`, {
        token: null,
      });
      assert.equal(publicRead.payload.data.product.priceInPaise, 29950);
      assert.equal(publicRead.payload.data.product.stock, 3);
      assert.equal(
        (
          await request(`/vendor/products/${product.id}`, {
            method: "PATCH",
            body: { vendorId: profiles.other._id.toString() },
          })
        ).response.status,
        422,
      );
    });

    test("invalid IDs and unbounded pagination fail before database casts", async () => {
      assert.equal(
        (await request("/products/not-an-id", { token: null })).response.status,
        422,
      );
      for (const path of [
        "/products?limit=51",
        "/products?page=0",
        "/products?status=draft",
        "/vendor/products?limit=-1",
      ]) {
        assert.equal((await request(path)).response.status, 422);
      }
    });

    test("delete archives a product and hides it from public and vendor lists", async () => {
      const product = (await create({ ...input, status: "active" })).payload
        .data.product;
      assert.equal(
        (await request(`/vendor/products/${product.id}`, { method: "DELETE" }))
          .response.status,
        204,
      );
      assert.equal(products.get(product.id).status, "archived");
      assert.equal(
        (await request("/products", { token: null })).payload.data.products
          .length,
        0,
      );
      assert.equal(
        (await request("/vendor/products")).payload.data.products.length,
        0,
      );
      assert.equal(
        (
          await request(`/vendor/products/${product.id}`, {
            method: "PATCH",
            body: { stock: 1 },
          })
        ).response.status,
        404,
      );
    });

    test("valid uploads are decoded and converted to WebP under a server-generated key", async () => {
      const product = (await create()).payload.data.product;
      const result = await upload(product.id);
      assert.equal(result.response.status, 200, JSON.stringify(result.payload));
      const [[key, bytes]] = [...objects];
      assert.match(
        key,
        new RegExp(
          `^product-images/${profiles.seller._id}/${product.id}/[a-f0-9-]+\\.webp$`,
        ),
      );
      assert.equal((await sharp(bytes).metadata()).format, "webp");
      assert.equal(products.get(product.id).image.width, 24);
      assert.match(
        result.payload.data.product.imageUrl,
        /^https:\/\/images\.example\.test\//,
      );
      assert.equal(Object.hasOwn(result.payload.data.product, "image"), false);
      await upload(product.id);
      assert.deepEqual(removed, [key]);
      assert.equal(objects.size, 1);
    });

    test("missing, unsupported, corrupt and oversized uploads receive safe errors", async () => {
      const product = (await create()).payload.data.product;
      assert.equal((await upload(product.id, null)).response.status, 422);
      assert.equal(
        (await upload(product.id, Buffer.from("<svg/>"), "image/svg+xml"))
          .response.status,
        415,
      );
      assert.equal(
        (await upload(product.id, Buffer.from("not a real image"))).response
          .status,
        422,
      );
      const tooLarge = await upload(
        product.id,
        Buffer.alloc(5 * 1024 * 1024 + 1),
      );
      assert.equal(
        tooLarge.response.status,
        413,
        JSON.stringify(tooLarge.payload),
      );
      assert.equal(objects.size, 0);
    });

    test("oversized pixel dimensions are rejected before storage", async () => {
      const product = (await create()).payload.data.product;
      const large = await sharp({
        create: { width: 5000, height: 4100, channels: 3, background: "white" },
      })
        .png()
        .toBuffer();
      assert.equal((await upload(product.id, large)).response.status, 422);
      assert.equal(objects.size, 0);
    });

    test("missing S3 setup returns 503 while product CRUD remains available", async (context) => {
      delete process.env.AWS_REGION;
      delete process.env.S3_BUCKET;
      context.mock.method(productImageStorage, "upload", async () =>
        getImageStorageConfig(),
      );
      const product = (await create()).payload.data.product;
      const result = await upload(product.id);
      assert.equal(result.response.status, 503);
      assert.equal(result.payload.error.code, "IMAGE_STORAGE_UNAVAILABLE");
      assert.equal(products.get(product.id).image, null);
      assert.equal(
        (
          await request(`/vendor/products/${product.id}`, {
            method: "PATCH",
            body: { stock: 6 },
          })
        ).response.status,
        200,
      );
    });

    test("failed database attachment removes the newly uploaded object", async (context) => {
      context.mock.method(console, "error", () => {});
      const product = (await create()).payload.data.product;
      failWrite = true;
      const result = await upload(product.id);
      assert.equal(result.response.status, 500);
      assert.equal(
        JSON.stringify(result.payload).includes("DO_NOT_EXPOSE"),
        false,
      );
      assert.equal(objects.size, 0);
      assert.equal(removed.length, 1);
      assert.equal(products.get(product.id).image, null);
    });

    test("a competing image update returns conflict and cleans up the losing upload", async () => {
      const product = (await create()).payload.data.product;
      loseImageRace = true;
      const result = await upload(product.id);
      assert.equal(result.response.status, 409);
      assert.equal(result.payload.error.code, "PRODUCT_CHANGED");
      assert.equal(objects.size, 0);
      assert.equal(removed.length, 1);
    });

    test("Mongoose also rejects fractional money and stock on internal writes", async () => {
      for (const patch of [
        { priceInPaise: 1.5 },
        { stock: 0.5 },
        { currency: "USD" },
      ]) {
        await assert.rejects(
          new Product({
            ...input,
            vendorId: profiles.seller._id,
            storeName: "Store seller",
            ...patch,
          }).validate(),
          { name: "ValidationError" },
        );
      }
    });

    test("creation, edits and archives durably queue search revisions without exposing internal fields", async () => {
      const created = await create();
      const id = created.payload.data.product.id;
      assert.equal(products.get(id).searchVersion, 1);
      assert.equal(products.get(id).searchSyncPending, true);
      assert.equal(
        Object.hasOwn(created.payload.data.product, "searchVersion"),
        false,
      );
      products.get(id).searchSyncPending = false;
      await request(`/vendor/products/${id}`, {
        method: "PATCH",
        body: { stock: 7 },
      });
      assert.equal(products.get(id).searchVersion, 2);
      assert.equal(products.get(id).searchSyncPending, true);
      products.get(id).searchSyncPending = false;
      await request(`/vendor/products/${id}`, { method: "DELETE" });
      assert.equal(products.get(id).searchVersion, 3);
      assert.equal(products.get(id).searchSyncPending, true);
    });
  },
);
