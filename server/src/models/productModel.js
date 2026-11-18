import mongoose from "mongoose";
import { PRODUCT_LIMITS, PRODUCT_STATUSES } from "../config/product.js";

const imageSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    width: { type: Number, required: true, min: 1 },
    height: { type: Number, required: true, min: 1 },
  },
  { _id: false },
);

const productSchema = new mongoose.Schema(
  {
    vendorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vendor",
      required: true,
      immutable: true,
    },
    storeName: { type: String, required: true, immutable: true },
    title: {
      type: String,
      required: true,
      trim: true,
      minlength: PRODUCT_LIMITS.titleMin,
      maxlength: PRODUCT_LIMITS.titleMax,
    },
    description: {
      type: String,
      required: true,
      trim: true,
      minlength: PRODUCT_LIMITS.descriptionMin,
      maxlength: PRODUCT_LIMITS.descriptionMax,
    },
    category: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      minlength: 2,
      maxlength: PRODUCT_LIMITS.categoryMax,
    },
    priceInPaise: {
      type: Number,
      required: true,
      min: 1,
      max: PRODUCT_LIMITS.maxPriceInPaise,
      validate: Number.isInteger,
    },
    currency: { type: String, enum: ["INR"], default: "INR", immutable: true },
    stock: {
      type: Number,
      required: true,
      min: 0,
      max: PRODUCT_LIMITS.maxStock,
      validate: Number.isInteger,
    },
    status: {
      type: String,
      enum: PRODUCT_STATUSES,
      default: "draft",
      required: true,
    },
    image: { type: imageSchema, default: null },
    searchVersion: {
      type: Number,
      default: 1,
      min: 1,
      validate: Number.isSafeInteger,
    },
    searchSyncPending: { type: Boolean, default: true },
  },
  { timestamps: true },
);

productSchema.index({ vendorId: 1, status: 1, createdAt: -1, _id: -1 });
productSchema.index({ status: 1, createdAt: -1, _id: -1 });
productSchema.index({ searchSyncPending: 1, _id: 1 });

const Product = mongoose.model("Product", productSchema);

export { Product };
