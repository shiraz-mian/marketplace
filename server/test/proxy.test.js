import assert from "node:assert/strict";
import { once } from "node:events";
import { test } from "node:test";

process.env.RENDER = "true";
const { app } = await import("../src/app.js");

test("Render rate limits each client and ignores a spoofed forwarded prefix", async () => {
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const url = `http://127.0.0.1:${server.address().port}/api/auth/login`;
    const send = (forwarded) =>
      fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Forwarded-For": forwarded,
        },
        body: "{}",
      });
    for (let n = 1; n <= 10; n++) {
      assert.equal((await send(`198.51.100.${n}, 203.0.113.1`)).status, 422);
    }
    assert.equal((await send("198.51.100.99, 203.0.113.1")).status, 429);
    assert.equal((await send("198.51.100.1, 203.0.113.2")).status, 422);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});
