import { expect, test } from "vitest";
import {
  EMPTY_CATALOG_FILTERS,
  MAX_SEARCH_PAGE,
  readCatalogSearch,
  createCatalogSearchParams,
  validateCatalogFilters,
} from "../src/utils/catalogSearch.js";
import { parsePriceInPaise } from "../src/utils/productPrice.js";

test("an empty URL produces numeric pagination defaults and no filters", () => {
  const search = readCatalogSearch(new URLSearchParams());
  expect(search.values).toEqual(EMPTY_CATALOG_FILTERS);
  expect(search.request).toEqual({ page: 1, limit: 12 });
  expect(search.invalid).toBe(false);
  expect(search.hasFilters).toBe(false);
});

test("rupee filters become exact paise and keywords remain literal URL text", () => {
  const values = {
    ...EMPTY_CATALOG_FILTERS,
    q: " tea & coffee ",
    category: " HOME ",
    minPrice: "0",
    maxPrice: "499.99",
    availability: "in",
    sort: "price_asc",
  };
  expect(validateCatalogFilters(values)).toEqual({});
  const params = createCatalogSearchParams(values, 2);
  expect(Object.fromEntries(params)).toEqual({
    q: "tea & coffee",
    category: "home",
    minPriceInPaise: "0",
    maxPriceInPaise: "49999",
    inStock: "true",
    sort: "price_asc",
    page: "2",
  });
  expect(new URLSearchParams(params.toString()).get("q")).toBe("tea & coffee");
});

test("a saved search restores rupee inputs, availability and page", () => {
  const value = readCatalogSearch(
    new URLSearchParams(
      "q=mug&category=HOME&minPriceInPaise=1&maxPriceInPaise=50000&inStock=false&sort=newest&page=3",
    ),
  );
  expect(value.values).toEqual({
    q: "mug",
    category: "home",
    minPrice: "0.01",
    maxPrice: "500.00",
    availability: "out",
    sort: "newest",
  });
  expect(value.request.page).toBe(3);
  expect(value.request.limit).toBe(12);
  expect(value.invalid).toBe(false);
});

test("malformed, duplicated and unsupported URL parameters never reach the API", () => {
  const value = readCatalogSearch(
    new URLSearchParams(
      "q=a&q=b&category=x&minPriceInPaise=-1&maxPriceInPaise=1.5&inStock=maybe&sort=script&page=99999&status=draft&utm_source=test",
    ),
  );
  expect(value.invalid).toBe(true);
  expect(value.values).toEqual(EMPTY_CATALOG_FILTERS);
  expect(value.request).toEqual({ page: 1, limit: 12 });
});

test("invalid decimal prices and reversed ranges have specific field errors", () => {
  for (const minPrice of ["-1", "0.001", "1e2", "1,000", "1000000.01"]) {
    expect(
      validateCatalogFilters({ ...EMPTY_CATALOG_FILTERS, minPrice }).minPrice,
    ).toBeTruthy();
  }
  expect(
    validateCatalogFilters({
      ...EMPTY_CATALOG_FILTERS,
      minPrice: "500",
      maxPrice: "100",
    }).maxPrice,
  ).toBe("Maximum price must be at least the minimum price.");
  const restored = readCatalogSearch(
    new URLSearchParams("minPriceInPaise=50000&maxPriceInPaise=10000"),
  );
  expect(restored.invalid).toBe(true);
  expect(restored.request.minPriceInPaise).toBeUndefined();
  expect(restored.request.maxPriceInPaise).toBeUndefined();
});

test("pagination stays within the backend search window", () => {
  expect(
    readCatalogSearch(new URLSearchParams(`page=${MAX_SEARCH_PAGE}`)).page,
  ).toBe(MAX_SEARCH_PAGE);
  const invalid = readCatalogSearch(
    new URLSearchParams(`page=${MAX_SEARCH_PAGE + 1}`),
  );
  expect(invalid.page).toBe(1);
  expect(invalid.invalid).toBe(true);
});

test("zero is valid for a filter while product prices retain their positive minimum", () => {
  expect(parsePriceInPaise("0", { allowZero: true })).toBe(0);
  expect(parsePriceInPaise("0")).toBeNull();
  expect(
    validateCatalogFilters({
      ...EMPTY_CATALOG_FILTERS,
      minPrice: "0",
      maxPrice: "0",
    }),
  ).toEqual({});
});
