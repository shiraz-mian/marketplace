import assert from "node:assert/strict";
import { once } from "node:events";
import { after, before, describe, mock, test } from "node:test";
import argon2 from "argon2";
import { app } from "../src/app.js";
import { User } from "../src/models/userModel.js";

describe(
  "Registration HTTP flow (database writes stubbed)",
  { concurrency: false },
  () => {
    let server;
    let baseUrl;
    let registrationAttempts = 0;
    const records = new Map();
    const account = {
      name: "  Demo Customer  ",
      email: "  Customer@Example.com  ",
      password: "MarketplaceDemoPass123!",
    };

    const postRegistration = async (body) => {
      registrationAttempts += 1;
      const response = await fetch(`${baseUrl}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      return { response, payload: await response.json() };
    };

    before(async () => {
      // Exercise the actual HTTP layers, model validation and Argon2 implementation
      // without loading Atlas credentials or writing to the user's database.
      mock.method(User, "create", async (input) => {
        if (input.emailNormalized === "storage-error@example.com") {
          throw new Error("DO_NOT_EXPOSE_INTERNAL_DETAILS");
        }

        const document = new User(input);
        await document.validate();

        if (records.has(document.emailNormalized)) {
          throw Object.assign(new Error("Duplicate email"), {
            code: 11000,
            keyPattern: { emailNormalized: 1 },
          });
        }

        const record = {
          ...document.toObject(),
          createdAt: new Date(),
          internalNote: "DO_NOT_EXPOSE_INTERNAL_DETAILS",
        };

        records.set(record.emailNormalized, record);
        return record;
      });

      server = app.listen(0, "127.0.0.1");
      await once(server, "listening");
      baseUrl = `http://127.0.0.1:${server.address().port}`;
    });

    after(async () => {
      if (server) {
        await new Promise((resolve) => server.close(resolve));
      }

      mock.restoreAll();
    });

    test("existing health endpoint remains available", async () => {
      const response = await fetch(`${baseUrl}/api/health`);
      const payload = await response.json();

      assert.equal(response.status, 200);
      assert.equal(payload.success, true);
      assert.equal(payload.message, "Marketplace backend is running");
    });

    test("creates a normalized customer and returns only safe fields", async () => {
      const { response, payload } = await postRegistration(account);

      assert.equal(response.status, 201);
      assert.equal(payload.success, true);
      assert.equal(payload.message, "Account created successfully.");
      assert.equal(payload.data.user.name, "Demo Customer");
      assert.equal(payload.data.user.email, "customer@example.com");
      assert.deepEqual(payload.data.user.roles, ["customer"]);
      assert.equal(payload.data.user.status, "active");
      assert.match(payload.data.user.id, /^[a-f0-9]{24}$/);
      assert.equal(Object.hasOwn(payload.data.user, "passwordHash"), false);
      assert.equal(Object.hasOwn(payload.data.user, "password"), false);
      assert.equal(Object.hasOwn(payload.data.user, "internalNote"), false);

      const stored = records.get("customer@example.com");
      assert.match(stored.passwordHash, /^\$argon2id\$/);
      assert.equal(
        await argon2.verify(stored.passwordHash, account.password),
        true,
      );
      assert.equal(Object.hasOwn(stored, "password"), false);
    });

    test("central handler maps a normalized duplicate email to 409", async () => {
      const { response, payload } = await postRegistration({
        ...account,
        email: "CUSTOMER@example.com",
      });

      assert.equal(response.status, 409);
      assert.deepEqual(payload, {
        success: false,
        error: {
          code: "EMAIL_ALREADY_EXISTS",
          message: "An account with this email already exists.",
        },
      });
    });

    test("rejects role, status and hash injection before creating an account", async () => {
      const countBefore = records.size;
      const { response, payload } = await postRegistration({
        ...account,
        email: "privilege-attempt@example.com",
        roles: ["admin"],
        status: "active",
        passwordHash: "CLIENT_CONTROLLED_HASH",
      });

      assert.equal(response.status, 422);
      assert.equal(payload.error.code, "VALIDATION_FAILED");
      assert.equal(records.size, countBefore);
      assert.equal(
        JSON.stringify(payload).includes("CLIENT_CONTROLLED_HASH"),
        false,
      );
    });

    test("rejects a short password and malformed email", async () => {
      for (const body of [
        { ...account, password: "short" },
        { ...account, email: "invalid-email" },
      ]) {
        const { response, payload } = await postRegistration(body);
        assert.equal(response.status, 422);
        assert.equal(payload.error.code, "VALIDATION_FAILED");
        assert.ok(payload.error.details.length > 0);
      }
    });

    test("rejects missing fields without exposing submitted values", async () => {
      const { response, payload } = await postRegistration({});
      assert.equal(response.status, 422);
      assert.equal(payload.error.code, "VALIDATION_FAILED");
      assert.deepEqual(
        payload.error.details.map((detail) => detail.field).sort(),
        ["email", "name", "password"],
      );
    });

    test("asyncHandler forwards an unexpected service rejection safely", async (context) => {
      const logger = context.mock.method(console, "error", () => {});
      const { response, payload } = await postRegistration({
        ...account,
        email: "storage-error@example.com",
      });

      assert.equal(response.status, 500);
      assert.equal(payload.error.code, "INTERNAL_ERROR");
      assert.equal(JSON.stringify(payload).includes("DO_NOT_EXPOSE"), false);
      assert.equal(logger.mock.callCount(), 1);
    });

    test("handles duplicate-write outcomes from simultaneous requests", async () => {
      const body = { ...account, email: "simultaneous@example.com" };
      const results = await Promise.all([
        postRegistration(body),
        postRegistration(body),
      ]);

      assert.deepEqual(
        results.map(({ response }) => response.status).sort(),
        [201, 409],
      );
      assert.equal(records.has(body.email), true);
    });

    test("returns structured errors for missing routes and malformed JSON", async () => {
      const absent = await fetch(`${baseUrl}/api/not-a-route`);
      assert.equal(absent.status, 404);
      assert.equal((await absent.json()).error.code, "NOT_FOUND");

      const malformed = await fetch(`${baseUrl}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: '{"password":"DO_NOT_EXPOSE_INTERNAL_DETAILS",',
      });

      assert.equal(malformed.status, 400);
      const payload = await malformed.json();
      assert.equal(payload.error.code, "INVALID_JSON");
      assert.equal(JSON.stringify(payload).includes("DO_NOT_EXPOSE"), false);
    });

    test("rejects oversized request bodies", async () => {
      const response = await fetch(`${baseUrl}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "a".repeat(40 * 1024) }),
      });

      assert.equal(response.status, 413);
      assert.equal((await response.json()).error.code, "BODY_TOO_LARGE");
    });

    test("limits registration attempts and includes a retry header", async () => {
      while (registrationAttempts < 10) {
        const { response } = await postRegistration({});
        assert.equal(response.status, 422);
      }

      const { response, payload } = await postRegistration({});
      assert.equal(response.status, 429);
      assert.equal(payload.error.code, "RATE_LIMITED");
      assert.ok(response.headers.has("retry-after"));
    });
  },
);
