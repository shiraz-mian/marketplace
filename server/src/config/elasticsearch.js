import { Client } from "@elastic/elasticsearch";
import { ApiError } from "../utils/ApiError.js";

let cachedClient;
let cachedKey;

const searchUnavailable = () =>
  new ApiError(
    503,
    "SEARCH_UNAVAILABLE",
    "Product search is temporarily unavailable. Please try again later.",
  );

const getSearchConfig = () => {
  const node =
    process.env.ELASTICSEARCH_URL?.trim() ||
    (process.env.NODE_ENV !== "production" ? "http://127.0.0.1:9200" : "");
  const index =
    process.env.ELASTICSEARCH_INDEX?.trim() || "marketplace-products-v1";
  const apiKey = process.env.ELASTICSEARCH_API_KEY?.trim();
  let url;
  try {
    url = new URL(node);
  } catch {
    throw searchUnavailable();
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/" ||
    !/^[a-z][a-z0-9_-]{0,99}$/.test(index) ||
    (process.env.NODE_ENV === "production" && url.protocol !== "https:")
  ) {
    throw searchUnavailable();
  }
  return { node: url.origin, index, apiKey };
};

const getSearchClient = () => {
  const config = getSearchConfig();
  const key = JSON.stringify([config.node, config.apiKey]);
  if (!cachedClient || cachedKey !== key) {
    cachedClient = new Client({
      node: config.node,
      ...(config.apiKey ? { auth: { apiKey: config.apiKey } } : {}),
      requestTimeout: 5000,
      maxRetries: 0,
    });
    cachedKey = key;
  }
  return cachedClient;
};

const closeSearchClient = async () => {
  if (cachedClient) await cachedClient.close();
  cachedClient = undefined;
  cachedKey = undefined;
};

export {
  getSearchConfig,
  getSearchClient,
  closeSearchClient,
  searchUnavailable,
};
