const CART_LIMITS = Object.freeze({
  items: 50,
  quantity: 99,
  operationHistory: 50,
  ttlSeconds: 30 * 24 * 60 * 60,
});
const CART_PRODUCT_FIELDS =
  "vendorId storeName title priceInPaise currency stock image";

export { CART_LIMITS, CART_PRODUCT_FIELDS };
