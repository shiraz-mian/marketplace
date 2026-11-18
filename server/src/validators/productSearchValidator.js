import { z } from "zod";
import { PRODUCT_LIMITS } from "../config/product.js";
import { SEARCH_SORTS, SEARCH_WINDOW } from "../config/search.js";

const integerQuery = (min, max) =>
  z.string().regex(/^\d+$/).pipe(z.coerce.number().int().min(min).max(max));

const productSearchSchema = z
  .strictObject({
    q: z.string().trim().max(100).default(""),
    category: z
      .string()
      .trim()
      .toLowerCase()
      .min(2)
      .max(PRODUCT_LIMITS.categoryMax)
      .optional(),
    vendorId: z
      .string()
      .regex(/^[a-fA-F0-9]{24}$/)
      .transform((value) => value.toLowerCase())
      .optional(),
    minPriceInPaise: integerQuery(0, PRODUCT_LIMITS.maxPriceInPaise).optional(),
    maxPriceInPaise: integerQuery(0, PRODUCT_LIMITS.maxPriceInPaise).optional(),
    inStock: z
      .enum(["true", "false"])
      .transform((value) => value === "true")
      .optional(),
    sort: z.enum(SEARCH_SORTS).default("relevance"),
    page: integerQuery(1, SEARCH_WINDOW).default(1),
    limit: integerQuery(1, 50).default(12),
  })
  .refine(
    (input) =>
      input.minPriceInPaise === undefined ||
      input.maxPriceInPaise === undefined ||
      input.minPriceInPaise <= input.maxPriceInPaise,
    {
      path: ["maxPriceInPaise"],
      message: "Maximum price must be at least the minimum price.",
    },
  )
  .refine((input) => input.page * input.limit <= SEARCH_WINDOW, {
    path: ["page"],
    message: "Search supports the first 10,000 results. Narrow your filters.",
  });

export { productSearchSchema };
