import {
  getSearchClient,
  getSearchConfig,
  searchUnavailable,
} from "../config/elasticsearch.js";
import { PRODUCT_SEARCH_MAPPING } from "../config/search.js";

let readyIndex;
let preparing;

const ensure = async () => {
  const client = getSearchClient();
  const { index, node } = getSearchConfig();
  const key = `${node}/${index}`;
  if (readyIndex === key) return;
  if (!preparing) {
    preparing = (async () => {
      try {
        await client.indices.create({
          index,
          mappings: PRODUCT_SEARCH_MAPPING,
          ...(process.env.ELASTICSEARCH_SERVERLESS === "true"
            ? {}
            : { settings: { number_of_shards: 1, number_of_replicas: 0 } }),
        });
      } catch (error) {
        if (
          error.meta?.body?.error?.type !== "resource_already_exists_exception"
        )
          throw error;
      }
      readyIndex = key;
    })();
  }
  try {
    await preparing;
  } finally {
    preparing = undefined;
  }
};

const toSearchDocument = (product) => ({
  id: product._id.toString(),
  vendorId: product.vendorId.toString(),
  storeName: product.storeName,
  title: product.title,
  description: product.description,
  category: product.category,
  priceInPaise: product.priceInPaise,
  stock: product.stock,
  status: product.status,
  createdAt: product.createdAt,
});

const indexProduct = async (product) => {
  await ensure();
  try {
    await getSearchClient().index({
      index: getSearchConfig().index,
      id: product._id.toString(),
      document: toSearchDocument(product),
      version: product.searchVersion,
      version_type: "external",
    });
  } catch (error) {
    // A newer product revision is already indexed; never overwrite it with an older one.
    if (error.meta?.body?.error?.type !== "version_conflict_engine_exception")
      throw error;
  }
};

const search = async (query) => {
  try {
    await ensure();
    const result = await getSearchClient().search({
      index: getSearchConfig().index,
      ...query,
    });
    if (result.timed_out || result._shards?.failed > 0)
      throw searchUnavailable();
    return {
      ids: result.hits.hits.map((hit) => hit._id),
      total: result.hits.total.value,
    };
  } catch (error) {
    console.error("Product search unavailable:", error.name);
    throw searchUnavailable();
  }
};

const productSearchIndex = { ensure, indexProduct, search };

export { productSearchIndex, toSearchDocument };
