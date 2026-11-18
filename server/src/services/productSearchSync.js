import { Product } from "../models/productModel.js";
import {
  SEARCH_BATCH_SIZE,
  SEARCH_INTERVAL_MS,
  SEARCH_PRODUCT_FIELDS,
} from "../config/search.js";
import { productSearchIndex } from "./productSearchIndex.js";

const syncPendingProducts = async () => {
  await productSearchIndex.ensure();
  const products = await Product.find({ searchSyncPending: true })
    .select(SEARCH_PRODUCT_FIELDS)
    .sort({ _id: 1 })
    .limit(SEARCH_BATCH_SIZE)
    .lean();
  let synced = 0;
  let failed = 0;
  for (const product of products) {
    try {
      await productSearchIndex.indexProduct(product);
      // Only acknowledge this exact revision. A concurrent edit must stay pending.
      await Product.updateOne(
        { _id: product._id, searchVersion: product.searchVersion },
        { $set: { searchSyncPending: false } },
        { timestamps: false },
      );
      synced++;
    } catch (error) {
      failed++;
      console.error("Product search sync pending:", error.name);
    }
  }
  return { processed: products.length, synced, failed };
};

const prepareLegacyProducts = () =>
  Product.updateMany(
    { searchVersion: { $exists: false } },
    { $set: { searchVersion: 1, searchSyncPending: true } },
    { timestamps: false },
  );

const markAllProductsForSearch = () =>
  Product.updateMany(
    {},
    { $inc: { searchVersion: 1 }, $set: { searchSyncPending: true } },
    { timestamps: false },
  );

const startProductSearchSync = () => {
  let stopped = false;
  let legacyPrepared = false;
  let timer;
  const tick = async () => {
    try {
      if (!legacyPrepared) {
        await prepareLegacyProducts();
        legacyPrepared = true;
      }
      await syncPendingProducts();
    } catch (error) {
      console.error("Product search worker will retry:", error.name);
    } finally {
      if (!stopped) {
        timer = setTimeout(tick, SEARCH_INTERVAL_MS);
        timer.unref();
      }
    }
  };
  void tick();
  return () => {
    stopped = true;
    clearTimeout(timer);
  };
};

export {
  syncPendingProducts,
  prepareLegacyProducts,
  markAllProductsForSearch,
  startProductSearchSync,
};
