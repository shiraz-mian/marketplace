import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { after, before, beforeEach, describe, mock, test } from "node:test";
import jwt from "jsonwebtoken";
import { app } from "../src/app.js";
import {
  getClientOrigins,
  REFRESH_TOKEN_TTL_SECONDS,
} from "../src/config/auth.js";
import { User } from "../src/models/userModel.js";
import {
  createAccessToken,
  createRefreshToken,
  verifyRefreshToken,
} from "../src/services/tokenService.js";

describe(
  "JWT refresh and cookie logout HTTP flow (user reads stubbed)",
  { concurrency: false },
  () => {
    let server;
    let baseUrl;
    let user;
    let userExists = true;
    const originals = Object.fromEntries(
      [
        "JWT_SECRET",
        "JWT_ISSUER",
        "JWT_AUDIENCE",
        "NODE_ENV",
        "CLIENT_ORIGINS",
      ].map((key) => [key, process.env[key]]),
    );
    const secret = randomBytes(64).toString("base64url");

    const makeCookie = (token = createRefreshToken(user._id.toString())) =>
      `marketplace_refresh=${token}`;

    const post = async (path, cookie, headers = {}) => {
      const response = await fetch(`${baseUrl}/api/auth/${path}`, {
        method: "POST",
        headers: {
          "X-Requested-With": "XMLHttpRequest",
          ...(cookie ? { Cookie: cookie } : {}),
          ...headers,
        },
      });
      return { response, payload: await response.json() };
    };

    const me = async (token) => {
      const response = await fetch(`${baseUrl}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return { response, payload: await response.json() };
    };

    const signedRefresh = (claims = {}, options = {}) =>
      jwt.sign({ type: "refresh", ...claims }, secret, {
        algorithm: "HS256",
        subject: user._id.toString(),
        issuer: process.env.JWT_ISSUER,
        audience: process.env.JWT_AUDIENCE,
        expiresIn: REFRESH_TOKEN_TTL_SECONDS,
        ...options,
      });

    before(async () => {
      Object.assign(process.env, {
        JWT_SECRET: secret,
        JWT_ISSUER: "marketplace-api-refresh-test",
        JWT_AUDIENCE: "marketplace-client-refresh-test",
        NODE_ENV: "test",
        CLIENT_ORIGINS: "http://localhost:5173,http://127.0.0.1:5173",
      });
      user = new User({
        name: "Token Customer",
        emailNormalized: "tokens@example.com",
        passwordHash: "not-used-by-these-tests",
        createdAt: new Date(),
      });
      mock.method(User, "findById", (id) => ({
        select: async (selection) => {
          assert.equal(selection.includes("passwordHash"), false);
          return userExists && id.toString() === user._id.toString()
            ? user
            : null;
        },
      }));
      server = app.listen(0, "127.0.0.1");
      await once(server, "listening");
      baseUrl = `http://127.0.0.1:${server.address().port}`;
    });

    beforeEach(() => {
      user.status = "active";
      userExists = true;
    });

    after(async () => {
      if (server) await new Promise((resolve) => server.close(resolve));
      mock.restoreAll();
      for (const [key, value] of Object.entries(originals)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    });

    test("issues a usable 15-minute access JWT from the refresh cookie without disclosing refresh data", async () => {
      const { response, payload } = await post("refresh", makeCookie(), {
        Origin: "http://localhost:5173",
      });
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("cache-control"), "no-store");
      assert.equal(payload.data.user.id, user._id.toString());
      assert.equal(payload.data.expiresIn, 900);
      assert.equal(payload.data.tokenType, "Bearer");
      assert.equal(Object.hasOwn(payload.data, "refreshToken"), false);
      assert.equal(Object.hasOwn(payload.data.user, "passwordHash"), false);
      const claims = jwt.verify(payload.data.accessToken, secret);
      assert.equal(claims.type, "access");
      assert.equal(claims.exp - claims.iat, 900);
      assert.equal(Object.hasOwn(claims, "sid"), false);
      assert.equal((await me(payload.data.accessToken)).response.status, 200);
    });

    test("keeps the refresh JWT and its original seven-day expiry instead of rotating or extending it", async () => {
      const token = createRefreshToken(user._id.toString());
      const originalClaims = verifyRefreshToken(token);
      assert.equal(
        originalClaims.exp - originalClaims.iat,
        REFRESH_TOKEN_TTL_SECONDS,
      );
      const first = await post("refresh", makeCookie(token));
      const second = await post("refresh", makeCookie(token));
      assert.equal(first.response.status, 200);
      assert.equal(second.response.status, 200);
      assert.notEqual(
        first.payload.data.accessToken,
        second.payload.data.accessToken,
      );
      assert.equal(first.response.headers.has("set-cookie"), false);
      assert.equal(second.response.headers.has("set-cookie"), false);
      assert.equal(verifyRefreshToken(token).exp, originalClaims.exp);
    });

    test("simultaneous refresh requests can use the same unrevoked JWT", async () => {
      const cookie = makeCookie();
      const results = await Promise.all([
        post("refresh", cookie),
        post("refresh", cookie),
      ]);
      assert.deepEqual(
        results.map(({ response }) => response.status),
        [200, 200],
      );
      assert.notEqual(
        results[0].payload.data.accessToken,
        results[1].payload.data.accessToken,
      );
    });

    test("refresh works after the access token expires", async () => {
      const expired = jwt.sign({ type: "access" }, secret, {
        subject: user._id.toString(),
        issuer: process.env.JWT_ISSUER,
        audience: process.env.JWT_AUDIENCE,
        expiresIn: -1,
      });
      assert.equal((await me(expired)).payload.error.code, "TOKEN_EXPIRED");
      const refreshed = await post("refresh", makeCookie(), {
        Authorization: `Bearer ${expired}`,
      });
      assert.equal(refreshed.response.status, 200);
      assert.equal(
        (await me(refreshed.payload.data.accessToken)).response.status,
        200,
      );
    });

    test("rejects access JWTs at the refresh endpoint and refresh JWTs at protected routes", async () => {
      const access = createAccessToken(user._id.toString());
      const wrongRefresh = await post("refresh", makeCookie(access));
      assert.equal(wrongRefresh.response.status, 401);
      assert.equal(wrongRefresh.payload.error.code, "INVALID_REFRESH_TOKEN");
      // A short refresh lifetime proves rejection depends on type, not just age.
      const wrongAccess = await me(signedRefresh({}, { expiresIn: 900 }));
      assert.equal(wrongAccess.response.status, 401);
      assert.equal(wrongAccess.payload.error.code, "INVALID_TOKEN");
    });

    test("clears expired refresh cookies and returns a specific expiry code", async () => {
      const { response, payload } = await post(
        "refresh",
        makeCookie(signedRefresh({}, { expiresIn: -1 })),
      );
      assert.equal(response.status, 401);
      assert.equal(payload.error.code, "REFRESH_TOKEN_EXPIRED");
      assert.equal(response.headers.get("cache-control"), "no-store");
      assert.match(response.headers.get("set-cookie"), /marketplace_refresh=;/);
      assert.match(response.headers.get("set-cookie"), /Path=\/api\/auth/);
      assert.match(
        response.headers.get("set-cookie"),
        /Expires=Thu, 01 Jan 1970/,
      );
    });

    test("rejects missing, malformed, oversized and tampered refresh cookies", async () => {
      const token = createRefreshToken(user._id.toString());
      const parts = token.split(".");
      parts[1] = Buffer.from(
        JSON.stringify({
          ...jwt.decode(token),
          sub: "507f1f77bcf86cd799439011",
        }),
      ).toString("base64url");
      for (const cookie of [
        undefined,
        "marketplace_refresh=bad",
        "marketplace_refresh=%ZZ",
        makeCookie("x".repeat(4097)),
        makeCookie(parts.join(".")),
      ]) {
        const { response, payload } = await post("refresh", cookie);
        assert.equal(response.status, 401);
        assert.equal(payload.error.code, "INVALID_REFRESH_TOKEN");
        assert.equal(JSON.stringify(payload).includes(token), false);
      }
    });

    test("rejects refresh tokens signed with another key, algorithm, issuer or audience", async () => {
      const otherKey = jwt.sign(
        { type: "refresh" },
        randomBytes(64).toString("hex"),
        {
          subject: user._id.toString(),
          issuer: process.env.JWT_ISSUER,
          audience: process.env.JWT_AUDIENCE,
          expiresIn: REFRESH_TOKEN_TTL_SECONDS,
        },
      );
      for (const token of [
        otherKey,
        signedRefresh({}, { audience: "another-client" }),
        signedRefresh({}, { issuer: "another-api" }),
        signedRefresh({}, { algorithm: "HS512" }),
        jwt.sign({ type: "refresh" }, null, { algorithm: "none" }),
      ]) {
        const { response, payload } = await post("refresh", makeCookie(token));
        assert.equal(response.status, 401);
        assert.equal(payload.error.code, "INVALID_REFRESH_TOKEN");
      }
    });

    test("requires valid token claims and a bounded refresh lifetime", async () => {
      const withoutExpiry = jwt.sign({ type: "refresh" }, secret, {
        subject: user._id.toString(),
        issuer: process.env.JWT_ISSUER,
        audience: process.env.JWT_AUDIENCE,
      });
      const withoutType = jwt.sign({}, secret, {
        subject: user._id.toString(),
        issuer: process.env.JWT_ISSUER,
        audience: process.env.JWT_AUDIENCE,
        expiresIn: REFRESH_TOKEN_TTL_SECONDS,
      });
      for (const token of [
        withoutExpiry,
        withoutType,
        signedRefresh({ type: "other" }),
        signedRefresh({}, { subject: "invalid-user-id" }),
        signedRefresh({ iat: Math.floor(Date.now() / 1000) + 3600 }),
        signedRefresh({}, { expiresIn: REFRESH_TOKEN_TTL_SECONDS + 1 }),
        signedRefresh({}, { noTimestamp: true }),
        signedRefresh({}, { notBefore: "1h" }),
      ]) {
        assert.equal(
          (await post("refresh", makeCookie(token))).response.status,
          401,
        );
      }
    });

    test("uses only the refresh cookie, ignoring body and query-string tokens", async () => {
      const token = createRefreshToken(user._id.toString());
      const response = await fetch(
        `${baseUrl}/api/auth/refresh?refreshToken=${token}`,
        {
          method: "POST",
          headers: {
            "X-Requested-With": "XMLHttpRequest",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ refreshToken: token }),
        },
      );
      assert.equal(response.status, 401);
    });

    test("rejects refresh for disabled or deleted users and returns current account roles", async () => {
      const cookie = makeCookie();
      user.status = "disabled";
      assert.equal((await post("refresh", cookie)).response.status, 401);
      user.status = "active";
      userExists = false;
      assert.equal((await post("refresh", cookie)).response.status, 401);
      userExists = true;
      user.roles = ["customer", "vendor"];
      try {
        assert.deepEqual(
          (await post("refresh", cookie)).payload.data.user.roles,
          ["customer", "vendor"],
        );
      } finally {
        user.roles = ["customer"];
      }
    });

    test("logout clears the browser cookie but does not revoke saved access or refresh JWTs", async () => {
      const access = createAccessToken(user._id.toString());
      const cookie = makeCookie();
      const { response, payload } = await post("logout", cookie);
      assert.equal(response.status, 200);
      assert.equal(payload.data, null);
      assert.equal(response.headers.get("cache-control"), "no-store");
      assert.match(response.headers.get("set-cookie"), /marketplace_refresh=;/);
      assert.match(response.headers.get("set-cookie"), /HttpOnly/);
      assert.match(response.headers.get("set-cookie"), /Path=\/api\/auth/);
      assert.equal((await post("refresh")).response.status, 401);
      assert.equal((await me(access)).response.status, 200);
      assert.equal((await post("refresh", cookie)).response.status, 200);
    });

    test("logout is idempotent and does not require a working database or valid token", async (context) => {
      context.mock.method(User, "findById", () => {
        throw new Error("Database unavailable");
      });
      for (const cookie of [
        undefined,
        "marketplace_refresh=invalid",
        makeCookie(),
      ]) {
        assert.equal((await post("logout", cookie)).response.status, 200);
      }
    });

    test("requires the CSRF header and rejects untrusted browser origins", async () => {
      const cookie = makeCookie();
      for (const path of ["refresh", "logout"]) {
        for (const headers of [
          { "X-Requested-With": "" },
          { Origin: "https://untrusted.example" },
          { Origin: "null" },
          { "Sec-Fetch-Site": "cross-site" },
        ]) {
          assert.equal(
            (await post(path, cookie, headers)).response.status,
            403,
          );
        }
      }
      const response = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: {
          Origin: "https://untrusted.example",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: "ignored@example.com",
          password: "ignored",
        }),
      });
      assert.equal(response.status, 403);
    });

    test("uses matching Secure cookie-clear options in production and validates exact HTTPS origins", async () => {
      try {
        process.env.NODE_ENV = "production";
        process.env.CLIENT_ORIGINS = "https://shop.example.com";
        const { response } = await post("logout", makeCookie(), {
          Origin: "https://shop.example.com",
        });
        assert.equal(response.status, 200);
        assert.match(response.headers.get("set-cookie"), /; Secure/);
        for (const origin of [
          undefined,
          "http://shop.example.com",
          "https://shop.example.com/path",
          "*",
        ]) {
          if (origin === undefined) delete process.env.CLIENT_ORIGINS;
          else process.env.CLIENT_ORIGINS = origin;
          assert.throws(getClientOrigins);
        }
      } finally {
        process.env.NODE_ENV = "test";
        process.env.CLIENT_ORIGINS =
          "http://localhost:5173,http://127.0.0.1:5173";
      }
    });

    test("allows a refresh retry after a transient user-database failure without exposing internals", async (context) => {
      const cookie = makeCookie();
      let unavailable = true;
      context.mock.method(console, "error", () => {});
      context.mock.method(User, "findById", () => ({
        select: async () => {
          if (unavailable) throw new Error("DO_NOT_EXPOSE_DATABASE_DETAILS");
          return user;
        },
      }));
      const failed = await post("refresh", cookie);
      assert.equal(failed.response.status, 500);
      assert.equal(failed.payload.error.code, "INTERNAL_ERROR");
      assert.equal(
        JSON.stringify(failed.payload).includes("DO_NOT_EXPOSE"),
        false,
      );
      assert.equal(failed.response.headers.has("set-cookie"), false);
      unavailable = false;
      assert.equal((await post("refresh", cookie)).response.status, 200);
    });

    test("rate-limits repeated refresh attempts", async () => {
      let response;
      for (let attempt = 0; attempt < 101; attempt += 1) {
        ({ response } = await post("refresh"));
        if (response.status === 429) break;
        assert.equal(response.status, 401);
      }
      assert.equal(response.status, 429);
      assert.ok(response.headers.has("retry-after"));
    });
  },
);
