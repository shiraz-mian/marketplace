import mongoose from "mongoose";
import { FULFILLMENT_STATES } from "../config/checkout.js";

const money = {
  type: Number,
  required: true,
  min: 0,
  validate: Number.isSafeInteger,
};
const lineSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, required: true },
    vendorId: { type: mongoose.Schema.Types.ObjectId, required: true },
    title: { type: String, required: true },
    storeName: { type: String, required: true },
    quantity: {
      type: Number,
      required: true,
      min: 1,
      max: 99,
      validate: Number.isInteger,
    },
    unitPriceInPaise: money,
    grossInPaise: money,
    discountInPaise: money,
    totalInPaise: money,
  },
  { _id: false },
);
const shipmentSchema = new mongoose.Schema(
  {
    vendorId: { type: mongoose.Schema.Types.ObjectId, required: true },
    storeName: String,
    accountId: { type: String, default: null },
    totalInPaise: money,
    commissionInPaise: money,
    vendorAmountInPaise: money,
    status: { type: String, enum: FULFILLMENT_STATES, default: "placed" },
    trackingNumber: { type: String, default: "" },
    history: [
      {
        _id: false,
        status: { type: String, enum: FULFILLMENT_STATES },
        at: Date,
      },
    ],
    transferId: { type: String, default: null },
    transferStatus: { type: String, default: "pending" },
  },
  { _id: false },
);
const orderSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    operationId: { type: String, required: true, immutable: true },
    fingerprint: { type: String, required: true, immutable: true },
    address: {
      name: String,
      phone: String,
      line1: String,
      line2: String,
      city: String,
      state: String,
      postalCode: String,
      country: { type: String, default: "IN" },
    },
    lines: { type: [lineSchema], required: true },
    shipments: { type: [shipmentSchema], required: true },
    subtotalInPaise: money,
    discountInPaise: money,
    totalInPaise: money,
    commissionInPaise: money,
    commissionBps: Number,
    currency: { type: String, enum: ["INR"], default: "INR" },
    paymentFlow: {
      type: String,
      enum: ["standard", "route"],
      // Legacy orders used Route. New checkouts explicitly snapshot the configured flow.
      default: "route",
      immutable: true,
    },
    couponCode: { type: String, default: "" },
    paymentStatus: {
      type: String,
      enum: ["pending", "paid", "refund_pending", "refunded"],
      default: "pending",
    },
    providerState: {
      type: String,
      enum: ["new", "creating", "ready", "unknown"],
      default: "new",
    },
    providerOrderId: { type: String, default: null },
    paymentId: { type: String, default: null },
    expiresAt: { type: Date, required: true },
    paidAt: { type: Date, default: null },
    refundAttemptedAt: { type: Date, default: null },
    refundId: { type: String, default: null },
    refundReason: { type: String, default: "" },
    cartVersion: String,
    cartCleaned: { type: Boolean, default: false },
    reconcileAfter: { type: Date, default: Date.now },
    reconciliationComplete: { type: Boolean, default: false },
  },
  { timestamps: true },
);
orderSchema.index({ userId: 1, operationId: 1 }, { unique: true });
orderSchema.index(
  { providerOrderId: 1 },
  {
    unique: true,
    partialFilterExpression: { providerOrderId: { $type: "string" } },
  },
);
orderSchema.index({ userId: 1, createdAt: -1 });
orderSchema.index({ "shipments.vendorId": 1, paymentStatus: 1, createdAt: -1 });
orderSchema.index({ reconcileAfter: 1, paymentStatus: 1 });
const Order = mongoose.model("Order", orderSchema);
export { Order };
