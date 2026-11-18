import assert from "node:assert/strict";
import { test } from "vitest";
import { AxiosError } from "axios";
import { getRegistrationError } from "../src/utils/getRegistrationError.js";

const apiFailure = (status, error) =>
  new AxiosError(
    "Private transport details",
    "ERR_BAD_REQUEST",
    undefined,
    undefined,
    { status, data: { error } },
  );

test("duplicate emails identify the email field with a useful message", () => {
  const result = getRegistrationError(
    apiFailure(409, { code: "EMAIL_ALREADY_EXISTS" }),
  );
  assert.match(result.message, /already exists/);
  assert.match(result.fieldErrors.email, /different email/);
});

test("validation errors highlight only known fields and use readable messages", () => {
  const result = getRegistrationError(
    apiFailure(422, {
      code: "VALIDATION_FAILED",
      details: [
        { field: "name", message: "INTERNAL_SCHEMA_DETAILS" },
        { field: "password", message: "INTERNAL_SCHEMA_DETAILS" },
        { field: "roles", message: "DO_NOT_DISPLAY" },
        { field: "__proto__", message: "DO_NOT_DISPLAY" },
        null,
      ],
    }),
  );
  assert.deepEqual(Object.keys(result.fieldErrors), ["name", "password"]);
  assert.match(result.fieldErrors.password, /15 and 128/);
  assert.equal(
    JSON.stringify(result).includes("INTERNAL_SCHEMA_DETAILS"),
    false,
  );
  assert.equal(JSON.stringify(result).includes("DO_NOT_DISPLAY"), false);
});

test("missing or malformed validation details still produce a useful general error", () => {
  for (const details of [undefined, null, "invalid", {}]) {
    const result = getRegistrationError(
      apiFailure(422, { code: "VALIDATION_FAILED", details }),
    );
    assert.match(result.message, /check your details/);
    assert.deepEqual(result.fieldErrors, {});
  }
});

test("both Axios timeout codes produce a retry message", () => {
  for (const code of ["ECONNABORTED", "ETIMEDOUT"]) {
    assert.match(
      getRegistrationError(new AxiosError("Private details", code)).message,
      /took too long/,
    );
  }
});

test("network failures explain that the server could not be reached", () => {
  const result = getRegistrationError(
    new AxiosError("Private details", "ERR_NETWORK"),
  );
  assert.match(result.message, /reach the server/);
  assert.deepEqual(result.fieldErrors, {});
});

test("rate limits ask the user to wait", () => {
  assert.match(
    getRegistrationError(apiFailure(429, { code: "RATE_LIMITED" })).message,
    /wait a while/,
  );
});

test("server failures never expose raw backend or transport details", () => {
  const result = getRegistrationError(
    apiFailure(500, {
      code: "INTERNAL_ERROR",
      message: "DO_NOT_EXPOSE_DATABASE_DETAILS",
    }),
  );
  assert.equal(JSON.stringify(result).includes("DO_NOT_EXPOSE"), false);
  assert.equal(
    JSON.stringify(result).includes("Private transport details"),
    false,
  );
  assert.match(result.message, /try again/);
});

test("unexpected JavaScript errors and non-JSON responses have safe fallbacks", () => {
  const malformed = new AxiosError(
    "Private details",
    "ERR_BAD_RESPONSE",
    undefined,
    undefined,
    {
      status: 502,
      data: "<html>Private proxy details</html>",
    },
  );
  for (const error of [new Error("DO_NOT_EXPOSE"), null, malformed]) {
    const result = getRegistrationError(error);
    assert.match(result.message, /try again/);
    assert.deepEqual(result.fieldErrors, {});
    assert.equal(JSON.stringify(result).includes("DO_NOT_EXPOSE"), false);
  }
});
