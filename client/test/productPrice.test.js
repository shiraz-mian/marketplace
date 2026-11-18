import { expect, test } from "vitest";
import { parsePriceInPaise, formatPrice } from "../src/utils/productPrice.js";

test("decimal rupees become exact integer paise including trailing and leading fractional zeros", () => {
  expect(parsePriceInPaise("499.99")).toBe(49999);
  expect(parsePriceInPaise("1.10")).toBe(110);
  expect(parsePriceInPaise("0.01")).toBe(1);
  expect(parsePriceInPaise(" 1000000.00 ")).toBe(100000000);
});
test("invalid, excessive-precision and out-of-range prices are rejected", () => {
  for (const value of [
    "",
    "0",
    "-1",
    "1.001",
    "1e3",
    "1,000",
    "1000000.01",
    "NaN",
    "Infinity",
  ]) {
    expect(parsePriceInPaise(value)).toBeNull();
  }
  expect(formatPrice(49999)).toBe("₹499.99");
});
