import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, test } from "node:test";
import { User } from "../src/models/userModel.js";
import { grantAdminRole, parseAdminEmail } from "../scripts/grantAdmin.js";

describe(
  "Local admin setup (database writes stubbed)",
  { concurrency: false },
  () => {
    let account;

    beforeEach(async () => {
      const document = new User({
        name: "Demo Administrator",
        emailNormalized: "admin@example.com",
        passwordHash: "DO_NOT_EXPOSE_PASSWORD_HASH",
        roles: ["customer", "vendor"],
      });
      await document.validate();
      account = document.toObject();
    });

    test("requires exactly one valid email and normalizes it before connecting", () => {
      assert.equal(
        parseAdminEmail(["  ADMIN@Example.com  "]),
        "admin@example.com",
      );
      for (const args of [
        [],
        ["not-an-email"],
        [""],
        [null],
        ["admin@example.com", "extra"],
        ["a".repeat(255)],
      ]) {
        assert.throws(() => parseAdminEmail(args), { name: "ZodError" });
      }
    });

    test("grants admin to an existing active account without replacing or duplicating roles", async (context) => {
      context.mock.method(
        User,
        "findOneAndUpdate",
        async (filter, update, options) => {
          assert.deepEqual(filter, {
            emailNormalized: "admin@example.com",
            status: "active",
          });
          assert.deepEqual(update, { $addToSet: { roles: "admin" } });
          assert.equal(options.upsert, false);
          assert.equal(options.runValidators, true);
          assert.equal(options.projection, "roles");
          if (!account.roles.includes("admin")) account.roles.push("admin");
          return account;
        },
      );
      const result = await grantAdminRole(
        parseAdminEmail(["ADMIN@EXAMPLE.COM"]),
      );
      assert.deepEqual(result, {
        id: account._id.toString(),
        roles: ["customer", "vendor", "admin"],
      });
      await grantAdminRole("admin@example.com");
      assert.deepEqual(account.roles, ["customer", "vendor", "admin"]);
      assert.equal(account.passwordHash, "DO_NOT_EXPOSE_PASSWORD_HASH");
      assert.equal(Object.hasOwn(result, "passwordHash"), false);
    });

    test("missing or disabled accounts are not created or activated", async (context) => {
      context.mock.method(
        User,
        "findOneAndUpdate",
        async (filter, update, options) => {
          assert.equal(filter.status, "active");
          assert.equal(options.upsert, false);
          assert.equal(Object.hasOwn(update, "$set"), false);
          return null;
        },
      );
      await assert.rejects(grantAdminRole("missing@example.com"), {
        code: "ADMIN_ACCOUNT_NOT_FOUND",
        statusCode: 404,
      });
    });

    test("database failures propagate to the command boundary", async (context) => {
      const error = new Error("DO_NOT_EXPOSE_DATABASE_DETAILS");
      context.mock.method(User, "findOneAndUpdate", async () => {
        throw error;
      });
      await assert.rejects(grantAdminRole("admin@example.com"), error);
    });

    test("running the command without a target fails before loading credentials or connecting", async () => {
      const script = fileURLToPath(
        new URL("../scripts/grantAdmin.js", import.meta.url),
      );
      const result = await new Promise((resolve) => {
        execFile(
          process.execPath,
          [script],
          { windowsHide: true, timeout: 10000 },
          (error, stdout, stderr) => {
            resolve({ code: error?.code ?? 0, stdout, stderr });
          },
        );
      });
      assert.equal(result.code, 1);
      assert.match(result.stderr, /Usage: npm run admin:grant/);
      assert.equal(result.stdout.includes("MongoDB connected"), false);
    });
  },
);
