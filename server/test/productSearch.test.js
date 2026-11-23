import assert from "node:assert/strict";
import { once } from "node:events";
import { after, before, describe, test } from "node:test";
import { app } from "../src/app.js";
import { Product } from "../src/models/productModel.js";
import { productSearchSchema } from "../src/validators/productSearchValidator.js";
import { buildProductSearchQuery } from "../src/services/productSearchQuery.js";

describe("MongoDB product search", { concurrency: false }, () => {
  let server, base;
  before(async () => {
    server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    base = `http://127.0.0.1:${server.address().port}/api/products/search`;
  });
  after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
  });

  test("builds Atlas Search followed by current product filters and pagination", () => {
    const input = productSearchSchema.parse({
      q: "mug",
      category: "HOME",
      vendorId: "000000000000000000000010",
      minPriceInPaise: "0",
      maxPriceInPaise: "50000",
      inStock: "true",
      sort: "price_asc",
      page: "2",
      limit: "5",
    });
    const pipeline = buildProductSearchQuery(input);
    assert.equal(pipeline[0].$search.index, "marketplace_products");
    assert.equal(pipeline[0].$search.compound.should[0].text.query, "mug");
    assert.equal(pipeline[1].$match.status, "active");
    assert.equal(pipeline[1].$match.category, "home");
    assert.equal(String(pipeline[1].$match.vendorId), input.vendorId);
    assert.deepEqual(pipeline[1].$match.priceInPaise, { $gte: 0, $lte: 50000 });
    assert.deepEqual(pipeline[1].$match.stock, { $gt: 0 });
    assert.deepEqual(pipeline[2].$facet.products, [
      { $sort: { priceInPaise: 1, _id: 1 } },
      { $skip: 5 },
      { $limit: 5 },
    ]);
  });
  test("empty query reads MongoDB without requiring the search index", () => {
    const pipeline = buildProductSearchQuery(
      productSearchSchema.parse({ inStock: "false" }),
    );
    assert.deepEqual(pipeline[0].$match, {
      status: "active",
      stock: { $lte: 0 },
    });
    assert.deepEqual(pipeline[1].$facet.products[0], {
      $sort: { createdAt: -1, _id: 1 },
    });
  });
  test("valid search returns the existing response shape", async (context) => {
    const product = new Product({
      _id: "000000000000000000000001",
      vendorId: "000000000000000000000010",
      storeName: "Store",
      title: "Ceramic Mug",
      description: "A ceramic mug for your daily tea.",
      category: "home",
      priceInPaise: 25000,
      stock: 5,
      status: "active",
    }).toObject();
    context.mock.method(Product, "aggregate", async () => [
      { products: [product], count: [{ total: 1 }] },
    ]);
    const response = await fetch(`${base}?q=mug`);
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.data.products[0].title, "Ceramic Mug");
    assert.deepEqual(payload.data.pagination, {
      page: 1,
      limit: 12,
      total: 1,
      totalPages: 1,
    });
  });
  test("reports an unavailable keyword index instead of an empty catalog", async (context) => {
    context.mock.method(Product, "aggregate", async () => [
      { products: [], count: [] },
    ]);
    context.mock.method(Product.collection, "listSearchIndexes", () => ({
      toArray: async () => [],
    }));
    const response = await fetch(`${base}?q=mug`);
    assert.equal(response.status, 503);
    assert.equal((await response.json()).error.code, "SEARCH_UNAVAILABLE");
  });
  test("returns no matches when the keyword index is ready", async (context) => {
    context.mock.method(Product, "aggregate", async () => [
      { products: [], count: [] },
    ]);
    context.mock.method(Product.collection, "listSearchIndexes", () => ({
      toArray: async () => [{ name: "marketplace_products", queryable: true }],
    }));
    const response = await fetch(`${base}?q=zzzz`);
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).data.products, []);
  });
  test("invalid filters are rejected before MongoDB is queried", async (context) => {
    const aggregate = context.mock.method(Product, "aggregate", () => {
      throw new Error("Unexpected database call");
    });
    for (const query of [
      "?page=0",
      "?limit=51",
      "?inStock=1",
      "?status=draft",
      "?minPriceInPaise=300&maxPriceInPaise=200",
    ]) {
      assert.equal((await fetch(base + query)).status, 422);
    }
    assert.equal(aggregate.mock.callCount(), 0);
  });
});
