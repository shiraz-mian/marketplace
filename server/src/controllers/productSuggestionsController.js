import { z } from "zod";
import { Product } from "../models/productModel.js";
import { apiResponse } from "../utils/apiResponse.js";
import { requireSearchIndex } from "../services/searchIndexStatus.js";

const querySchema = z.strictObject({ q: z.string().trim().min(2).max(100) });

const suggestProducts = async (req, res) => {
  const { q } = querySchema.parse(req.query);
  const products = await Product.aggregate([
    {
      $search: {
        index: "marketplace_suggestions",
        compound: {
          should: [
            {
              autocomplete: {
                query: q,
                path: "title",
                tokenOrder: "sequential",
              },
            },
            {
              autocomplete: {
                query: q,
                path: "storeName",
                tokenOrder: "sequential",
              },
            },
          ],
          minimumShouldMatch: 1,
        },
      },
    },
    { $match: { status: "active" } },
    { $limit: 5 },
    { $project: { title: 1, storeName: 1 } },
  ]);
  if (!products.length) await requireSearchIndex("marketplace_suggestions");
  res.set("Cache-Control", "no-store");
  return res.json(
    apiResponse(
      {
        suggestions: products.map((product) => ({
          id: product._id.toString(),
          title: product.title,
          storeName: product.storeName,
        })),
      },
      "Product suggestions loaded.",
    ),
  );
};

export { suggestProducts };
