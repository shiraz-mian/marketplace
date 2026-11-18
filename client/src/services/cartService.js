import { protectedApiClient } from "../api/apiClient.js";

const integerBetween = (value, min, max) =>
  Number.isSafeInteger(value) && value >= min && value <= max;
const validCartItem = (item) => {
  if (
    !item ||
    !/^[a-f0-9]{24}$/i.test(item.productId) ||
    !integerBetween(item.quantity, 1, 99) ||
    ![null, "PRODUCT_UNAVAILABLE", "INSUFFICIENT_STOCK"].includes(item.issue) ||
    !(
      item.lineTotalInPaise === null ||
      integerBetween(item.lineTotalInPaise, 0, 9900000000)
    )
  )
    return false;
  if (item.product === null) return item.issue === "PRODUCT_UNAVAILABLE";
  const product = item.product;
  return (
    product &&
    typeof product.title === "string" &&
    typeof product.storeName === "string" &&
    product.currency === "INR" &&
    integerBetween(product.priceInPaise, 1, 100000000) &&
    integerBetween(product.stock, 0, 1000000) &&
    (product.imageUrl === null || typeof product.imageUrl === "string")
  );
};

const readCart = ({ status, data }) => {
  const cart = data?.data?.cart;
  if (
    status !== 200 ||
    data?.success !== true ||
    !cart ||
    typeof cart.version !== "string" ||
    !Array.isArray(cart.items) ||
    cart.items.length > 50 ||
    !cart.items.every(validCartItem) ||
    cart.currency !== "INR" ||
    !integerBetween(cart.summary?.itemCount, 0, 4950) ||
    !integerBetween(cart.summary?.subtotalInPaise, 0, 495000000000) ||
    typeof cart.summary?.hasIssues !== "boolean"
  ) {
    throw new Error("Unexpected cart response.");
  }
  return cart;
};
const getCart = async ({ signal } = {}) =>
  readCart(await protectedApiClient.get("/cart", { signal }));
const addCartItem = async (productId, quantity, operationId, { signal } = {}) =>
  readCart(
    await protectedApiClient.post(
      "/cart/items",
      { productId, quantity },
      { signal, headers: { "Idempotency-Key": operationId } },
    ),
  );
const updateCartItem = async (productId, quantity, version, { signal } = {}) =>
  readCart(
    await protectedApiClient.patch(
      `/cart/items/${productId}`,
      { quantity },
      { signal, headers: { "If-Match": `"${version}"` } },
    ),
  );
const removeCartItem = async (productId, version, { signal } = {}) =>
  readCart(
    await protectedApiClient.delete(`/cart/items/${productId}`, {
      signal,
      headers: { "If-Match": `"${version}"` },
    }),
  );
const clearCart = async (version, { signal } = {}) =>
  readCart(
    await protectedApiClient.delete("/cart", {
      signal,
      headers: { "If-Match": `"${version}"` },
    }),
  );

export { getCart, addCartItem, updateCartItem, removeCartItem, clearCart };
