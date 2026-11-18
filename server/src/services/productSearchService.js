import { Product } from "../models/productModel.js";
import { PRODUCT_FIELDS } from "../config/product.js";
import { productSearchIndex } from "./productSearchIndex.js";
import { buildProductSearchQuery } from "./productSearchQuery.js";
import { toProductResponse } from "./productService.js";

const searchProducts = async (input) => {
  const { ids, total } = await productSearchIndex.search(
    buildProductSearchQuery(input),
  );
  const safeIds = ids.filter((id) => /^[a-fA-F0-9]{24}$/.test(id));
  const filter = { _id: { $in: safeIds }, status: "active" };
  if (input.category) filter.category = input.category;
  if (input.vendorId) filter.vendorId = input.vendorId;
  if (
    input.minPriceInPaise !== undefined ||
    input.maxPriceInPaise !== undefined
  ) {
    filter.priceInPaise = {
      ...(input.minPriceInPaise !== undefined
        ? { $gte: input.minPriceInPaise }
        : {}),
      ...(input.maxPriceInPaise !== undefined
        ? { $lte: input.maxPriceInPaise }
        : {}),
    };
  }
  if (input.inStock !== undefined)
    filter.stock = input.inStock ? { $gt: 0 } : { $lte: 0 };
  // Read current data from MongoDB so a stale index cannot expose a newly hidden product.
  const products = safeIds.length
    ? await Product.find(filter).select(PRODUCT_FIELDS)
    : [];
  const byId = new Map(
    products.map((product) => [product._id.toString(), product]),
  );
  const ordered = safeIds.map((id) => byId.get(id)).filter(Boolean);
  return {
    products: await Promise.all(ordered.map(toProductResponse)),
    pagination: {
      page: input.page,
      limit: input.limit,
      total,
      totalPages: Math.ceil(total / input.limit),
    },
  };
};

export { searchProducts };
