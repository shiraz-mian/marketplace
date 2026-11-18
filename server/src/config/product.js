const PRODUCT_STATUSES = Object.freeze(["draft", "active", "archived"]);
const PRODUCT_LIMITS = Object.freeze({
  titleMin: 2,
  titleMax: 150,
  descriptionMin: 20,
  descriptionMax: 5000,
  categoryMax: 50,
  maxPriceInPaise: 100000000,
  maxStock: 1000000,
  imageBytes: 5 * 1024 * 1024,
  imagePixels: 20000000,
});
const PRODUCT_FIELDS =
  "vendorId storeName title description category priceInPaise currency stock status image createdAt updatedAt";

export { PRODUCT_STATUSES, PRODUCT_LIMITS, PRODUCT_FIELDS };
