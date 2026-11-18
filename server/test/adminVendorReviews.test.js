import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { after, before, beforeEach, describe, mock, test } from "node:test";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import { app } from "../src/app.js";
import { User } from "../src/models/userModel.js";
import { Vendor } from "../src/models/vendorModel.js";
import {
  createAccessToken,
  createRefreshToken,
} from "../src/services/tokenService.js";

describe(
  "Admin vendor reviews (database and transaction execution simulated)",
  { concurrency: false },
  () => {
    let server;
    let baseUrl;
    let accounts;
    let tokens;
    let application;
    let queue = Promise.resolve();
    let failRoleWrite = false;
    let failCommit = false;
    const users = new Map();
    const vendors = new Map();
    const transactions = [];
    const listQueries = [];
    const roleWrites = [];
    const originalEnv = Object.fromEntries(
      ["JWT_SECRET", "JWT_ISSUER", "JWT_AUDIENCE"].map((key) => [
        key,
        process.env[key],
      ]),
    );
    const secret = randomBytes(64).toString("base64url");

    const cloneRecord = (record) => ({
      ...record,
      ...(Array.isArray(record.roles) ? { roles: [...record.roles] } : {}),
    });
    const cloneRecords = (records) =>
      new Map([...records].map(([id, record]) => [id, cloneRecord(record)]));
    const replaceRecords = (target, source) => {
      target.clear();
      for (const [id, record] of source) target.set(id, cloneRecord(record));
    };

    const makeUser = async (name, roles = ["customer"]) => {
      const document = new User({
        name,
        emailNormalized: `${name.toLowerCase()}@example.com`,
        passwordHash: "DO_NOT_EXPOSE_PASSWORD_HASH",
        roles,
        createdAt: new Date(),
      });
      await document.validate();
      const record = document.toObject();
      users.set(record._id.toString(), record);
      return record;
    };

    const makeApplication = async (
      ownerId,
      status = "pending",
      createdAt = new Date(),
    ) => {
      const document = new Vendor({
        ownerId,
        status,
        storeName: "Everyday Finds",
        description:
          "Thoughtful essentials and useful products for everyday life.",
        createdAt,
        updatedAt: createdAt,
      });
      await document.validate();
      const record = {
        ...document.toObject(),
        internalReviewNotes: "DO_NOT_EXPOSE_INTERNAL_REVIEW",
        paymentAccountId: "DO_NOT_EXPOSE_PAYMENT_ACCOUNT",
      };
      vendors.set(record._id.toString(), record);
      return record;
    };

    const request = async (
      path = "/vendors",
      { token = tokens.admin, body, method } = {},
    ) => {
      const response = await fetch(`${baseUrl}/api/admin${path}`, {
        method: method || (body === undefined ? "GET" : "PATCH"),
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      return { response, payload: await response.json() };
    };
    const review = (status, options = {}) =>
      request(`/vendors/${application._id}/review`, {
        body: { status },
        ...options,
      });

    before(async () => {
      Object.assign(process.env, {
        JWT_SECRET: secret,
        JWT_ISSUER: "marketplace-api-admin-review-test",
        JWT_AUDIENCE: "marketplace-client-admin-review-test",
      });

      mock.method(User, "findById", (id) => ({
        select: async () => users.get(id.toString()) || null,
      }));
      mock.method(Vendor, "findOne", ({ ownerId }) => ({
        select: async () =>
          [...vendors.values()].find(
            (vendor) => vendor.ownerId.toString() === ownerId,
          ) || null,
      }));

      mock.method(Vendor, "find", (filter) => {
        const spec = { filter };
        const query = {
          select: (value) => {
            spec.selection = value;
            return query;
          },
          sort: (value) => {
            spec.sort = value;
            return query;
          },
          skip: (value) => {
            spec.skip = value;
            return query;
          },
          limit: (value) => {
            spec.limit = value;
            return query;
          },
          lean: async () => {
            listQueries.push(spec);
            return [...vendors.values()]
              .filter((vendor) => vendor.status === filter.status)
              .sort(
                (left, right) =>
                  right.createdAt - left.createdAt ||
                  right._id.toString().localeCompare(left._id.toString()),
              )
              .slice(spec.skip, spec.skip + spec.limit)
              .map(cloneRecord);
          },
        };
        return query;
      });
      mock.method(
        Vendor,
        "countDocuments",
        async (filter) =>
          [...vendors.values()].filter(
            (vendor) => vendor.status === filter.status,
          ).length,
      );

      // Isolated copies simulate commit/rollback. Serial execution simulates the
      // outcome after MongoDB resolves conflicts; real driver retries need a replica set.
      mock.method(mongoose.connection, "transaction", async (work, options) => {
        let release;
        const previous = queue;
        queue = new Promise((resolve) => {
          release = resolve;
        });
        await previous;
        const session = {
          users: cloneRecords(users),
          vendors: cloneRecords(vendors),
        };
        const transaction = {
          session,
          options,
          committed: false,
          aborted: false,
        };
        transactions.push(transaction);
        try {
          const result = await work(session);
          if (failCommit) throw new Error("DO_NOT_EXPOSE_COMMIT_FAILURE");
          replaceRecords(users, session.users);
          replaceRecords(vendors, session.vendors);
          transaction.committed = true;
          return result;
        } catch (error) {
          transaction.aborted = true;
          throw error;
        } finally {
          release();
        }
      });

      mock.method(Vendor, "findOneAndUpdate", (filter, update, options) => ({
        select: async (selection) => {
          const { session } = options;
          assert.ok(transactions.some((item) => item.session === session));
          assert.deepEqual(Object.keys(filter).sort(), ["_id", "status"]);
          assert.equal(filter.status, "pending");
          assert.equal(options.runValidators, true);
          assert.equal(options.new, true);
          assert.ok(selection.includes("reviewedBy"));
          const record = session.vendors.get(filter._id.toString());
          if (!record || record.status !== filter.status) return null;
          const updated = new Vendor({
            ...record,
            ...update.$set,
            updatedAt: new Date(),
          });
          await updated.validate();
          session.vendors.set(record._id.toString(), updated.toObject());
          return updated;
        },
      }));
      mock.method(Vendor, "exists", (filter) => ({
        session: async (session) =>
          session.vendors.has(filter._id.toString())
            ? { _id: filter._id }
            : null,
      }));

      mock.method(User, "findOneAndUpdate", async (filter, update, options) => {
        const { session } = options;
        assert.ok(transactions.some((item) => item.session === session));
        assert.equal(options.runValidators, true);
        assert.equal(options.projection, "_id");
        assert.deepEqual(update, { $addToSet: { roles: "vendor" } });
        roleWrites.push({ filter, update, session });
        if (failRoleWrite) throw new Error("DO_NOT_EXPOSE_ROLE_FAILURE");
        const user = session.users.get(filter._id.toString());
        if (!user || user.status !== filter.status) return null;
        if (!user.roles.includes("vendor")) user.roles.push("vendor");
        return user;
      });

      server = app.listen(0, "127.0.0.1");
      await once(server, "listening");
      baseUrl = `http://127.0.0.1:${server.address().port}`;
    });

    beforeEach(async () => {
      users.clear();
      vendors.clear();
      transactions.length = 0;
      listQueries.length = 0;
      roleWrites.length = 0;
      failRoleWrite = false;
      failCommit = false;
      accounts = {
        admin: await makeUser("Administrator", ["customer", "admin"]),
        anotherAdmin: await makeUser("AnotherAdministrator", ["admin"]),
        customer: await makeUser("Customer"),
        vendor: await makeUser("Seller", ["customer", "vendor"]),
      };
      tokens = Object.fromEntries(
        Object.entries(accounts).map(([name, user]) => [
          name,
          createAccessToken(user._id.toString()),
        ]),
      );
      application = await makeApplication(accounts.customer._id);
    });

    after(async () => {
      if (server) await new Promise((resolve) => server.close(resolve));
      mock.restoreAll();
      for (const [key, value] of Object.entries(originalEnv)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    });

    test("both admin endpoints reject missing, malformed, expired and refresh JWTs", async () => {
      const expired = jwt.sign({ type: "access" }, secret, {
        algorithm: "HS256",
        subject: accounts.admin._id.toString(),
        expiresIn: -1,
        issuer: process.env.JWT_ISSUER,
        audience: process.env.JWT_AUDIENCE,
      });
      for (const token of [
        null,
        "not-a-jwt",
        expired,
        createRefreshToken(accounts.admin._id.toString()),
      ]) {
        assert.equal(
          (await request("/vendors", { token })).response.status,
          401,
        );
        assert.equal(
          (await review("approved", { token })).response.status,
          401,
        );
      }
      assert.equal(listQueries.length + transactions.length, 0);
    });

    test("customers and vendors cannot list or review applications", async () => {
      for (const token of [tokens.customer, tokens.vendor]) {
        for (const result of [
          await request("/vendors", { token }),
          await review("approved", { token }),
        ]) {
          assert.equal(result.response.status, 403);
          assert.equal(result.payload.error.code, "FORBIDDEN");
        }
      }
      assert.equal(listQueries.length + transactions.length, 0);
      assert.equal(vendors.get(application._id.toString()).status, "pending");
    });

    test("body, query and signed JWT role claims cannot grant admin permission", async () => {
      const claimedAdmin = jwt.sign(
        { type: "access", roles: ["admin"] },
        secret,
        {
          algorithm: "HS256",
          subject: accounts.customer._id.toString(),
          expiresIn: 900,
          issuer: process.env.JWT_ISSUER,
          audience: process.env.JWT_AUDIENCE,
        },
      );
      assert.equal(
        (await request("/vendors?role=admin", { token: claimedAdmin })).response
          .status,
        403,
      );
      assert.equal(
        (
          await review("approved", {
            token: claimedAdmin,
            body: { status: "approved", roles: ["admin"] },
          })
        ).response.status,
        403,
      );
      assert.equal(transactions.length, 0);
    });

    test("admin role removal and account disabling apply to the next request", async () => {
      accounts.admin.roles = ["customer"];
      assert.equal((await request()).response.status, 403);
      accounts.admin.roles = ["admin"];
      accounts.admin.status = "disabled";
      assert.equal((await review("approved")).response.status, 401);
      users.delete(accounts.admin._id.toString());
      assert.equal((await request()).response.status, 401);
      assert.equal(transactions.length + listQueries.length, 0);
    });

    test("lists pending applications by default with bounded metadata and safe fields", async () => {
      await makeApplication(accounts.vendor._id, "approved");
      const { response, payload } = await request();
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("cache-control"), "no-store");
      assert.deepEqual(payload.data.pagination, {
        page: 1,
        limit: 20,
        total: 1,
        totalPages: 1,
      });
      const vendor = payload.data.vendors[0];
      assert.equal(vendor.id, application._id.toString());
      assert.equal(vendor.status, "pending");
      assert.equal(vendor.reviewedBy, null);
      assert.equal(vendor.reviewedAt, null);
      assert.equal(JSON.stringify(payload).includes("DO_NOT_EXPOSE"), false);
      assert.deepEqual(listQueries[0].filter, { status: "pending" });
      assert.deepEqual(listQueries[0].sort, { createdAt: -1, _id: -1 });
    });

    test("filters statuses and paginates deterministically when timestamps tie", async () => {
      await makeApplication(accounts.vendor._id);
      await makeApplication(accounts.anotherAdmin._id);
      for (const vendor of vendors.values())
        vendor.createdAt = new Date("2026-11-01T10:00:00Z");
      await makeApplication(accounts.admin._id, "rejected");
      const pendingIds = [...vendors.values()]
        .filter((vendor) => vendor.status === "pending")
        .map((vendor) => vendor._id.toString())
        .sort()
        .reverse();
      const result = await request("/vendors?status=pending&page=2&limit=1");
      assert.equal(result.response.status, 200);
      assert.equal(result.payload.data.vendors[0].id, pendingIds[1]);
      assert.deepEqual(result.payload.data.pagination, {
        page: 2,
        limit: 1,
        total: 3,
        totalPages: 3,
      });
      const rejected = await request("/vendors?status=rejected");
      assert.equal(rejected.payload.data.vendors.length, 1);
      assert.equal(rejected.payload.data.vendors[0].status, "rejected");
      const emptyPage = await request("/vendors?page=100&limit=100");
      assert.deepEqual(emptyPage.payload.data.vendors, []);
    });

    test("an empty list returns 200 with zero total pages", async () => {
      vendors.clear();
      const { response, payload } = await request();
      assert.equal(response.status, 200);
      assert.deepEqual(payload.data, {
        vendors: [],
        pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
      });
    });

    test("rejects invalid filters and pagination before querying storage", async () => {
      for (const query of [
        "status=all",
        "status[$ne]=pending",
        "status=pending&status=approved",
        "page=0",
        "page=-1",
        "page=1.5",
        "page=not-a-number",
        "page=10001",
        "limit=0",
        "limit=101",
        "limit=1.5",
        "page=1&page=2",
        "ownerId=anything",
      ]) {
        const { response, payload } = await request(`/vendors?${query}`);
        assert.equal(response.status, 422, query);
        assert.equal(payload.error.code, "VALIDATION_FAILED");
      }
      assert.equal(listQueries.length, 0);
    });

    test("approval records the reviewer and grants vendor while preserving existing roles", async () => {
      users.get(accounts.customer._id.toString()).roles = ["customer", "admin"];
      const { response, payload } = await review("approved");
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("cache-control"), "no-store");
      const vendor = payload.data.vendor;
      assert.equal(vendor.status, "approved");
      assert.equal(vendor.reviewedBy, accounts.admin._id.toString());
      assert.ok(Number.isFinite(Date.parse(vendor.reviewedAt)));
      assert.equal(JSON.stringify(payload).includes("DO_NOT_EXPOSE"), false);
      assert.deepEqual(users.get(accounts.customer._id.toString()).roles, [
        "customer",
        "admin",
        "vendor",
      ]);
      assert.equal(transactions[0].committed, true);
      assert.deepEqual(transactions[0].options, {
        readPreference: "primary",
        readConcern: { level: "snapshot" },
        writeConcern: { w: "majority" },
      });
      assert.equal(roleWrites[0].session, transactions[0].session);
      const me = await fetch(`${baseUrl}/api/auth/me`, {
        headers: { Authorization: `Bearer ${tokens.customer}` },
      });
      assert.deepEqual((await me.json()).data.user.roles, [
        "customer",
        "admin",
        "vendor",
      ]);
    });

    test("an already-present vendor role is not duplicated", async () => {
      users.get(accounts.customer._id.toString()).roles.push("vendor");
      assert.equal((await review("approved")).response.status, 200);
      assert.deepEqual(users.get(accounts.customer._id.toString()).roles, [
        "customer",
        "vendor",
      ]);
    });

    test("rejection records audit details without changing the owner's roles", async () => {
      const { response, payload } = await review("rejected");
      assert.equal(response.status, 200);
      assert.equal(payload.data.vendor.status, "rejected");
      assert.equal(
        payload.data.vendor.reviewedBy,
        accounts.admin._id.toString(),
      );
      assert.deepEqual(users.get(accounts.customer._id.toString()).roles, [
        "customer",
      ]);
      assert.equal(roleWrites.length, 0);
      const mine = await fetch(`${baseUrl}/api/vendors/me`, {
        headers: { Authorization: `Bearer ${tokens.customer}` },
      });
      assert.equal((await mine.json()).data.vendor.status, "rejected");
    });

    test("only approved/rejected are accepted and server-owned review fields cannot be supplied", async () => {
      for (const body of [
        {},
        [],
        { status: "pending" },
        { status: "APPROVED" },
        { status: "approved", reviewedBy: accounts.customer._id.toString() },
        { status: "approved", reviewedAt: "2000-01-01" },
        { status: "approved", ownerId: accounts.admin._id.toString() },
        { status: "approved", roles: ["admin"] },
      ]) {
        const { response, payload } = await review("approved", { body });
        assert.equal(response.status, 422);
        assert.equal(payload.error.code, "VALIDATION_FAILED");
      }
      assert.equal(transactions.length, 0);
    });

    test("invalid document IDs fail validation and an unknown valid ID returns 404", async () => {
      for (const id of ["invalid", "a".repeat(23), "z".repeat(24)]) {
        assert.equal(
          (
            await request(`/vendors/${id}/review`, {
              body: { status: "approved" },
            })
          ).response.status,
          422,
        );
      }
      assert.equal(transactions.length, 0);
      const missing = await request(
        `/vendors/${new mongoose.Types.ObjectId()}/review`,
        { body: { status: "approved" } },
      );
      assert.equal(missing.response.status, 404);
      assert.equal(missing.payload.error.code, "VENDOR_APPLICATION_NOT_FOUND");
      assert.equal(roleWrites.length, 0);
    });

    test("completed reviews cannot be overwritten or grant a role after rejection", async () => {
      await review("rejected");
      const original = vendors.get(application._id.toString());
      for (const status of ["approved", "rejected"]) {
        const { response, payload } = await review(status, {
          token: tokens.anotherAdmin,
        });
        assert.equal(response.status, 409);
        assert.equal(payload.error.code, "VENDOR_ALREADY_REVIEWED");
      }
      assert.equal(
        vendors.get(application._id.toString()).reviewedBy.toString(),
        original.reviewedBy.toString(),
      );
      assert.deepEqual(users.get(accounts.customer._id.toString()).roles, [
        "customer",
      ]);
    });

    test("concurrent reviews resolve to one decision and one conflict", async () => {
      const results = await Promise.all([
        review("approved"),
        review("rejected", { token: tokens.anotherAdmin }),
      ]);
      assert.deepEqual(
        results.map(({ response }) => response.status).sort(),
        [200, 409],
      );
      const winner = results.find(({ response }) => response.status === 200)
        .payload.data.vendor;
      assert.equal(
        vendors.get(application._id.toString()).status,
        winner.status,
      );
      assert.equal(
        users.get(accounts.customer._id.toString()).roles.includes("vendor"),
        winner.status === "approved",
      );
      assert.equal(
        transactions.filter((transaction) => transaction.committed).length,
        1,
      );
    });

    test("a missing or disabled owner aborts approval and leaves the application pending", async () => {
      users.get(accounts.customer._id.toString()).status = "disabled";
      for (const remove of [false, true]) {
        if (remove) users.delete(accounts.customer._id.toString());
        const { response, payload } = await review("approved");
        assert.equal(response.status, 409);
        assert.equal(payload.error.code, "VENDOR_OWNER_UNAVAILABLE");
        const stored = vendors.get(application._id.toString());
        assert.equal(stored.status, "pending");
        assert.equal(stored.reviewedBy, null);
        assert.equal(stored.reviewedAt, null);
      }
      assert.ok(transactions.every((transaction) => transaction.aborted));
    });

    test("a role-write failure rolls back the staged review and hides internal errors", async (context) => {
      context.mock.method(console, "error", () => {});
      failRoleWrite = true;
      const { response, payload } = await review("approved");
      assert.equal(response.status, 500);
      assert.equal(payload.error.code, "INTERNAL_ERROR");
      assert.equal(JSON.stringify(payload).includes("DO_NOT_EXPOSE"), false);
      assert.equal(vendors.get(application._id.toString()).status, "pending");
      assert.equal(vendors.get(application._id.toString()).reviewedAt, null);
      assert.deepEqual(users.get(accounts.customer._id.toString()).roles, [
        "customer",
      ]);
      assert.equal(transactions[0].aborted, true);
    });

    test("a commit failure cannot return success or persist either staged update", async (context) => {
      context.mock.method(console, "error", () => {});
      failCommit = true;
      const { response, payload } = await review("approved");
      assert.equal(response.status, 500);
      assert.equal(JSON.stringify(payload).includes("DO_NOT_EXPOSE"), false);
      assert.equal(vendors.get(application._id.toString()).status, "pending");
      assert.deepEqual(users.get(accounts.customer._id.toString()).roles, [
        "customer",
      ]);
      failCommit = false;
      assert.equal((await review("approved")).response.status, 200);
    });

    test("an unavailable transaction or listing database returns a safe error", async (context) => {
      context.mock.method(console, "error", () => {});
      context.mock.method(mongoose.connection, "transaction", async () => {
        throw new Error("DO_NOT_EXPOSE_CONNECTION");
      });
      const reviewResult = await review("approved");
      assert.equal(reviewResult.response.status, 500);
      assert.equal(
        JSON.stringify(reviewResult.payload).includes("DO_NOT_EXPOSE"),
        false,
      );
      context.mock.method(Vendor, "countDocuments", async () => {
        throw new Error("DO_NOT_EXPOSE_QUERY");
      });
      const listing = await request();
      assert.equal(listing.response.status, 500);
      assert.equal(
        JSON.stringify(listing.payload).includes("DO_NOT_EXPOSE"),
        false,
      );
    });

    test("the review listing index includes status and stable descending sort keys", () => {
      assert.ok(
        Vendor.schema
          .indexes()
          .some(
            ([keys]) =>
              keys.status === 1 && keys.createdAt === -1 && keys._id === -1,
          ),
      );
    });
  },
);
