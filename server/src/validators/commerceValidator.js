import { z } from "zod";
const idSchema = z
  .string()
  .regex(/^[a-f0-9]{24}$/i)
  .transform((v) => v.toLowerCase());
const orderParamsSchema = z.object({ orderId: idSchema });
const productReviewParamsSchema = z.object({ productId: idSchema });
const listSchema = z
  .object({
    page: z.coerce.number().int().min(1).max(1000).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(12),
  })
  .strict();
const addressSchema = z
  .object({
    name: z.string().trim().min(2).max(100),
    phone: z
      .string()
      .trim()
      .regex(/^[6-9][0-9]{9}$/, "Enter a 10 digit Indian mobile number."),
    line1: z.string().trim().min(5).max(180),
    line2: z.string().trim().max(180).default(""),
    city: z.string().trim().min(2).max(80),
    state: z.string().trim().min(2).max(80),
    postalCode: z
      .string()
      .regex(/^[1-9][0-9]{5}$/, "Enter a six digit PIN code."),
    country: z.literal("IN").default("IN"),
  })
  .strict();
const checkoutSchema = z
  .object({
    address: addressSchema,
    cartVersion: z.string().uuid(),
    couponCode: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9_-]{0,30}$/)
      .default(""),
  })
  .strict();
const operationSchema = z.string().uuid();
const checkoutQuoteSchema = checkoutSchema.omit({ address: true });
const verifyPaymentSchema = z
  .object({
    razorpay_order_id: z.string().regex(/^order_[A-Za-z0-9]+$/),
    razorpay_payment_id: z.string().regex(/^pay_[A-Za-z0-9]+$/),
    razorpay_signature: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
const shipmentSchema = z
  .object({
    status: z.enum(["packed", "shipped", "delivered"]),
    trackingNumber: z.string().trim().max(100).default(""),
  })
  .strict()
  .refine((v) => v.status !== "shipped" || v.trackingNumber.length >= 3, {
    path: ["trackingNumber"],
    message: "Enter a tracking number before shipping.",
  });
const couponSchema = z
  .object({
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9_-]{3,30}$/),
    kind: z.enum(["percent", "fixed"]),
    value: z.number().int().min(1).max(100000000),
    minSubtotalInPaise: z.number().int().min(0).max(100000000).default(0),
    maxUses: z.number().int().min(1).max(1000000),
    expiresAt: z.iso
      .datetime()
      .transform((v) => new Date(v))
      .refine((v) => v > new Date(), "Expiry must be in the future."),
  })
  .strict()
  .refine((v) => v.kind !== "percent" || v.value <= 80, {
    path: ["value"],
    message: "Percentage must be at most 80.",
  });
const couponUpdateSchema = z.object({ active: z.boolean() }).strict();
const couponParamsSchema = z.object({ couponId: idSchema });
const vendorAccountSchema = z
  .object({ accountId: z.string().regex(/^acc_[A-Za-z0-9]+$/) })
  .strict();
const reviewSchema = z
  .object({
    rating: z.number().int().min(1).max(5),
    body: z.string().trim().min(5).max(1000),
  })
  .strict();
export {
  idSchema,
  orderParamsSchema,
  productReviewParamsSchema,
  listSchema,
  checkoutSchema,
  checkoutQuoteSchema,
  operationSchema,
  verifyPaymentSchema,
  shipmentSchema,
  couponSchema,
  couponUpdateSchema,
  couponParamsSchema,
  vendorAccountSchema,
  reviewSchema,
};
