import assert from "node:assert/strict";
import { once } from "node:events";
import { after, before, describe, test } from "node:test";
import { app } from "../src/app.js";
import { Product } from "../src/models/productModel.js";
import { productSearchSchema } from "../src/validators/productSearchValidator.js";
import { buildProductSearchQuery } from "../src/services/productSearchQuery.js";
import {
  productSearchIndex,
  toSearchDocument,
} from "../src/services/productSearchIndex.js";
import { syncPendingProducts } from "../src/services/productSearchSync.js";
import { getSearchConfig } from "../src/config/elasticsearch.js";
import { ApiError } from "../src/utils/ApiError.js";

const fixture = (overrides = {}) =>
  new Product({
    _id: "000000000000000000000001",
    vendorId: "000000000000000000000010",
    storeName: "Everyday store",
    title: "Ceramic Mug",
    description: "A ceramic mug for your everyday tea and coffee.",
    category: "home",
    priceInPaise: 25000,
    stock: 5,
    status: "active",
    createdAt: new Date("2026-10-25T10:00:00Z"),
    ...overrides,
  }).toObject();

describe(
  "Product search validation and HTTP boundary (external operations simulated)",
  { concurrency: false },
  () => {
    let server;
    let baseUrl;
    before(async () => {
      server = app.listen(0, "127.0.0.1");
      await once(server, "listening");
      baseUrl = `http://127.0.0.1:${server.address().port}/api/products/search`;
    });
    after(async () => {
      if (server) await new Promise((resolve) => server.close(resolve));
    });
    const request = async (query = "") => {
      const response = await fetch(`${baseUrl}${query}`);
      return { response, payload: await response.json() };
    };

    test("parses typed defaults and normalizes exact filters", () => {
      const defaults = productSearchSchema.parse({});
      assert.equal(defaults.page, 1);
      assert.equal(defaults.limit, 12);
      const value = productSearchSchema.parse({
        q: " mug ",
        category: " HOME ",
        minPriceInPaise: "0",
        maxPriceInPaise: "50000",
        inStock: "false",
        limit: "5",
      });
      assert.equal(value.q, "mug");
      assert.equal(value.category, "home");
      assert.equal(value.minPriceInPaise, 0);
      assert.equal(value.maxPriceInPaise, 50000);
      assert.equal(value.inStock, false);
      assert.equal(value.limit, 5);
    });

    test("rejects invalid filters and deep pagination before calling search", async (context) => {
      const search = context.mock.method(
        productSearchIndex,
        "search",
        async () => {
          throw new Error("Search must not run for invalid input");
        },
      );
      for (const query of [
        "?page=0",
        "?limit=51",
        "?page=201&limit=50",
        "?page=",
        "?minPriceInPaise=-1",
        "?minPriceInPaise=1.5",
        "?maxPriceInPaise=100000001",
        "?minPriceInPaise=300&maxPriceInPaise=200",
        "?inStock=1",
        "?category=x",
        "?vendorId=wrong",
        "?status=draft",
        "?sort=priceInPaise",
        "?q=a&q=b",
        `?q=${"a".repeat(101)}`,
        "?minPriceInPaise=",
        "?limit=1e1",
      ]) {
        assert.equal((await request(query)).response.status, 422, query);
      }
      assert.equal(search.mock.callCount(), 0);
    });

    test("builds a bounded query from literal keywords with stable ordering", () => {
      const query = buildProductSearchQuery(
        productSearchSchema.parse({
          q: "*:*",
          category: "home",
          minPriceInPaise: "0",
          inStock: "true",
          sort: "price_asc",
        }),
      );
      assert.equal(query.query.bool.must[0].multi_match.query, "*:*");
      assert.equal(query.query.bool.must[0].multi_match.operator, "and");
      assert.deepEqual(query.sort, [{ priceInPaise: "asc" }, { id: "asc" }]);
      assert.deepEqual(query.query.bool.filter[0], {
        term: { status: "active" },
      });
      assert.equal(query._source, false);
      assert.equal(query.allow_partial_search_results, false);
    });

    test("preserves search order and excludes MongoDB-hidden products and internal fields", async (context) => {
      const first = fixture();
      const second = fixture({ _id: "000000000000000000000002" });
      context.mock.method(productSearchIndex, "search", async () => ({
        ids: [
          second._id.toString(),
          "000000000000000000000003",
          first._id.toString(),
        ],
        total: 3,
      }));
      context.mock.method(Product, "find", (filter) => {
        assert.equal(filter.status, "active");
        assert.equal(filter.category, "home");
        assert.deepEqual(filter.stock, { $gt: 0 });
        return { select: async () => [first, second] };
      });
      const { response, payload } = await request(
        "?category=home&inStock=true",
      );
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("cache-control"), "no-store");
      assert.deepEqual(
        payload.data.products.map((item) => item.id),
        [second._id.toString(), first._id.toString()],
      );
      assert.equal(payload.data.pagination.total, 3);
      assert.equal(
        Object.hasOwn(payload.data.products[0], "searchSyncPending"),
        false,
      );
      assert.equal(
        Object.hasOwn(payload.data.products[0], "searchVersion"),
        false,
      );
    });

    test("an empty result avoids a MongoDB read and retains pagination", async (context) => {
      context.mock.method(productSearchIndex, "search", async () => ({
        ids: [],
        total: 0,
      }));
      const find = context.mock.method(Product, "find", () => {
        throw new Error("Unexpected MongoDB read");
      });
      const { response, payload } = await request("?page=2&limit=5");
      assert.equal(response.status, 200);
      assert.deepEqual(payload.data.pagination, {
        page: 2,
        limit: 5,
        total: 0,
        totalPages: 0,
      });
      assert.equal(find.mock.callCount(), 0);
    });

    test("search outages use the centralized safe 503 response", async (context) => {
      context.mock.method(console, "error", () => {});
      context.mock.method(productSearchIndex, "search", async () => {
        throw new ApiError(
          503,
          "SEARCH_UNAVAILABLE",
          "Product search is temporarily unavailable. Please try again later.",
        );
      });
      const { response, payload } = await request("?q=mug");
      assert.equal(response.status, 503);
      assert.equal(payload.error.code, "SEARCH_UNAVAILABLE");
    });

    test("the search document contains no image keys or internal sync fields", () => {
      const doc = toSearchDocument(
        fixture({ image: { key: "private-key", width: 2, height: 2 } }),
      );
      assert.equal(Object.hasOwn(doc, "image"), false);
      assert.equal(Object.hasOwn(doc, "searchVersion"), false);
      assert.equal(Object.hasOwn(doc, "searchSyncPending"), false);
      assert.equal(doc.status, "active");
    });
  },
);

describe("Search indexing recovery", { concurrency: false }, () => {
  const mockBatch = (context, products) => {
    context.mock.method(productSearchIndex, "ensure", async () => {});
    context.mock.method(Product, "find", (filter) => {
      assert.deepEqual(filter, { searchSyncPending: true });
      const query = {
        select: () => query,
        sort: () => query,
        limit: () => query,
        lean: async () =>
          products
            .filter((product) => product.searchSyncPending)
            .map((product) => ({ ...product })),
      };
      return query;
    });
    context.mock.method(
      Product,
      "updateOne",
      async (filter, update, options) => {
        assert.equal(options.timestamps, false);
        const current = products.find(
          (product) =>
            product._id.toString() === filter._id.toString() &&
            product.searchVersion === filter.searchVersion,
        );
        if (current) Object.assign(current, update.$set);
        return { modifiedCount: current ? 1 : 0 };
      },
    );
  };

  test("failed writes remain pending and the next batch retries them", async (context) => {
    const products = [fixture()];
    mockBatch(context, products);
    context.mock.method(console, "error", () => {});
    const failed = context.mock.method(
      productSearchIndex,
      "indexProduct",
      async () => {
        throw new Error("offline");
      },
    );
    assert.deepEqual(await syncPendingProducts(), {
      processed: 1,
      synced: 0,
      failed: 1,
    });
    assert.equal(products[0].searchSyncPending, true);
    failed.mock.restore();
    context.mock.method(productSearchIndex, "indexProduct", async () => {});
    assert.deepEqual(await syncPendingProducts(), {
      processed: 1,
      synced: 1,
      failed: 0,
    });
    assert.equal(products[0].searchSyncPending, false);
  });

  test("a concurrent edit cannot be acknowledged as already indexed", async (context) => {
    const products = [fixture()];
    mockBatch(context, products);
    context.mock.method(
      productSearchIndex,
      "indexProduct",
      async (snapshot) => {
        assert.equal(snapshot.searchVersion, 1);
        products[0].searchVersion = 2;
        products[0].title = "Updated Mug";
      },
    );
    await syncPendingProducts();
    assert.equal(products[0].searchSyncPending, true);
    assert.equal(products[0].searchVersion, 2);
  });

  test("production rejects insecure endpoints and credentials embedded in URLs", (context) => {
    const keys = ["NODE_ENV", "ELASTICSEARCH_URL", "ELASTICSEARCH_INDEX"];
    const previous = keys.map((key) => [key, process.env[key]]);
    context.after(() => {
      for (const [key, value] of previous) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    });
    process.env.NODE_ENV = "production";
    for (const url of [
      "",
      "http://127.0.0.1:9200",
      "https://user:password@example.test",
      "https://example.test/?key=x",
    ]) {
      process.env.ELASTICSEARCH_URL = url;
      assert.throws(getSearchConfig, { code: "SEARCH_UNAVAILABLE" });
    }
    process.env.ELASTICSEARCH_URL = "https://search.example.test";
    process.env.ELASTICSEARCH_INDEX = "invalid/index";
    assert.throws(getSearchConfig, { code: "SEARCH_UNAVAILABLE" });
    process.env.ELASTICSEARCH_INDEX = "marketplace-products-v1";
    assert.equal(getSearchConfig().node, "https://search.example.test");
  });
});
