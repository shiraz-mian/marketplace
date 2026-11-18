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
  const filter = [{ term: { status: "active" } }];
  if (category) filter.push({ term: { category } });
  if (vendorId) filter.push({ term: { vendorId } });
  if (minPriceInPaise !== undefined || maxPriceInPaise !== undefined) {
    filter.push({
      range: {
        priceInPaise: {
          ...(minPriceInPaise !== undefined ? { gte: minPriceInPaise } : {}),
          ...(maxPriceInPaise !== undefined ? { lte: maxPriceInPaise } : {}),
        },
      },
    });
  }
  if (inStock !== undefined)
    filter.push({ range: { stock: inStock ? { gt: 0 } : { lte: 0 } } });
  const primarySort =
    sort === "price_asc"
      ? { priceInPaise: "asc" }
      : sort === "price_desc"
        ? { priceInPaise: "desc" }
        : sort === "relevance" && q
          ? { _score: "desc" }
          : { createdAt: "desc" };
  return {
    from: (page - 1) * limit,
    size: limit,
    track_total_hits: true,
    _source: false,
    timeout: "2s",
    allow_partial_search_results: false,
    query: {
      bool: {
        filter,
        must: q
          ? [
              {
                multi_match: {
                  query: q,
                  fields: ["title^3", "description", "storeName"],
                  operator: "and",
                  fuzziness: "AUTO",
                  prefix_length: 1,
                  max_expansions: 25,
                },
              },
            ]
          : [{ match_all: {} }],
      },
    },
    sort: [primarySort, { id: "asc" }],
  };
};

export { buildProductSearchQuery };
