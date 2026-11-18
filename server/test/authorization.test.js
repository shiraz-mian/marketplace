import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { after, before, beforeEach, describe, mock, test } from "node:test";
import express from "express";
import jwt from "jsonwebtoken";
import { USER_ROLES } from "../src/config/roles.js";
import {
  authenticate,
  authorizeRoles,
} from "../src/middleware/authMiddleware.js";
import { errorHandler } from "../src/middleware/errorMiddleware.js";
import { User } from "../src/models/userModel.js";
import {
  createAccessToken,
  createRefreshToken,
} from "../src/services/tokenService.js";
import { apiResponse } from "../src/utils/apiResponse.js";
import { asyncHandler } from "../src/utils/asyncHandler.js";

describe(
  "Role authorization HTTP flow (user reads stubbed)",
  { concurrency: false },
  () => {
    let server;
    let baseUrl;
    const accounts = {};
    const tokens = {};
    const records = new Map();
    const reachedControllers = [];
    const originals = Object.fromEntries(
      ["JWT_SECRET", "JWT_ISSUER", "JWT_AUDIENCE"].map((key) => [
        key,
        process.env[key],
      ]),
    );
    const secret = randomBytes(64).toString("base64url");

    const request = async (path, token, options = {}) => {
      const response = await fetch(`${baseUrl}${path}`, {
        ...options,
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...options.headers,
        },
      });
      return { response, payload: await response.json() };
    };

    const signedAccessToken = (account, claims = {}, options = {}) => {
      return jwt.sign({ type: "access", ...claims }, secret, {
        algorithm: "HS256",
        subject: account._id.toString(),
        issuer: process.env.JWT_ISSUER,
        audience: process.env.JWT_AUDIENCE,
        expiresIn: 900,
        ...options,
      });
    };

    before(async () => {
      Object.assign(process.env, {
        JWT_SECRET: secret,
        JWT_ISSUER: "marketplace-api-authorization-test",
        JWT_AUDIENCE: "marketplace-client-authorization-test",
      });

      for (const [name, roles] of Object.entries({
        customer: ["customer"],
        vendor: ["vendor"],
        admin: ["admin"],
        multiple: ["customer", "vendor"],
      })) {
        const document = new User({
          name: `Test ${name}`,
          emailNormalized: `${name}@example.com`,
          passwordHash: "not-used-by-these-tests",
          roles,
          createdAt: new Date(),
        });
        await document.validate();
        accounts[name] = document.toObject();
        tokens[name] = createAccessToken(document._id.toString());
      }

      mock.method(User, "findById", (id) => ({
        select: async (selection) => {
          assert.equal(selection.includes("passwordHash"), false);
          return records.get(id.toString()) || null;
        },
      }));

      // Test-only routes exercise the production middleware through Express and
      // real JWT verification. No demo/admin endpoints are added to the app.
      const app = express();
      app.use(express.json());
      const controller = (req, res) => {
        reachedControllers.push(req.path);
        return res.json(apiResponse({ userId: req.user.id }, "Authorized."));
      };

      for (const role of USER_ROLES) {
        app.get(
          `/${role}`,
          asyncHandler(authenticate),
          authorizeRoles(role),
          controller,
        );
      }
      app.get(
        "/vendor-or-admin",
        asyncHandler(authenticate),
        authorizeRoles("vendor", "admin"),
        controller,
      );
      app.post(
        "/admin",
        asyncHandler(authenticate),
        authorizeRoles("admin"),
        controller,
      );
      app.get("/without-auth-middleware", authorizeRoles("admin"), controller);
      app.use(errorHandler);

      server = app.listen(0, "127.0.0.1");
      await once(server, "listening");
      baseUrl = `http://127.0.0.1:${server.address().port}`;
    });

    beforeEach(() => {
      records.clear();
      reachedControllers.length = 0;
      for (const account of Object.values(accounts)) {
        records.set(account._id.toString(), {
          ...account,
          roles: [...account.roles],
        });
      }
    });

    after(async () => {
      if (server) await new Promise((resolve) => server.close(resolve));
      mock.restoreAll();
      for (const [key, value] of Object.entries(originals)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    });

    test("missing, malformed, expired and refresh tokens receive 401 before a controller runs", async () => {
      for (const token of [
        undefined,
        "not-a-jwt",
        signedAccessToken(accounts.admin, {}, { expiresIn: -1 }),
        createRefreshToken(accounts.admin._id.toString()),
      ]) {
        const { response } = await request("/admin", token);
        assert.equal(response.status, 401);
      }
      assert.deepEqual(reachedControllers, []);
    });

    test("each single-role route permits its matching role and denies the other roles", async () => {
      for (const routeRole of USER_ROLES) {
        for (const accountRole of USER_ROLES) {
          const { response, payload } = await request(
            `/${routeRole}`,
            tokens[accountRole],
          );
          assert.equal(response.status, routeRole === accountRole ? 200 : 403);
          if (routeRole === accountRole) {
            assert.equal(
              payload.data.userId,
              accounts[accountRole]._id.toString(),
            );
          } else {
            assert.deepEqual(payload, {
              success: false,
              error: {
                code: "FORBIDDEN",
                message: "You do not have permission to access this resource.",
              },
            });
          }
        }
      }
      assert.equal(reachedControllers.length, 3);
    });

    test("multiple allowed roles mean any one matching role may proceed", async () => {
      for (const accountRole of ["vendor", "admin"]) {
        assert.equal(
          (await request("/vendor-or-admin", tokens[accountRole])).response
            .status,
          200,
        );
      }
      assert.equal(
        (await request("/vendor-or-admin", tokens.customer)).response.status,
        403,
      );
      assert.equal(reachedControllers.length, 2);
    });

    test("an account with multiple roles may use either permitted role", async () => {
      assert.equal(
        (await request("/customer", tokens.multiple)).response.status,
        200,
      );
      assert.equal(
        (await request("/vendor", tokens.multiple)).response.status,
        200,
      );
      assert.equal(
        (await request("/admin", tokens.multiple)).response.status,
        403,
      );
      assert.equal(reachedControllers.length, 2);
    });

    test("body, query and JWT role claims cannot grant admin access", async () => {
      const signedClaims = signedAccessToken(accounts.customer, {
        roles: ["admin"],
      });
      for (const token of [tokens.customer, signedClaims]) {
        const { response, payload } = await request(
          "/admin?role=admin&roles=admin",
          token,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ role: "admin", roles: ["admin"] }),
          },
        );
        assert.equal(response.status, 403);
        assert.equal(payload.error.code, "FORBIDDEN");
      }
      assert.deepEqual(reachedControllers, []);
    });

    test("role removal takes effect on the next request with the same JWT", async () => {
      assert.equal(
        (await request("/admin", tokens.admin)).response.status,
        200,
      );
      records.get(accounts.admin._id.toString()).roles = ["customer"];
      assert.equal(
        (await request("/admin", tokens.admin)).response.status,
        403,
      );
      assert.equal(
        (await request("/customer", tokens.admin)).response.status,
        200,
      );
      assert.equal(reachedControllers.length, 2);
    });

    test("a server-assigned role becomes available without issuing another JWT", async () => {
      assert.equal(
        (await request("/vendor", tokens.customer)).response.status,
        403,
      );
      records.get(accounts.customer._id.toString()).roles = [
        "customer",
        "vendor",
      ];
      assert.equal(
        (await request("/vendor", tokens.customer)).response.status,
        200,
      );
      assert.equal(reachedControllers.length, 1);
    });

    test("disabled and deleted accounts receive 401 even with a valid admin JWT", async () => {
      records.get(accounts.admin._id.toString()).status = "disabled";
      assert.equal(
        (await request("/admin", tokens.admin)).response.status,
        401,
      );
      records.delete(accounts.admin._id.toString());
      assert.equal(
        (await request("/admin", tokens.admin)).response.status,
        401,
      );
      assert.deepEqual(reachedControllers, []);
    });

    test("missing, empty, malformed and unknown account roles fail closed", async () => {
      const admin = records.get(accounts.admin._id.toString());
      for (const roles of [
        undefined,
        null,
        [],
        "admin",
        { admin: true },
        ["owner"],
        ["ADMIN"],
      ]) {
        admin.roles = roles;
        assert.equal(
          (await request("/admin", tokens.admin)).response.status,
          403,
        );
      }
      assert.deepEqual(reachedControllers, []);
    });

    test("a missing authenticated user receives 401 if middleware is accidentally misordered", async () => {
      const { response, payload } = await request(
        "/without-auth-middleware",
        tokens.admin,
      );
      assert.equal(response.status, 401);
      assert.equal(payload.error.code, "AUTH_REQUIRED");
      assert.deepEqual(reachedControllers, []);
    });

    test("invalid route-role configuration fails immediately instead of creating an unguarded route", () => {
      for (const roles of [
        [],
        ["owner"],
        [undefined],
        ["admin", "vendor-typo"],
        [["admin"]],
      ]) {
        assert.throws(() => authorizeRoles(...roles), TypeError);
      }
      assert.equal(
        typeof authorizeRoles("customer", "vendor", "admin"),
        "function",
      );
    });

    test("shared role values preserve User model validation", async () => {
      const invalidUser = new User({
        name: "Invalid Role",
        emailNormalized: "invalid-role@example.com",
        passwordHash: "not-used-by-these-tests",
        roles: ["owner"],
      });
      await assert.rejects(invalidUser.validate(), { name: "ValidationError" });
    });

    test("account database failures never reach the protected controller or expose internals", async (context) => {
      context.mock.method(console, "error", () => {});
      context.mock.method(User, "findById", () => ({
        select: async () => {
          throw new Error("DO_NOT_EXPOSE_DATABASE_DETAILS");
        },
      }));
      const { response, payload } = await request("/admin", tokens.admin);
      assert.equal(response.status, 500);
      assert.equal(payload.error.code, "INTERNAL_ERROR");
      assert.equal(JSON.stringify(payload).includes("DO_NOT_EXPOSE"), false);
      assert.deepEqual(reachedControllers, []);
    });
  },
);
