import { expect, test } from "vitest";
import { parseCartQuantity } from "../src/utils/cartQuantity.js";
import { getLoginRedirect } from "../src/utils/loginRedirect.js";

test("cart quantities respect current stock and the per-product limit", () => {
  expect(parseCartQuantity("1", 5)).toBe(1);
  expect(parseCartQuantity("5", 5)).toBe(5);
  expect(parseCartQuantity("99", 1000)).toBe(99);
  for (const value of ["", "0", "-1", "1.5", "1e1", "100", " 2 "])
    expect(parseCartQuantity(value, 1000)).toBeNull();
  expect(parseCartQuantity("6", 5)).toBeNull();
  expect(parseCartQuantity("1", 0)).toBeNull();
});

test("login returns to a local cart or product path without allowing external redirects", () => {
  expect(getLoginRedirect("/cart")).toBe("/cart");
  expect(getLoginRedirect("/products/507f1f77bcf86cd799439013?q=mug")).toBe(
    "/products/507f1f77bcf86cd799439013?q=mug",
  );
  for (const value of [
    undefined,
    "https://external.example/",
    "//external.example/cart",
    "/\\external.example/cart",
    "/login",
    "/register",
    "/LOGIN/",
    "/register///",
    "/account",
    "/ACCOUNT/",
    "/account?tab=profile",
  ]) {
    expect(getLoginRedirect(value)).toBe("/");
  }
});
