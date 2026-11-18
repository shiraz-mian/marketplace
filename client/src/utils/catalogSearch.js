import { parsePriceInPaise } from "./productPrice.js";

const CATALOG_PAGE_SIZE = 12;
const MAX_SEARCH_PAGE = Math.floor(10000 / CATALOG_PAGE_SIZE);
const CATALOG_SORTS = Object.freeze([
  { value: "relevance", label: "Best match" },
  { value: "newest", label: "Newest first" },
  { value: "price_asc", label: "Lowest price" },
  { value: "price_desc", label: "Highest price" },
]);
const EMPTY_CATALOG_FILTERS = Object.freeze({
  q: "",
  category: "",
  minPrice: "",
  maxPrice: "",
  availability: "all",
  sort: "relevance",
});

const validateCatalogFilters = (values) => {
  const errors = {};
  if (values.q.trim().length > 100) errors.q = "Use up to 100 characters.";
  const category = values.category.trim();
  if (category && (category.length < 2 || category.length > 50)) {
    errors.category = "Use a category with 2 to 50 characters.";
  }
  const min = values.minPrice.trim()
    ? parsePriceInPaise(values.minPrice, { allowZero: true })
    : undefined;
  const max = values.maxPrice.trim()
    ? parsePriceInPaise(values.maxPrice, { allowZero: true })
    : undefined;
  for (const [key, value] of [
    ["minPrice", min],
    ["maxPrice", max],
  ]) {
    if (value === null)
      errors[key] = "Enter ₹0 to ₹10,00,000, with at most two decimal places.";
  }
  if (
    min !== null &&
    max !== null &&
    min !== undefined &&
    max !== undefined &&
    min > max
  ) {
    errors.maxPrice = "Maximum price must be at least the minimum price.";
  }
  return errors;
};

const createCatalogSearchParams = (values, page = 1) => {
  const params = new URLSearchParams();
  if (values.q.trim()) params.set("q", values.q.trim());
  if (values.category.trim())
    params.set("category", values.category.trim().toLowerCase());
  for (const [field, key] of [
    ["minPrice", "minPriceInPaise"],
    ["maxPrice", "maxPriceInPaise"],
  ]) {
    if (values[field].trim())
      params.set(
        key,
        String(parsePriceInPaise(values[field], { allowZero: true })),
      );
  }
  if (values.availability !== "all")
    params.set("inStock", String(values.availability === "in"));
  if (values.sort !== "relevance") params.set("sort", values.sort);
  if (page > 1) params.set("page", String(page));
  return params;
};

const readCatalogSearch = (searchParams) => {
  let invalid = false;
  const single = (key) => {
    const values = searchParams.getAll(key);
    if (values.length > 1) {
      invalid = true;
      return null;
    }
    return values[0] ?? null;
  };
  const values = { ...EMPTY_CATALOG_FILTERS };
  const q = single("q")?.trim() ?? "";
  const category = single("category")?.trim().toLowerCase() ?? "";
  if (q.length <= 100) values.q = q;
  else invalid = true;
  if (!category || (category.length >= 2 && category.length <= 50))
    values.category = category;
  else invalid = true;
  for (const [field, key] of [
    ["minPrice", "minPriceInPaise"],
    ["maxPrice", "maxPriceInPaise"],
  ]) {
    const raw = single(key);
    if (raw === null) continue;
    const paise = /^\d+$/.test(raw) ? Number(raw) : NaN;
    if (Number.isSafeInteger(paise) && paise >= 0 && paise <= 100000000) {
      values[field] = (paise / 100).toFixed(2);
    } else invalid = true;
  }
  if (Object.keys(validateCatalogFilters(values)).length) {
    values.minPrice = "";
    values.maxPrice = "";
    invalid = true;
  }
  const availability = single("inStock");
  if (availability === "true") values.availability = "in";
  else if (availability === "false") values.availability = "out";
  else if (availability !== null) invalid = true;
  const sort = single("sort");
  if (CATALOG_SORTS.some((option) => option.value === sort)) values.sort = sort;
  else if (sort !== null) invalid = true;
  const rawPage = single("page");
  let page = 1;
  if (rawPage !== null) {
    const number = /^\d+$/.test(rawPage) ? Number(rawPage) : NaN;
    if (Number.isInteger(number) && number >= 1 && number <= MAX_SEARCH_PAGE)
      page = number;
    else invalid = true;
  }
  const params = createCatalogSearchParams(values, page);
  return {
    values,
    page,
    invalid,
    request: { ...Object.fromEntries(params), page, limit: CATALOG_PAGE_SIZE },
    hasFilters: Boolean(
      values.q ||
      values.category ||
      values.minPrice ||
      values.maxPrice ||
      values.availability !== "all",
    ),
  };
};

export {
  CATALOG_PAGE_SIZE,
  MAX_SEARCH_PAGE,
  CATALOG_SORTS,
  EMPTY_CATALOG_FILTERS,
  validateCatalogFilters,
  createCatalogSearchParams,
  readCatalogSearch,
};
