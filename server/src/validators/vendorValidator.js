import { z } from "zod";
import { VENDOR_LIMITS } from "../config/vendor.js";

const vendorApplicationSchema = z.strictObject({
  storeName: z
    .string()
    .trim()
    .min(VENDOR_LIMITS.storeNameMin)
    .max(VENDOR_LIMITS.storeNameMax),
  description: z
    .string()
    .trim()
    .min(VENDOR_LIMITS.descriptionMin)
    .max(VENDOR_LIMITS.descriptionMax),
});

export { vendorApplicationSchema };
