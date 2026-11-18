import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@elastic/elasticsearch";
import { createClient } from "redis";

// This benchmark always uses loopback and isolated data. It never loads .env.
const es = new Client({
  node: "http://127.0.0.1:9200",
  maxRetries: 0,
  requestTimeout: 5000,
});
const redis = createClient({
  url: "redis://127.0.0.1:6379",
  socket: { connectTimeout: 3000, reconnectStrategy: false },
});
redis.on("error", () => {});
const id = randomUUID();
const index = `marketplace-benchmark-${id}`;
const key = `marketplace:benchmark:${id}`;
const describe = (samples) => {
  const sorted = [...samples].sort((a, b) => a - b);
  const round = (n) => Math.round(n * 100) / 100;
  return {
    samples: sorted.length,
    meanMs: round(sorted.reduce((sum, n) => sum + n, 0) / sorted.length),
    p50Ms: round(sorted[Math.ceil(sorted.length * 0.5) - 1]),
    p95Ms: round(sorted[Math.ceil(sorted.length * 0.95) - 1]),
    maxMs: round(sorted.at(-1)),
  };
};
const measure = async (operation) => {
  for (let i = 0; i < 10; i++) await operation();
  const samples = [];
  for (let i = 0; i < 100; i++) {
    const start = performance.now();
    await operation();
    samples.push(performance.now() - start);
  }
  return describe(samples);
};
let created = false;
try {
  await redis.connect();
  await es.indices.create({
    index,
    settings: { number_of_shards: 1, number_of_replicas: 0 },
    mappings: {
      properties: {
        title: { type: "text" },
        category: { type: "keyword" },
        priceInPaise: { type: "integer" },
        stock: { type: "integer" },
      },
    },
  });
  created = true;
  const operations = Array.from({ length: 1000 }, (_, i) => [
    { index: { _index: index, _id: String(i) } },
    {
      title: i % 2 ? "Ceramic mug" : "Cotton shirt",
      category: i % 2 ? "home" : "clothing",
      priceInPaise: 10000 + i,
      stock: i % 100,
    },
  ]).flat();
  const bulk = await es.bulk({ operations, refresh: "wait_for" });
  if (bulk.errors) throw new Error("Benchmark fixture indexing failed");
  await redis.hSet(
    key,
    Object.fromEntries(
      Array.from({ length: 50 }, (_, i) => [
        i.toString(16).padStart(24, "0"),
        "1",
      ]),
    ),
  );
  await redis.expire(key, 300);
  const search = await measure(() =>
    es.search({
      index,
      size: 12,
      query: {
        bool: {
          must: [{ match: { title: "ceramic mug" } }],
          filter: [
            { term: { category: "home" } },
            { range: { stock: { gt: 0 } } },
          ],
        },
      },
      sort: [{ priceInPaise: "asc" }],
    }),
  );
  const cartRead = await measure(() => redis.hGetAll(key));
  const report = {
    measuredAt: new Date().toISOString(),
    node: process.version,
    platform: process.platform,
    concurrency: 1,
    warmupRequestsPerOperation: 10,
    fixture: { searchDocuments: 1000, cartLines: 50 },
    search,
    cartRead,
    limitations:
      "Loopback storage operations only. HTTP, authentication, MongoDB hydration, Razorpay and S3 are excluded. This is not production capacity or a load test.",
  };
  const destination = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../artifacts",
  );
  await mkdir(destination, { recursive: true });
  await writeFile(
    path.join(destination, "local-benchmark.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  try {
    if (created) await es.indices.delete({ index });
  } finally {
    if (redis.isReady) await redis.del(key);
    if (redis.isOpen) await redis.close();
    await es.close();
  }
}
