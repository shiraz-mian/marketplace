import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { after, before, beforeEach, describe, mock, test } from "node:test";
import jwt from "jsonwebtoken";
import { app } from "../src/app.js";
import { User } from "../src/models/userModel.js";
import { Vendor } from "../src/models/vendorModel.js";
import {
  createAccessToken,
  createRefreshToken,
} from "../src/services/tokenService.js";
import { submitVendorApplication } from "../src/services/vendorService.js";

describe(
  "Vendor application HTTP flow (database operations stubbed)",
  { concurrency: false },
  () => {
    let server;
    let baseUrl;
    let owner;
    let otherOwner;
    let token;
    const users = new Map();
    const applications = new Map();
    const writes = [];
    const reads = [];
    const originalEnv = Object.fromEntries(
      ["JWT_SECRET", "JWT_ISSUER", "JWT_AUDIENCE"].map((key) => [
        key,
        process.env[key],
      ]),
    );
    const secret = randomBytes(64).toString("base64url");
    const validInput = {
      storeName: "  Everyday Finds  ",
      description:
        "  Everyday essentials and thoughtful gifts for your home.  ",
    };

    const makeUser = async (name) => {
      const document = new User({
        name,
        emailNormalized: `${name.toLowerCase()}@example.com`,
        passwordHash: "not-used-by-these-tests",
        roles: ["customer"],
        createdAt: new Date(),
      });
      await document.validate();
      const record = document.toObject();
      users.set(record._id.toString(), record);
      return record;
    };

    const request = async (
      path = "/apply",
      { body, accessToken = token, method } = {},
    ) => {
      const response = await fetch(`${baseUrl}/api/vendors${path}`, {
        method: method || (body === undefined ? "GET" : "POST"),
        headers: {
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      return { response, payload: await response.json() };
    };

    before(async () => {
      Object.assign(process.env, {
        JWT_SECRET: secret,
        JWT_ISSUER: "marketplace-api-vendor-test",
        JWT_AUDIENCE: "marketplace-client-vendor-test",
      });

      mock.method(User, "findById", (id) => ({
        select: async () => users.get(id.toString()) || null,
      }));

      // Real Express, JWT, Zod and Mongoose validation run here. Only database
      // operations are replaced; the unique-index outcome is simulated in memory.
      mock.method(Vendor, "create", async (input) => {
        writes.push(input);
        const document = new Vendor(input);
        await document.validate();
        const key = document.ownerId.toString();
        if (applications.has(key)) {
          throw Object.assign(new Error("DO_NOT_EXPOSE_DUPLICATE_DETAILS"), {
            code: 11000,
            keyPattern: { ownerId: 1 },
          });
        }
        const record = {
          ...document.toObject(),
          createdAt: new Date(),
          updatedAt: new Date(),
          internalReviewNotes: "DO_NOT_EXPOSE_REVIEW_DETAILS",
          paymentAccountId: "DO_NOT_EXPOSE_PAYMENT_DETAILS",
        };
        applications.set(key, record);
        return record;
      });

      mock.method(Vendor, "findOne", (filter) => {
        reads.push(filter);
        return {
          select: async (selection) => {
            assert.equal(
              selection,
              "ownerId storeName description status createdAt updatedAt",
            );
            return applications.get(filter.ownerId) || null;
          },
        };
      });

      server = app.listen(0, "127.0.0.1");
      await once(server, "listening");
      baseUrl = `http://127.0.0.1:${server.address().port}`;
    });

    beforeEach(async () => {
      users.clear();
      applications.clear();
      writes.length = 0;
      reads.length = 0;
      owner = await makeUser("Customer");
      otherOwner = await makeUser("AnotherCustomer");
      token = createAccessToken(owner._id.toString());
    });

    after(async () => {
      if (server) await new Promise((resolve) => server.close(resolve));
      mock.restoreAll();
      for (const [key, value] of Object.entries(originalEnv)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    });

    test("creates a trimmed pending application with only the allowed response fields", async () => {
      const { response, payload } = await request("/apply", {
        body: validInput,
      });
      assert.equal(response.status, 201);
      assert.equal(response.headers.get("cache-control"), "no-store");
      assert.equal(payload.success, true);
      assert.equal(payload.message, "Vendor application submitted for review.");
      const vendor = payload.data.vendor;
      assert.deepEqual(
        Object.keys(vendor).sort(),
        [
          "id",
          "ownerId",
          "storeName",
          "description",
          "status",
          "createdAt",
          "updatedAt",
        ].sort(),
      );
      assert.match(vendor.id, /^[a-f0-9]{24}$/);
      assert.equal(vendor.ownerId, owner._id.toString());
      assert.equal(vendor.storeName, "Everyday Finds");
      assert.equal(vendor.description, validInput.description.trim());
      assert.equal(vendor.status, "pending");
      assert.ok(Number.isFinite(Date.parse(vendor.createdAt)));
      assert.ok(Number.isFinite(Date.parse(vendor.updatedAt)));
      assert.equal(JSON.stringify(payload).includes("DO_NOT_EXPOSE"), false);
    });

    test("loads the authenticated owner's application without exposing internal fields", async () => {
      const created = await request("/apply", { body: validInput });
      const { response, payload } = await request("/me");
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("cache-control"), "no-store");
      assert.deepEqual(payload.data.vendor, created.payload.data.vendor);
      assert.deepEqual(reads, [{ ownerId: owner._id.toString() }]);
      assert.equal(JSON.stringify(payload).includes("DO_NOT_EXPOSE"), false);
    });

    test("returns a private structured 404 when no application exists", async () => {
      const { response, payload } = await request("/me");
      assert.equal(response.status, 404);
      assert.equal(response.headers.get("cache-control"), "no-store");
      assert.deepEqual(payload, {
        success: false,
        error: {
          code: "VENDOR_APPLICATION_NOT_FOUND",
          message: "You have not submitted a vendor application.",
        },
      });
    });

    test("separate accounts can apply independently with the same store name", async () => {
      const first = await request("/apply", { body: validInput });
      const otherToken = createAccessToken(otherOwner._id.toString());
      const second = await request("/apply", {
        body: validInput,
        accessToken: otherToken,
      });
      assert.equal(first.response.status, 201);
      assert.equal(second.response.status, 201);
      assert.notEqual(
        first.payload.data.vendor.id,
        second.payload.data.vendor.id,
      );
      const result = await request("/me", { accessToken: otherToken });
      assert.equal(
        result.payload.data.vendor.ownerId,
        otherOwner._id.toString(),
      );
      assert.equal(applications.size, 2);
    });

    test("missing, invalid, expired and refresh JWTs cannot reach application storage", async () => {
      const expired = jwt.sign({ type: "access" }, secret, {
        algorithm: "HS256",
        subject: owner._id.toString(),
        expiresIn: -1,
        issuer: process.env.JWT_ISSUER,
        audience: process.env.JWT_AUDIENCE,
      });
      for (const accessToken of [
        null,
        "not-a-jwt",
        expired,
        createRefreshToken(owner._id.toString()),
      ]) {
        for (const path of ["/apply", "/me"]) {
          const { response } = await request(path, {
            accessToken,
            ...(path === "/apply" ? { body: validInput } : {}),
          });
          assert.equal(response.status, 401);
        }
      }
      assert.equal(writes.length + reads.length, 0);
    });

    test("disabled and deleted accounts are blocked before reading or creating an application", async () => {
      owner.status = "disabled";
      for (const removed of [false, true]) {
        if (removed) users.delete(owner._id.toString());
        assert.equal(
          (await request("/apply", { body: validInput })).response.status,
          401,
        );
        assert.equal((await request("/me")).response.status, 401);
      }
      assert.equal(writes.length + reads.length, 0);
    });

    test("rejects missing, wrong-type, blank, too-short and too-long fields before writing", async () => {
      for (const body of [
        {},
        [],
        { description: validInput.description },
        { storeName: "A Store" },
        { ...validInput, storeName: null },
        { ...validInput, description: {} },
        { ...validInput, storeName: "   " },
        { ...validInput, storeName: " A " },
        { ...validInput, storeName: "a".repeat(101) },
        { ...validInput, description: "   " },
        { ...validInput, description: "a".repeat(19) },
        { ...validInput, description: "a".repeat(1001) },
      ]) {
        const { response, payload } = await request("/apply", { body });
        assert.equal(response.status, 422);
        assert.equal(payload.error.code, "VALIDATION_FAILED");
        assert.ok(payload.error.details.length > 0);
      }
      assert.equal(writes.length, 0);
    });

    test("accepts the documented minimum and maximum field lengths", async () => {
      const minimum = await request("/apply", {
        body: { storeName: "ab", description: "a".repeat(20) },
      });
      assert.equal(minimum.response.status, 201);
      const maximum = await request("/apply", {
        accessToken: createAccessToken(otherOwner._id.toString()),
        body: { storeName: "a".repeat(100), description: "a".repeat(1000) },
      });
      assert.equal(maximum.response.status, 201);
    });

    test("rejects client-supplied owner, approval, role and database fields", async () => {
      for (const extra of [
        { ownerId: otherOwner._id.toString() },
        { status: "approved" },
        { roles: ["vendor", "admin"] },
        { _id: otherOwner._id.toString() },
        { createdAt: new Date().toISOString() },
        { unknown: "DO_NOT_EXPOSE_INPUT" },
      ]) {
        const { response, payload } = await request("/apply", {
          body: { ...validInput, ...extra },
        });
        assert.equal(response.status, 422);
        assert.equal(payload.error.code, "VALIDATION_FAILED");
        assert.equal(
          JSON.stringify(payload).includes("DO_NOT_EXPOSE_INPUT"),
          false,
        );
      }
      assert.equal(writes.length, 0);
      assert.deepEqual(owner.roles, ["customer"]);
    });

    test("the service fixes ownership and pending status even when called with extra fields", async () => {
      const vendor = await submitVendorApplication(owner._id.toString(), {
        ...validInput,
        ownerId: otherOwner._id.toString(),
        status: "approved",
        roles: ["vendor"],
      });
      assert.equal(vendor.ownerId, owner._id.toString());
      assert.equal(vendor.status, "pending");
      assert.deepEqual(
        Object.keys(writes[0]).sort(),
        ["ownerId", "storeName", "description", "status"].sort(),
      );
      assert.deepEqual(owner.roles, ["customer"]);
    });

    test("rejects another application for every existing status without changing the record", async () => {
      await request("/apply", { body: validInput });
      const record = applications.get(owner._id.toString());
      for (const status of ["pending", "approved", "rejected"]) {
        record.status = status;
        const { response, payload } = await request("/apply", {
          body: { ...validInput, storeName: "Replacement Store" },
        });
        assert.equal(response.status, 409);
        assert.deepEqual(payload.error, {
          code: "VENDOR_APPLICATION_EXISTS",
          message: "You already have a vendor application.",
        });
        assert.equal(record.storeName, "Everyday Finds");
        assert.equal(record.status, status);
      }
      assert.equal(applications.size, 1);
    });

    test("maps a simultaneous duplicate-write outcome to one success and one conflict", async () => {
      const results = await Promise.all([
        request("/apply", { body: validInput }),
        request("/apply", { body: validInput }),
      ]);
      assert.deepEqual(
        results.map(({ response }) => response.status).sort(),
        [201, 409],
      );
      assert.equal(applications.size, 1);
    });

    test("query filters cannot reveal or change another owner's application", async () => {
      await request("/apply", { body: validInput });
      const otherToken = createAccessToken(otherOwner._id.toString());
      const { response, payload } = await request(
        `/me?ownerId=${owner._id}&status=approved`,
        { accessToken: otherToken },
      );
      assert.equal(response.status, 404);
      assert.equal(payload.error.code, "VENDOR_APPLICATION_NOT_FOUND");
      assert.deepEqual(reads.at(-1), { ownerId: otherOwner._id.toString() });
      assert.equal(JSON.stringify(payload).includes("Everyday Finds"), false);
      const original = await request(`/me?ownerId=${otherOwner._id}`);
      assert.equal(original.payload.data.vendor.ownerId, owner._id.toString());
    });

    test("Mongoose validates required references, status and the same field limits", async () => {
      for (const input of [
        { storeName: "A Store", description: "a".repeat(20) },
        {
          ownerId: "invalid-id",
          storeName: "A Store",
          description: "a".repeat(20),
        },
        { ownerId: owner._id, storeName: "a", description: "a".repeat(20) },
        {
          ownerId: owner._id,
          storeName: "a".repeat(101),
          description: "a".repeat(20),
        },
        {
          ownerId: owner._id,
          storeName: "A Store",
          description: "a".repeat(19),
        },
        {
          ownerId: owner._id,
          storeName: "A Store",
          description: "a".repeat(1001),
        },
        {
          ownerId: owner._id,
          storeName: "A Store",
          description: "a".repeat(20),
          status: "active",
        },
      ]) {
        await assert.rejects(new Vendor(input).validate(), {
          name: "ValidationError",
        });
      }
      const document = new Vendor({ ownerId: owner._id, ...validInput });
      await document.validate();
      assert.equal(document.status, "pending");
    });

    test("declares a unique owner index and prevents changing the owner of a saved document", () => {
      assert.ok(
        Vendor.schema
          .indexes()
          .some(([fields, options]) => fields.ownerId === 1 && options.unique),
      );
      const document = new Vendor({ ownerId: owner._id, ...validInput });
      document.isNew = false;
      document.ownerId = otherOwner._id;
      assert.equal(document.ownerId.toString(), owner._id.toString());
    });

    test("unexpected storage failures use the central safe error response", async (context) => {
      const logger = context.mock.method(console, "error", () => {});
      context.mock.method(Vendor, "create", async () => {
        throw new Error("DO_NOT_EXPOSE_STORAGE_DETAILS");
      });
      const { response, payload } = await request("/apply", {
        body: validInput,
      });
      assert.equal(response.status, 500);
      assert.equal(payload.error.code, "INTERNAL_ERROR");
      assert.equal(JSON.stringify(payload).includes("DO_NOT_EXPOSE"), false);
      assert.equal(logger.mock.callCount(), 1);
    });

    test("lookup and authentication database failures return 500 without exposing internals", async (context) => {
      context.mock.method(console, "error", () => {});
      context.mock.method(Vendor, "findOne", () => ({
        select: async () => {
          throw new Error("DO_NOT_EXPOSE_LOOKUP_DETAILS");
        },
      }));
      const lookup = await request("/me");
      assert.equal(lookup.response.status, 500);
      assert.equal(lookup.payload.error.code, "INTERNAL_ERROR");
      assert.equal(
        JSON.stringify(lookup.payload).includes("DO_NOT_EXPOSE"),
        false,
      );
      context.mock.method(User, "findById", () => ({
        select: async () => {
          throw new Error("DO_NOT_EXPOSE_AUTH_DETAILS");
        },
      }));
      const auth = await request("/apply", { body: validInput });
      assert.equal(auth.response.status, 500);
      assert.equal(writes.length, 0);
      assert.equal(
        JSON.stringify(auth.payload).includes("DO_NOT_EXPOSE"),
        false,
      );
    });

    test("malformed JSON returns the existing structured error before writing", async () => {
      const response = await fetch(`${baseUrl}/api/vendors/apply`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: '{"storeName":"DO_NOT_EXPOSE_INPUT",',
      });
      const payload = await response.json();
      assert.equal(response.status, 400);
      assert.equal(payload.error.code, "INVALID_JSON");
      assert.equal(JSON.stringify(payload).includes("DO_NOT_EXPOSE"), false);
      assert.equal(writes.length, 0);
    });
  },
);
