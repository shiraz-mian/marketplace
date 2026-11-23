import assert from "node:assert/strict";
import { once } from "node:events";
import { after, before, describe, test } from "node:test";
import { app } from "../src/app.js";
import { Product } from "../src/models/productModel.js";

describe("Product suggestions", { concurrency: false }, () => {
  let server, base;
  before(async () => {
    server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    base = `http://127.0.0.1:${server.address().port}/api/products/suggestions`;
  });
  after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
  });

  test("uses the autocomplete index, limits results and excludes inactive products", async (context) => {
    context.mock.method(Product, "aggregate", async (pipeline) => {
      assert.equal(pipeline[0].$search.index, "marketplace_suggestions");
      const choices = pipeline[0].$search.compound.should;
      assert.deepEqual(
        choices.map((choice) => choice.autocomplete.path),
        ["title", "storeName"],
      );
      assert.ok(choices.every((choice) => choice.autocomplete.query === "mu"));
      assert.deepEqual(pipeline[1], { $match: { status: "active" } });
      assert.deepEqual(pipeline[2], { $limit: 5 });
      return [
        { _id: "507f1f77bcf86cd799439011", title: "Mug", storeName: "Store" },
      ];
    });
    const response = await fetch(`${base}?q=mu`);
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.deepEqual(payload.data.suggestions, [
      { id: "507f1f77bcf86cd799439011", title: "Mug", storeName: "Store" },
    ]);
  });
  test("reports missing or building indexes instead of empty suggestions", async (context) => {
    context.mock.method(Product, "aggregate", async () => []);
    context.mock.method(Product.collection, "listSearchIndexes", () => ({
      toArray: async () => [],
    }));
    const response = await fetch(`${base}?q=mu`);
    assert.equal(response.status, 503);
    assert.equal((await response.json()).error.code, "SEARCH_UNAVAILABLE");
  });
  test("allows a genuine empty suggestion result when the index is ready", async (context) => {
    context.mock.method(Product, "aggregate", async () => []);
    context.mock.method(Product.collection, "listSearchIndexes", () => ({
      toArray: async () => [
        { name: "marketplace_suggestions", queryable: true },
      ],
    }));
    const response = await fetch(`${base}?q=zzzz`);
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).data.suggestions, []);
  });
  test("rejects missing, short and unexpected query parameters", async (context) => {
    const aggregate = context.mock.method(Product, "aggregate", () => {
      throw Error("Should not query");
    });
    for (const q of [
      "",
      "?q=m",
      "?q=mu&status=draft",
      `?q=${"a".repeat(101)}`,
    ]) {
      assert.equal((await fetch(base + q)).status, 422);
    }
    assert.equal(aggregate.mock.callCount(), 0);
  });
});
