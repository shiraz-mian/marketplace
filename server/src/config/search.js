const SEARCH_SORTS = Object.freeze([
  "relevance",
  "newest",
  "price_asc",
  "price_desc",
]);
const SEARCH_BATCH_SIZE = 50;
const SEARCH_INTERVAL_MS = 2000;
const SEARCH_WINDOW = 10000;
const SEARCH_PRODUCT_FIELDS =
  "vendorId storeName title description category priceInPaise stock status createdAt searchVersion";

const PRODUCT_SEARCH_MAPPING = {
  dynamic: "strict",
  properties: {
    id: { type: "keyword" },
    vendorId: { type: "keyword" },
    storeName: { type: "text" },
    title: { type: "text" },
    description: { type: "text" },
    category: { type: "keyword" },
    priceInPaise: { type: "integer" },
    stock: { type: "integer" },
    status: { type: "keyword" },
    createdAt: { type: "date" },
  },
};

export {
  SEARCH_SORTS,
  SEARCH_BATCH_SIZE,
  SEARCH_INTERVAL_MS,
  SEARCH_WINDOW,
  SEARCH_PRODUCT_FIELDS,
  PRODUCT_SEARCH_MAPPING,
};
