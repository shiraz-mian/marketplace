import mongoose from "mongoose";
import { VENDOR_LIMITS, VENDOR_STATUSES } from "../config/vendor.js";

const vendorSchema = new mongoose.Schema(
  {
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      immutable: true,
      unique: true,
    },
    storeName: {
      type: String,
      required: true,
      trim: true,
      minlength: VENDOR_LIMITS.storeNameMin,
      maxlength: VENDOR_LIMITS.storeNameMax,
    },
    description: {
      type: String,
      required: true,
      trim: true,
      minlength: VENDOR_LIMITS.descriptionMin,
      maxlength: VENDOR_LIMITS.descriptionMax,
    },
    status: {
      type: String,
      enum: VENDOR_STATUSES,
      default: "pending",
      required: true,
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    reviewedAt: {
      type: Date,
      default: null,
    },
    razorpayAccountId: { type: String, default: null },
  },
  { timestamps: true },
);

vendorSchema.index({ status: 1, createdAt: -1, _id: -1 });

const Vendor = mongoose.model("Vendor", vendorSchema);

export { Vendor };
