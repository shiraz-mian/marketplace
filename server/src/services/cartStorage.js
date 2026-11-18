import { randomUUID } from "node:crypto";
import { CART_LIMITS } from "../config/cart.js";
import { getRedisConfig, runRedis, cartUnavailable } from "../config/redis.js";
import { CART_MUTATION_SCRIPT } from "./cartScript.js";
import { ApiError } from "../utils/ApiError.js";

const cartKey = (userId) => {
  if (!/^[a-f0-9]{24}$/i.test(userId))
    throw new TypeError("Invalid cart owner");
  return `${getRedisConfig().prefix}:{${userId.toLowerCase()}}`;
};

const decodeCart = (hash) => {
  const version = hash._version ?? "0";
  const entries = Object.entries(hash).filter(([key]) => !key.startsWith("_"));
  if (
    entries.length > CART_LIMITS.items ||
    !/^(?:0|[0-9a-f-]{36})$/i.test(version) ||
    entries.some(
      ([id, quantity]) =>
        !/^[a-f0-9]{24}$/i.test(id) ||
        !/^\d+$/.test(quantity) ||
        Number(quantity) < 1 ||
        Number(quantity) > CART_LIMITS.quantity,
    )
  )
    throw cartUnavailable();
  return {
    version,
    items: entries
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([productId, quantity]) => ({
        productId,
        quantity: Number(quantity),
      })),
  };
};

const read = async (userId) =>
  decodeCart(await runRedis((client) => client.hGetAll(cartKey(userId))));

const ERRORS = {
  CART_CHANGED: [
    409,
    "Your cart changed in another tab. Refresh it and try again.",
  ],
  CART_ITEM_NOT_FOUND: [404, "This item is no longer in your cart."],
  CART_STOCK_LIMIT: [
    409,
    "That quantity is not available. Refresh your cart to check current stock.",
  ],
  CART_FULL: [409, "Your cart can hold up to 50 different products."],
  IDEMPOTENCY_CONFLICT: [
    409,
    "This add request has already been used for a different item.",
  ],
};

const mutate = async (
  userId,
  {
    action,
    productId = "",
    quantity = 0,
    stock = 0,
    version = "",
    operationId = "",
  },
) => {
  const result = await runRedis((client) =>
    client.eval(CART_MUTATION_SCRIPT, {
      keys: [cartKey(userId)],
      arguments: [
        action,
        productId,
        String(quantity),
        String(stock),
        version,
        randomUUID(),
        operationId,
        String(CART_LIMITS.ttlSeconds),
        String(CART_LIMITS.items),
        String(CART_LIMITS.quantity),
        String(CART_LIMITS.operationHistory),
      ],
    }),
  );
  if (result[0] !== "OK") {
    const error = ERRORS[result[0]];
    if (!error) throw cartUnavailable();
    throw new ApiError(error[0], result[0], error[1]);
  }
  const hash = {};
  for (let index = 0; index < result[1].length; index += 2)
    hash[result[1][index]] = result[1][index + 1];
  return decodeCart(hash);
};

const cartStorage = { read, mutate };

export { cartStorage, cartKey };
