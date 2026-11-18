import {
  addCartItemSchema,
  updateCartItemSchema,
  cartItemParamsSchema,
  cartVersionSchema,
  cartOperationSchema,
} from "../validators/cartValidator.js";
import {
  getCart,
  addCartItem,
  updateCartItem,
  removeCartItem,
  clearCart,
} from "../services/cartService.js";
import { apiResponse } from "../utils/apiResponse.js";

const sendCart = (res, cart, message) =>
  res.set("ETag", `"${cart.version}"`).json(apiResponse({ cart }, message));
const readCart = async (req, res) =>
  sendCart(res, await getCart(req.user.id), "Cart loaded.");
const addItem = async (req, res) => {
  const input = addCartItemSchema.parse(req.body);
  const operationId = cartOperationSchema.parse(req.get("Idempotency-Key"));
  return sendCart(
    res,
    await addCartItem(req.user.id, input, operationId),
    "Item added to cart.",
  );
};
const updateItem = async (req, res) => {
  const { productId } = cartItemParamsSchema.parse(req.params);
  const { quantity } = updateCartItemSchema.parse(req.body);
  const version = cartVersionSchema.parse(req.get("If-Match"));
  return sendCart(
    res,
    await updateCartItem(req.user.id, productId, quantity, version),
    "Cart updated.",
  );
};
const removeItem = async (req, res) => {
  const { productId } = cartItemParamsSchema.parse(req.params);
  const version = cartVersionSchema.parse(req.get("If-Match"));
  return sendCart(
    res,
    await removeCartItem(req.user.id, productId, version),
    "Item removed from cart.",
  );
};
const emptyCart = async (req, res) => {
  const version = cartVersionSchema.parse(req.get("If-Match"));
  return sendCart(res, await clearCart(req.user.id, version), "Cart cleared.");
};

export { readCart, addItem, updateItem, removeItem, emptyCart };
