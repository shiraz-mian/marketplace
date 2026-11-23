import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { createClient } from "redis";

const redis = createClient({
  url: "redis://127.0.0.1:6379",
  socket: { connectTimeout: 3000, reconnectStrategy: false },
});
redis.on("error", () => {});
const key = `marketplace:benchmark:${randomUUID()}`;
try {
  await redis.connect();
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
  for (let i = 0; i < 10; i++) await redis.hGetAll(key);
  const samples = [];
  for (let i = 0; i < 100; i++) {
    const started = performance.now();
    await redis.hGetAll(key);
    samples.push(performance.now() - started);
  }
  samples.sort((a, b) => a - b);
  console.log(
    JSON.stringify(
      {
        operation: "local Redis cart read",
        samples: samples.length,
        p50Ms: samples[49],
        p95Ms: samples[94],
      },
      null,
      2,
    ),
  );
} finally {
  if (redis.isReady) await redis.del(key);
  if (redis.isOpen) await redis.close();
}
