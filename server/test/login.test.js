import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { after, before, describe, mock, test } from "node:test";
import argon2 from "argon2";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { app } from "../src/app.js";
import { getAuthConfig, ACCESS_TOKEN_TTL_SECONDS } from "../src/config/auth.js";
import { User } from "../src/models/userModel.js";
import { initializeAuth } from "../src/services/authService.js";

describe(
  "Login and protected current-user HTTP flow (database reads stubbed)",
  { concurrency: false },
  () => {
    let server;
    let baseUrl;
    let activeUser;
    let disabledUser;
    let accessToken;
    let loginAttempts = 0;
    let secret;
    const originalSecret = process.env.JWT_SECRET;
    const originalIssuer = process.env.JWT_ISSUER;
    const originalAudience = process.env.JWT_AUDIENCE;
    const password = "MarketplaceDemoPass123!";
    const byEmail = new Map();
    const byId = new Map();
    const loginSelections = [];

    const login = async (body, headers = {}) => {
      loginAttempts += 1;
      const response = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify(body),
      });
      return { response, payload: await response.json() };
    };

    const me = async (token) => {
      const response = await fetch(`${baseUrl}/api/auth/me`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      return { response, payload: await response.json() };
    };

    const signedToken = (claims = {}, options = {}) => {
      return jwt.sign({ type: "access", ...claims }, secret, {
        algorithm: "HS256",
        subject: activeUser._id.toString(),
        issuer: "marketplace-api-test",
        audience: "marketplace-client-test",
        expiresIn: ACCESS_TOKEN_TTL_SECONDS,
        ...options,
      });
    };

    before(async () => {
      // Test-only credentials stay in this process; the real .env is not loaded.
      secret = randomBytes(64).toString("base64url");
      process.env.JWT_SECRET = secret;
      process.env.JWT_ISSUER = "marketplace-api-test";
      process.env.JWT_AUDIENCE = "marketplace-client-test";
      await initializeAuth();

      const passwordHash = await argon2.hash(password, {
        type: argon2.argon2id,
        memoryCost: 19456,
        timeCost: 2,
        parallelism: 1,
      });
      activeUser = new User({
        name: "Demo Customer",
        emailNormalized: "customer@example.com",
        passwordHash,
        roles: ["customer"],
        status: "active",
        createdAt: new Date(),
      });
      disabledUser = new User({
        name: "Disabled Customer",
        emailNormalized: "disabled@example.com",
        passwordHash,
        roles: ["customer"],
        status: "disabled",
        createdAt: new Date(),
      });
      for (const user of [activeUser, disabledUser]) {
        byEmail.set(user.emailNormalized, user);
        byId.set(user._id.toString(), user);
      }

      mock.method(User, "findOne", (filter) => ({
        select: async (selection) => {
          loginSelections.push(selection);
          if (filter.emailNormalized === "unavailable@example.com") {
            throw new Error("DO_NOT_EXPOSE_DATABASE_DETAILS");
          }
          return byEmail.get(filter.emailNormalized) || null;
        },
      }));
      mock.method(User, "findById", (id) => ({
        select: async (selection) => {
          assert.equal(selection.includes("passwordHash"), false);
          return byId.get(id.toString()) || null;
        },
      }));

      server = app.listen(0, "127.0.0.1");
      await once(server, "listening");
      baseUrl = `http://127.0.0.1:${server.address().port}`;
    });

    after(async () => {
      if (server) await new Promise((resolve) => server.close(resolve));
      mock.restoreAll();
      for (const [key, value] of [
        ["JWT_SECRET", originalSecret],
        ["JWT_ISSUER", originalIssuer],
        ["JWT_AUDIENCE", originalAudience],
      ]) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    });

    test("normalizes email, verifies password and issues a bounded safe JWT", async () => {
      const { response, payload } = await login({
        email: "  CUSTOMER@EXAMPLE.COM  ",
        password,
      });
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("cache-control"), "no-store");
      assert.equal(payload.success, true);
      assert.equal(payload.data.tokenType, "Bearer");
      assert.equal(payload.data.expiresIn, 900);
      assert.deepEqual(payload.data.user.roles, ["customer"]);
      assert.equal(payload.data.user.email, "customer@example.com");
      assert.equal(Object.hasOwn(payload.data.user, "passwordHash"), false);
      assert.equal(Object.hasOwn(payload.data.user, "password"), false);
      assert.equal(loginSelections[0], "+passwordHash");

      accessToken = payload.data.accessToken;
      const claims = jwt.verify(accessToken, secret, {
        algorithms: ["HS256"],
        issuer: "marketplace-api-test",
        audience: "marketplace-client-test",
      });
      assert.equal(claims.sub, activeUser._id.toString());
      assert.equal(claims.exp - claims.iat, 900);
      assert.ok(claims.jti);
      assert.equal(claims.type, "access");
      assert.equal(Object.hasOwn(claims, "sid"), false);
      assert.deepEqual(Object.keys(claims).sort(), [
        "aud",
        "exp",
        "iat",
        "iss",
        "jti",
        "sub",
        "type",
      ]);
      const refreshCookie = response.headers.get("set-cookie");
      assert.match(refreshCookie, /marketplace_refresh=/);
      assert.match(refreshCookie, /HttpOnly/);
      assert.match(refreshCookie, /Path=\/api\/auth/);
      assert.match(refreshCookie, /SameSite=Lax/);
      const refreshClaims = jwt.verify(
        refreshCookie.split(";")[0].split("=")[1],
        secret,
        {
          algorithms: ["HS256"],
          issuer: "marketplace-api-test",
          audience: "marketplace-client-test",
        },
      );
      assert.equal(refreshClaims.type, "refresh");
      assert.equal(refreshClaims.sub, activeUser._id.toString());
      assert.equal(refreshClaims.exp - refreshClaims.iat, 7 * 24 * 60 * 60);
      assert.equal(Object.hasOwn(refreshClaims, "sid"), false);
      assert.equal(Object.hasOwn(payload.data, "refreshToken"), false);
      assert.equal(Object.hasOwn(payload.data, "refreshExpiresAt"), false);
    });

    test("wrong password, absent account and disabled account have the same error", async () => {
      for (const body of [
        { email: "customer@example.com", password: "wrong-password" },
        { email: "absent@example.com", password },
        { email: "disabled@example.com", password },
      ]) {
        const { response, payload } = await login(body);
        assert.equal(response.status, 401);
        assert.deepEqual(payload, {
          success: false,
          error: {
            code: "INVALID_CREDENTIALS",
            message: "Email or password is incorrect.",
          },
        });
      }
    });

    test("preserves password spaces and rejects invalid or unexpected input", async () => {
      const spaced = await login({
        email: "customer@example.com",
        password: ` ${password} `,
      });
      assert.equal(spaced.response.status, 401);
      for (const body of [
        { email: "invalid-email", password },
        { email: "customer@example.com", password, roles: ["admin"] },
      ]) {
        const { response, payload } = await login(body);
        assert.equal(response.status, 422);
        assert.equal(payload.error.code, "VALIDATION_FAILED");
      }
    });

    test("forwards unexpected database failures without exposing internals", async (context) => {
      context.mock.method(console, "error", () => {});
      const { response, payload } = await login({
        email: "unavailable@example.com",
        password,
      });
      assert.equal(response.status, 500);
      assert.equal(payload.error.code, "INTERNAL_ERROR");
      assert.equal(JSON.stringify(payload).includes("DO_NOT_EXPOSE"), false);
    });

    test("loads the current user with a valid Bearer token", async () => {
      const { response, payload } = await me(accessToken);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("cache-control"), "no-store");
      assert.equal(payload.data.user.id, activeUser._id.toString());
      assert.equal(payload.data.user.email, "customer@example.com");
      assert.equal(Object.hasOwn(payload.data.user, "passwordHash"), false);
    });

    test("requires the Authorization header rather than a query parameter", async () => {
      const missing = await me();
      assert.equal(missing.response.status, 401);
      assert.equal(missing.payload.error.code, "AUTH_REQUIRED");
      assert.equal(missing.response.headers.get("www-authenticate"), "Bearer");
      const query = await fetch(
        `${baseUrl}/api/auth/me?access_token=${accessToken}`,
      );
      assert.equal(query.status, 401);
      const basic = await fetch(`${baseUrl}/api/auth/me`, {
        headers: { Authorization: "Basic abc" },
      });
      assert.equal(basic.status, 401);
    });

    test("rejects malformed and tampered tokens", async () => {
      const parts = accessToken.split(".");
      parts[1] = Buffer.from(
        JSON.stringify({
          ...jwt.decode(accessToken),
          sub: new mongoose.Types.ObjectId().toString(),
        }),
      ).toString("base64url");
      for (const token of ["not-a-token", parts.join(".")]) {
        const { response, payload } = await me(token);
        assert.equal(response.status, 401);
        assert.equal(payload.error.code, "INVALID_TOKEN");
        assert.equal(JSON.stringify(payload).includes(token), false);
      }
    });

    test("rejects an expired token with a specific public expiry code", async () => {
      const { response, payload } = await me(
        signedToken({}, { expiresIn: -1 }),
      );
      assert.equal(response.status, 401);
      assert.equal(payload.error.code, "TOKEN_EXPIRED");
    });

    test("rejects other signing keys, audiences, issuers and algorithms", async () => {
      const otherKeyToken = jwt.sign({}, randomBytes(64).toString("hex"), {
        subject: activeUser._id.toString(),
        issuer: "marketplace-api-test",
        audience: "marketplace-client-test",
        expiresIn: 900,
      });
      for (const token of [
        otherKeyToken,
        signedToken({}, { audience: "other-client" }),
        signedToken({}, { issuer: "other-server" }),
        signedToken({}, { algorithm: "HS512" }),
        jwt.sign({}, null, { algorithm: "none" }),
      ]) {
        const { response, payload } = await me(token);
        assert.equal(response.status, 401);
        assert.equal(payload.error.code, "INVALID_TOKEN");
      }
    });

    test("rejects missing expiry, invalid subjects, future issue time and excessive lifetime", async () => {
      const withoutExpiry = jwt.sign({ type: "access" }, secret, {
        subject: activeUser._id.toString(),
        issuer: "marketplace-api-test",
        audience: "marketplace-client-test",
      });
      for (const token of [
        withoutExpiry,
        signedToken({}, { subject: "invalid-id" }),
        signedToken({ iat: Math.floor(Date.now() / 1000) + 3600 }),
        signedToken({}, { expiresIn: 3600 }),
        signedToken({}, { noTimestamp: true }),
        signedToken({}, { notBefore: "1h" }),
      ]) {
        const { response } = await me(token);
        assert.equal(response.status, 401);
      }
    });

    test("rejects deleted and disabled users even when the token is signed correctly", async () => {
      const deleted = await me(
        signedToken({}, { subject: new mongoose.Types.ObjectId().toString() }),
      );
      assert.equal(deleted.response.status, 401);
      activeUser.status = "disabled";
      try {
        assert.equal((await me(accessToken)).response.status, 401);
      } finally {
        activeUser.status = "active";
      }
    });

    test("reads current roles from the database and ignores token role claims", async () => {
      const forgedRoleClaims = await me(signedToken({ roles: ["admin"] }));
      assert.deepEqual(forgedRoleClaims.payload.data.user.roles, ["customer"]);
      activeUser.roles = ["customer", "vendor"];
      try {
        const current = await me(accessToken);
        assert.deepEqual(current.payload.data.user.roles, [
          "customer",
          "vendor",
        ]);
      } finally {
        activeUser.roles = ["customer"];
      }
    });

    test("bounds token size before verification", async () => {
      const { response, payload } = await me("x".repeat(4097));
      assert.equal(response.status, 401);
      assert.equal(payload.error.code, "AUTH_REQUIRED");
    });

    test("rejects missing or weak signing configuration", () => {
      try {
        delete process.env.JWT_SECRET;
        assert.throws(getAuthConfig, /JWT_SECRET must be configured/);
        process.env.JWT_SECRET = "weak";
        assert.throws(getAuthConfig, /JWT_SECRET must be configured/);
      } finally {
        process.env.JWT_SECRET = secret;
      }
    });

    test("sets Secure refresh cookies for a trusted HTTPS production client", async () => {
      const originalMode = process.env.NODE_ENV;
      const originalOrigins = process.env.CLIENT_ORIGINS;
      try {
        process.env.NODE_ENV = "production";
        process.env.CLIENT_ORIGINS = "https://shop.example.com";
        const { response } = await login(
          { email: "customer@example.com", password },
          {
            Origin: "https://shop.example.com",
          },
        );
        assert.equal(response.status, 200);
        assert.match(response.headers.get("set-cookie"), /; Secure/);
      } finally {
        if (originalMode === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = originalMode;
        if (originalOrigins === undefined) delete process.env.CLIENT_ORIGINS;
        else process.env.CLIENT_ORIGINS = originalOrigins;
      }
    });

    test("rate-limits repeated login attempts independently of registration", async () => {
      while (loginAttempts < 10) {
        const { response } = await login({});
        assert.equal(response.status, 422);
      }
      const { response, payload } = await login({});
      assert.equal(response.status, 429);
      assert.equal(payload.error.code, "RATE_LIMITED");
      assert.ok(response.headers.has("retry-after"));
    });
  },
);
