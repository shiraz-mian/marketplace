import { createClient } from "redis";
import { ApiError } from "../utils/ApiError.js";

let cachedClient;
let cachedUrl;
let connecting;

const cartUnavailable = () =>
  new ApiError(
    503,
    "CART_UNAVAILABLE",
    "Your cart is temporarily unavailable. Please try again shortly.",
  );

const getRedisConfig = () => {
  const url =
    process.env.REDIS_URL?.trim() ||
    (process.env.NODE_ENV !== "production" ? "redis://127.0.0.1:6379" : "");
  const prefix = process.env.REDIS_CART_PREFIX?.trim() || "marketplace:cart";
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw cartUnavailable();
  }
  if (
    !["redis:", "rediss:"].includes(parsed.protocol) ||
    parsed.hash ||
    parsed.search ||
    !/^[a-z][a-z0-9:_-]{0,63}$/.test(prefix) ||
    (process.env.NODE_ENV === "production" && parsed.protocol !== "rediss:")
  )
    throw cartUnavailable();
  return { url, prefix };
};

const getRedisClient = async () => {
  const { url } = getRedisConfig();
  if (cachedUrl === url && cachedClient?.isReady) return cachedClient;
  if (cachedUrl === url && connecting) return connecting;
  if (cachedClient?.isOpen) cachedClient.destroy();
  const client = createClient({
    url,
    disableOfflineQueue: true,
    commandsQueueMaxLength: 1000,
    commandOptions: { timeout: 2000 },
    socket: { connectTimeout: 2000, reconnectStrategy: false },
  });
  client.on("error", (error) =>
    console.error("Redis connection error:", error.name),
  );
  cachedClient = client;
  cachedUrl = url;
  const pending = client
    .connect()
    .then(() => client)
    .catch((error) => {
      if (client.isOpen) client.destroy();
      throw error;
    })
    .finally(() => {
      if (connecting === pending) connecting = undefined;
    });
  connecting = pending;
  return pending;
};

const runRedis = async (operation) => {
  let timer;
  try {
    const client = await getRedisClient();
    // Bound in-flight commands too, not just commands still waiting in the queue.
    return await Promise.race([
      Promise.resolve().then(() => operation(client)),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          if (client.isOpen) client.destroy();
          reject(new Error("Redis operation timed out"));
        }, 2500);
      }),
    ]);
  } catch (error) {
    console.error("Cart storage unavailable:", error.name);
    throw cartUnavailable();
  } finally {
    clearTimeout(timer);
  }
};

const closeRedisClient = async () => {
  if (cachedClient?.isOpen) cachedClient.destroy();
  cachedClient = undefined;
  cachedUrl = undefined;
  connecting = undefined;
};

export {
  getRedisConfig,
  getRedisClient,
  runRedis,
  closeRedisClient,
  cartUnavailable,
};
