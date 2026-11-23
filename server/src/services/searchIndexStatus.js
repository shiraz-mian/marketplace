import { Product } from "../models/productModel.js";
import { ApiError } from "../utils/ApiError.js";

const requireSearchIndex = async (name) => {
  let indexes;
  try {
    indexes = await Product.collection.listSearchIndexes(name).toArray();
  } catch {
    throw new ApiError(
      503,
      "SEARCH_UNAVAILABLE",
      "Product search is temporarily unavailable. Please try again later.",
    );
  }
  if (
    !indexes.some((index) => index.name === name && index.queryable === true)
  ) {
    throw new ApiError(
      503,
      "SEARCH_UNAVAILABLE",
      "Product search is temporarily unavailable. Please try again later.",
    );
  }
};
export { requireSearchIndex };
