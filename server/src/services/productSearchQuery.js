import mongoose from "mongoose";

const buildProductSearchQuery = (input) => {
  const {
    q,
    category,
    vendorId,
    minPriceInPaise,
    maxPriceInPaise,
    inStock,
    sort,
    page,
    limit,
  } = input;
  const filter = { status: "active" };
  if (category) filter.category = category;
  if (vendorId) filter.vendorId = new mongoose.Types.ObjectId(vendorId);
  if (minPriceInPaise !== undefined || maxPriceInPaise !== undefined) {
    filter.priceInPaise = {
      ...(minPriceInPaise !== undefined ? { $gte: minPriceInPaise } : {}),
      ...(maxPriceInPaise !== undefined ? { $lte: maxPriceInPaise } : {}),
    };
  }
  if (inStock !== undefined) filter.stock = inStock ? { $gt: 0 } : { $lte: 0 };

  const pipeline = [];
  if (q) {
    pipeline.push({
      $search: {
        index: "marketplace_products",
        compound: {
          should: [
            {
              text: {
                query: q,
                path: "title",
                matchCriteria: "all",
                fuzzy: { maxEdits: 1 },
                score: { boost: { value: 3 } },
              },
            },
            {
              text: {
                query: q,
                path: ["description", "storeName"],
                matchCriteria: "all",
                fuzzy: { maxEdits: 1 },
              },
            },
          ],
          minimumShouldMatch: 1,
        },
      },
    });
  }
  pipeline.push({ $match: filter });
  if (q && sort === "relevance")
    pipeline.push({ $addFields: { searchScore: { $meta: "searchScore" } } });
  const order =
    sort === "price_asc"
      ? { priceInPaise: 1, _id: 1 }
      : sort === "price_desc"
        ? { priceInPaise: -1, _id: 1 }
        : q && sort === "relevance"
          ? { searchScore: -1, _id: 1 }
          : { createdAt: -1, _id: 1 };
  pipeline.push({
    $facet: {
      products: [
        { $sort: order },
        { $skip: (page - 1) * limit },
        { $limit: limit },
      ],
      count: [{ $count: "total" }],
    },
  });
  return pipeline;
};

export { buildProductSearchQuery };
