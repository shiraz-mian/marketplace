import dotenv from "dotenv";
import mongoose from "mongoose";
import { fileURLToPath, pathToFileURL } from "node:url";
import { connectDB } from "../src/config/db.js";
import { Product } from "../src/models/productModel.js";
import {
  getSearchClient,
  getSearchConfig,
  closeSearchClient,
} from "../src/config/elasticsearch.js";
import { productSearchIndex } from "../src/services/productSearchIndex.js";
import {
  markAllProductsForSearch,
  syncPendingProducts,
} from "../src/services/productSearchSync.js";
import { SEARCH_BATCH_SIZE } from "../src/config/search.js";

const reindexProducts = async () => {
  await productSearchIndex.ensure();
  await markAllProductsForSearch();
  let synced = 0;
  let batch;
  do {
    batch = await syncPendingProducts();
    synced += batch.synced;
    if (batch.failed) throw new Error("Search indexing has pending failures.");
  } while (batch.processed === SEARCH_BATCH_SIZE);
  await getSearchClient().indices.refresh({ index: getSearchConfig().index });
  return synced;
};

const run = async () => {
  if (process.argv.length > 2)
    throw new Error("This command accepts no arguments.");
  dotenv.config({
    path: fileURLToPath(new URL("../.env", import.meta.url)),
    quiet: true,
  });
  try {
    await connectDB();
    await Product.init();
    const synced = await reindexProducts();
    console.log(
      `Product search indexing complete. Synced ${synced} revisions.`,
    );
  } finally {
    await Promise.all([mongoose.disconnect(), closeSearchClient()]);
  }
};

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  run().catch((error) => {
    console.error("Product indexing failed:", error.name);
    console.error(
      "Check MongoDB and Elasticsearch configuration. Pending products will be retried by the backend.",
    );
    process.exitCode = 1;
  });
}

export { reindexProducts };
