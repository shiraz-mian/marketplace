import { z } from "zod";
import { PRODUCT_LIMITS } from "../config/product.js";

const fields = {
  title: z
    .string()
    .trim()
    .min(PRODUCT_LIMITS.titleMin)
    .max(PRODUCT_LIMITS.titleMax),
  description: z
    .string()
    .trim()
    .min(PRODUCT_LIMITS.descriptionMin)
    .max(PRODUCT_LIMITS.descriptionMax),
  category: z
    .string()
    .trim()
    .toLowerCase()
    .min(2)
    .max(PRODUCT_LIMITS.categoryMax),
  priceInPaise: z.number().int().min(1).max(PRODUCT_LIMITS.maxPriceInPaise),
  stock: z.number().int().min(0).max(PRODUCT_LIMITS.maxStock),
  status: z.enum(["draft", "active"]),
};
const createProductSchema = z.strictObject({
  ...fields,
  status: fields.status.default("draft"),
});
const updateProductSchema = z
  .strictObject(fields)
  .partial()
  .refine(
    (input) => Object.keys(input).length > 0,
    "Provide at least one product field.",
  );
const productParamsSchema = z.strictObject({
  productId: z.string().regex(/^[a-fA-F0-9]{24}$/),
});
const productListSchema = z.strictObject({
  page: z.coerce.number().int().min(1).max(10000).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(12),
});

export {
  createProductSchema,
  updateProductSchema,
  productParamsSchema,
  productListSchema,
};
