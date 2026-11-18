import { z } from "zod";
import { CART_LIMITS } from "../config/cart.js";

const cartProductId = z
  .string()
  .regex(/^[a-fA-F0-9]{24}$/)
  .transform((value) => value.toLowerCase());
const cartQuantity = z.number().int().min(1).max(CART_LIMITS.quantity);
const addCartItemSchema = z.strictObject({
  productId: cartProductId,
  quantity: cartQuantity.default(1),
});
const updateCartItemSchema = z.strictObject({ quantity: cartQuantity });
const cartItemParamsSchema = z.strictObject({ productId: cartProductId });
const cartVersionSchema = z
  .string()
  .regex(
    /^"(?:0|[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})"$/i,
  )
  .transform((value) => value.slice(1, -1));
const cartOperationSchema = z.uuid();

export {
  addCartItemSchema,
  updateCartItemSchema,
  cartItemParamsSchema,
  cartVersionSchema,
  cartOperationSchema,
};
