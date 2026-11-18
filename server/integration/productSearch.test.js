import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { performance } from "node:perf_hooks";
import { after, before, beforeEach, describe, mock, test } from "node:test";
import { app } from "../src/app.js";
import { Product } from "../src/models/productModel.js";
import {
  getSearchClient,
  closeSearchClient,
} from "../src/config/elasticsearch.js";
import { productSearchIndex } from "../src/services/productSearchIndex.js";
import { syncPendingProducts } from "../src/services/productSearchSync.js";

describe(
  "Real local Elasticsearch search (isolated index, MongoDB simulated)",
  { skip: process.env.ELASTICSEARCH_INTEGRATION !== "1", concurrency: false },
  () => {
    const testIndex = `marketplace-test-${randomUUID()}`;
    const vendorA = "00000000000000000000000a";
    const vendorB = "00000000000000000000000b";
    const id = (value) => value.toString(16).padStart(24, "0");
    const records = new Map();
    const durations = [];
    const envKeys = [
      "NODE_ENV",
      "ELASTICSEARCH_URL",
      "ELASTICSEARCH_INDEX",
      "ELASTICSEARCH_API_KEY",
    ];
    const originalEnv = envKeys.map((key) => [key, process.env[key]]);
    let server;
    let baseUrl;
    let client;
    let fixtureVersion = 0;

    const matches = (product, filter) =>
      Object.entries(filter).every(([key, expected]) => {
        const actual = product[key];
        if (expected && typeof expected === "object") {
          if (expected.$in) return expected.$in.includes(actual.toString());
          if (expected.$gt !== undefined && !(actual > expected.$gt))
            return false;
          if (expected.$gte !== undefined && !(actual >= expected.$gte))
            return false;
          if (expected.$lte !== undefined && !(actual <= expected.$lte))
            return false;
          return true;
        }
        return actual?.toString() === expected?.toString();
      });
    const request = async (query = "") => {
      const start = performance.now();
      const response = await fetch(`${baseUrl}/api/products/search${query}`);
      const payload = await response.json();
      durations.push(performance.now() - start);
      return { response, payload };
    };
    const resultIds = (result) =>
      result.payload.data.products.map((product) => product.id);

    before(async () => {
      Object.assign(process.env, {
        NODE_ENV: "test",
        ELASTICSEARCH_URL: "http://127.0.0.1:9200",
        ELASTICSEARCH_INDEX: testIndex,
      });
      delete process.env.ELASTICSEARCH_API_KEY;
      client = getSearchClient();
      await client.ping();
      await productSearchIndex.ensure();
      mock.method(Product, "find", (filter) => {
        let limit = Infinity;
        const execute = () =>
          [...records.values()]
            .filter((product) => matches(product, filter))
            .slice(0, limit)
            .map((product) => ({ ...product }));
        const query = {
          select: () => query,
          sort: () => query,
          limit: (value) => {
            limit = value;
            return query;
          },
          lean: async () => execute(),
          then: (resolve, reject) =>
            Promise.resolve(execute()).then(resolve, reject),
        };
        return query;
      });
      mock.method(Product, "updateOne", async (filter, update) => {
        const current = records.get(filter._id.toString());
        if (!current || current.searchVersion !== filter.searchVersion)
          return { modifiedCount: 0 };
        Object.assign(current, update.$set);
        return { modifiedCount: 1 };
      });
      server = app.listen(0, "127.0.0.1");
      await once(server, "listening");
      baseUrl = `http://127.0.0.1:${server.address().port}`;
    });

    beforeEach(async () => {
      await client.deleteByQuery({
        index: testIndex,
        query: { match_all: {} },
        refresh: true,
      });
      records.clear();
      // Elasticsearch retains delete-version history. New fixtures must be newer.
      fixtureVersion += 10;
      const data = [
        [1, "Ceramic Mug", "home", 25000, 5, "active", vendorA],
        [2, "Travel Mug", "home", 45000, 3, "active", vendorA],
        [3, "Cotton Shirt", "clothing", 35000, 4, "active", vendorB],
        [4, "Ceramic Bowl", "home", 15000, 0, "active", vendorA],
        [5, "Draft Mug", "home", 10000, 3, "draft", vendorA],
        [6, "Archived Mug", "home", 10000, 3, "archived", vendorA],
        [7, "Glass Mug", "home", 25000, 8, "active", vendorB],
      ];
      for (const [
        number,
        title,
        category,
        priceInPaise,
        stock,
        status,
        vendorId,
      ] of data) {
        const doc = new Product({
          _id: id(number),
          vendorId,
          title,
          category,
          priceInPaise,
          stock,
          status,
          storeName: vendorId === vendorA ? "Everyday Home" : "Weekend Store",
          description: `${title} is a carefully made product for everyday use.`,
          createdAt: new Date(Date.UTC(2026, 9, 20 + number)),
          updatedAt: new Date(),
          searchVersion: fixtureVersion,
        });
        await doc.validate();
        records.set(doc._id.toString(), doc.toObject());
        await productSearchIndex.indexProduct(doc.toObject());
      }
      await client.indices.refresh({ index: testIndex });
    });

    after(async () => {
      try {
        if (server) await new Promise((resolve) => server.close(resolve));
        if (client)
          await client.indices.delete({ index: testIndex }, { ignore: [404] });
        if (durations.length) {
          const ordered = [...durations].sort((a, b) => a - b);
          console.log(
            JSON.stringify({
              localSearchSamples: ordered.length,
              medianMs: Number(
                ordered[Math.floor(ordered.length / 2)].toFixed(1),
              ),
              p95Ms: Number(
                ordered[Math.ceil(ordered.length * 0.95) - 1].toFixed(1),
              ),
              scope:
                "7 fixtures; real Elasticsearch and HTTP; simulated MongoDB; not a load benchmark",
            }),
          );
        }
      } finally {
        mock.restoreAll();
        await closeSearchClient();
        for (const [key, value] of originalEnv) {
          if (value === undefined) delete process.env[key];
          else process.env[key] = value;
        }
      }
    });

    test("keyword, category, price and stock filters work together through HTTP", async () => {
      const result = await request(
        "?q=ceramic&category=HOME&maxPriceInPaise=30000&inStock=true",
      );
      assert.equal(result.response.status, 200, JSON.stringify(result.payload));
      assert.deepEqual(resultIds(result), [id(1)]);
      assert.equal(result.payload.data.pagination.total, 1);
    });

    test("bounded typo tolerance matches a misspelled product name", async () => {
      assert.deepEqual(resultIds(await request("?q=cermaic%20mug")), [id(1)]);
    });

    test("price sorting has stable ties and correct pagination totals", async () => {
      const result = await request("?sort=price_asc&page=2&limit=2");
      assert.deepEqual(resultIds(result), [id(7), id(3)]);
      assert.deepEqual(result.payload.data.pagination, {
        page: 2,
        limit: 2,
        total: 5,
        totalPages: 3,
      });
      assert.deepEqual(resultIds(await request("?sort=price_desc")), [
        id(2),
        id(3),
        id(1),
        id(7),
        id(4),
      ]);
    });

    test("newest sorting and empty-keyword relevance agree", async () => {
      const expected = [id(7), id(4), id(3), id(2), id(1)];
      assert.deepEqual(resultIds(await request("?sort=newest")), expected);
      assert.deepEqual(resultIds(await request()), expected);
    });

    test("vendor and out-of-stock filters work", async () => {
      assert.deepEqual(
        resultIds(
          await request(`?vendorId=${vendorA.toUpperCase()}&inStock=false`),
        ),
        [id(4)],
      );
    });

    test("drafts and archived documents are excluded by Elasticsearch", async () => {
      const result = await request("?q=mug");
      assert.equal(result.payload.data.pagination.total, 3);
      assert.deepEqual(
        new Set(resultIds(result)),
        new Set([id(1), id(2), id(7)]),
      );
    });

    test("MongoDB hides a product immediately while its index is stale", async () => {
      records.get(id(1)).status = "draft";
      records.get(id(1)).searchVersion++;
      const result = await request("?q=ceramic%20mug");
      assert.equal(result.payload.data.pagination.total, 1);
      assert.deepEqual(resultIds(result), []);
    });

    test("current MongoDB filter values override stale indexed prices", async () => {
      records.get(id(1)).priceInPaise = 60000;
      assert.deepEqual(
        resultIds(await request("?q=ceramic%20mug&maxPriceInPaise=30000")),
        [],
      );
    });

    test("old updates and duplicate retries cannot resurrect an archived product", async () => {
      const current = records.get(id(1));
      const archivedVersion = current.searchVersion + 2;
      await productSearchIndex.indexProduct({
        ...current,
        searchVersion: archivedVersion,
        status: "archived",
      });
      await productSearchIndex.indexProduct({
        ...current,
        searchVersion: archivedVersion - 1,
        status: "active",
      });
      await productSearchIndex.indexProduct({
        ...current,
        searchVersion: archivedVersion,
        status: "active",
      });
      await client.indices.refresh({ index: testIndex });
      const stored = await client.get({ index: testIndex, id: id(1) });
      assert.equal(stored._version, archivedVersion);
      assert.equal(stored._source.status, "archived");
      assert.deepEqual(resultIds(await request("?q=ceramic%20mug")), []);
    });

    test("the worker publishes changed data and acknowledges only its revision", async () => {
      const current = records.get(id(1));
      current.searchVersion++;
      current.title = "Blue Espresso Cup";
      const batch = await syncPendingProducts();
      assert.equal(batch.failed, 0);
      assert.equal(batch.synced, 7);
      assert.equal(records.get(id(1)).searchSyncPending, false);
      await client.indices.refresh({ index: testIndex });
      assert.deepEqual(resultIds(await request("?q=espresso")), [id(1)]);
    });

    test("query syntax is treated as text rather than an executable search expression", async () => {
      const result = await request("?q=*%3A*");
      assert.equal(result.response.status, 200);
      assert.deepEqual(resultIds(result), []);
    });

    test("provider errors and timed-out searches return safe 503 responses", async (context) => {
      context.mock.method(console, "error", () => {});
      const fault = context.mock.method(client, "search", async () => {
        throw new Error("PRIVATE_PROVIDER_FAILURE");
      });
      const unavailable = await request("?q=mug");
      assert.equal(unavailable.response.status, 503);
      assert.equal(unavailable.payload.error.code, "SEARCH_UNAVAILABLE");
      assert.equal(
        JSON.stringify(unavailable.payload).includes(
          "PRIVATE_PROVIDER_FAILURE",
        ),
        false,
      );
      fault.mock.restore();
      context.mock.method(client, "search", async () => ({ timed_out: true }));
      assert.equal((await request("?q=mug")).response.status, 503);
    });
  },
);
