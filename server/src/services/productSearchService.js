import { Product } from "../models/productModel.js";
import { buildProductSearchQuery } from "./productSearchQuery.js";
import { toProductResponse } from "./productService.js";
import { requireSearchIndex } from "./searchIndexStatus.js";

const searchProducts = async (input) => {
  const [result] = await Product.aggregate(buildProductSearchQuery(input));
  const products = result?.products ?? [];
  const total = result?.count[0]?.total ?? 0;
  if (input.q && total === 0) await requireSearchIndex("marketplace_products");
  return {
    products: await Promise.all(products.map(toProductResponse)),
    pagination: {
      page: input.page,
      limit: input.limit,
      total,
      totalPages: Math.ceil(total / input.limit),
    },
  };
};

export { searchProducts };
