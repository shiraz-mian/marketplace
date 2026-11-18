import { z } from "zod";
import {
  VENDOR_LIST_LIMITS,
  VENDOR_REVIEW_STATUSES,
  VENDOR_STATUSES,
} from "../config/vendor.js";

const vendorListQuerySchema = z.strictObject({
  status: z.enum(VENDOR_STATUSES).default("pending"),
  page: z.coerce
    .number()
    .int()
    .min(1)
    .max(VENDOR_LIST_LIMITS.maxPage)
    .default(VENDOR_LIST_LIMITS.defaultPage),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(VENDOR_LIST_LIMITS.maxLimit)
    .default(VENDOR_LIST_LIMITS.defaultLimit),
});

const vendorReviewParamsSchema = z.strictObject({
  vendorId: z.string().regex(/^[a-fA-F0-9]{24}$/),
});

const vendorReviewSchema = z.strictObject({
  status: z.enum(VENDOR_REVIEW_STATUSES),
});

export { vendorListQuerySchema, vendorReviewParamsSchema, vendorReviewSchema };
