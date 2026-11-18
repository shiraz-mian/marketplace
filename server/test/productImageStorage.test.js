import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { after, before, describe, test } from "node:test";
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { productImageStorage } from "../src/services/productImageStorage.js";

describe(
  "S3 image adapter (requests intercepted, signing runs locally)",
  { concurrency: false },
  () => {
    const keys = [
      "AWS_REGION",
      "S3_BUCKET",
      "AWS_ACCESS_KEY_ID",
      "AWS_SECRET_ACCESS_KEY",
      "AWS_SESSION_TOKEN",
      "AWS_PROFILE",
    ];
    const original = Object.fromEntries(
      keys.map((key) => [key, process.env[key]]),
    );
    before(() => {
      Object.assign(process.env, {
        AWS_REGION: "us-east-1",
        S3_BUCKET: "marketplace-unit-test-only",
        AWS_ACCESS_KEY_ID: "UNIT_TEST_ACCESS_KEY",
        AWS_SECRET_ACCESS_KEY: randomBytes(32).toString("hex"),
      });
      delete process.env.AWS_PROFILE;
      delete process.env.AWS_SESSION_TOKEN;
    });
    after(() => {
      for (const [key, value] of Object.entries(original)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    });
    test("uses private encrypted WebP objects and signs a 15-minute read URL without calling AWS", async (context) => {
      const sent = [];
      context.mock.method(S3Client.prototype, "send", async (command) => {
        sent.push(command);
        return {};
      });
      const key = "product-images/vendor/product/fixture.webp";
      const bytes = Buffer.from("test webp fixture");
      await productImageStorage.upload(key, bytes);
      assert.ok(sent[0] instanceof PutObjectCommand);
      assert.equal(sent[0].input.Bucket, "marketplace-unit-test-only");
      assert.equal(sent[0].input.ContentType, "image/webp");
      assert.equal(sent[0].input.ServerSideEncryption, "AES256");
      assert.equal(sent[0].input.ACL, undefined);
      assert.equal(sent[0].input.Body, bytes);
      const url = new URL(await productImageStorage.sign(key));
      assert.equal(url.protocol, "https:");
      assert.ok(url.hostname.startsWith("marketplace-unit-test-only.s3."));
      assert.equal(url.searchParams.get("X-Amz-Expires"), "900");
      await productImageStorage.remove(key);
      assert.ok(sent[1] instanceof DeleteObjectCommand);
      assert.equal(sent[1].input.Key, key);
      assert.equal(sent.length, 2);
    });
    test("provider failures become safe 503 responses", async (context) => {
      context.mock.method(console, "error", () => {});
      context.mock.method(S3Client.prototype, "send", async () => {
        throw new Error("DO_NOT_EXPOSE_PROVIDER_DETAILS");
      });
      await assert.rejects(
        productImageStorage.upload(
          "product-images/fixture.webp",
          Buffer.from("fixture"),
        ),
        (error) => {
          assert.equal(error.statusCode, 503);
          assert.equal(error.code, "IMAGE_STORAGE_UNAVAILABLE");
          assert.equal(error.message.includes("DO_NOT_EXPOSE"), false);
          return true;
        },
      );
    });
  },
);
