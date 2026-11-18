import "dotenv/config";
import assert from "node:assert/strict";
import { once } from "node:events";
import mongoose from "mongoose";
import { app } from "../src/app.js";
import { connectDB } from "../src/config/db.js";
import { initializeAuth } from "../src/services/authService.js";

// Optional live check using an existing development-only account. No user or
// authentication records are created, changed or deleted by this script.
const run = async () => {
  if (!process.env.SMOKE_EMAIL || !process.env.SMOKE_PASSWORD) {
    throw new Error(
      "Set SMOKE_EMAIL and SMOKE_PASSWORD for an existing development account.",
    );
  }

  let server;
  try {
    await initializeAuth();
    console.log("Connecting to Atlas.");
    await connectDB();
    server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    const baseUrl = `http://127.0.0.1:${server.address().port}`;

    const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: process.env.SMOKE_EMAIL,
        password: process.env.SMOKE_PASSWORD,
      }),
    });
    assert.equal(
      loginResponse.status,
      200,
      "Development account login must succeed.",
    );
    const login = await loginResponse.json();
    const cookie = loginResponse.headers.get("set-cookie").split(";")[0];

    const post = async (path, refreshCookie) => {
      const response = await fetch(`${baseUrl}/api/auth/${path}`, {
        method: "POST",
        headers: {
          "X-Requested-With": "XMLHttpRequest",
          ...(refreshCookie ? { Cookie: refreshCookie } : {}),
        },
      });
      return { response, payload: await response.json() };
    };

    const profileStatus = async (token) => {
      const response = await fetch(`${baseUrl}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      await response.arrayBuffer();
      return response.status;
    };

    assert.equal(await profileStatus(login.data.accessToken), 200);
    const refreshed = await post("refresh", cookie);
    assert.equal(refreshed.response.status, 200);
    assert.equal(refreshed.response.headers.has("set-cookie"), false);
    assert.equal(await profileStatus(refreshed.payload.data.accessToken), 200);
    const logout = await post("logout", cookie);
    assert.equal(logout.response.status, 200);
    assert.match(
      logout.response.headers.get("set-cookie"),
      /marketplace_refresh=;/,
    );
    assert.equal((await post("refresh")).response.status, 401);
    // Stateless logout cannot revoke a previously copied JWT.
    assert.equal(await profileStatus(refreshed.payload.data.accessToken), 200);
    assert.equal((await post("refresh", cookie)).response.status, 200);
    console.log(
      JSON.stringify({
        login: 200,
        profile: 200,
        refresh: 200,
        logout: 200,
        refreshWithoutCookie: 401,
        savedAccessAfterLogout: 200,
        savedRefreshAfterLogout: 200,
      }),
    );
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    await mongoose.disconnect();
  }
};

run().catch((error) => {
  console.error(
    "Auth smoke check failed:",
    error.name,
    error.code || "CHECK_FAILED",
  );
  process.exitCode = 1;
});
