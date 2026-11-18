import mongoose from "mongoose";
const couponSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true },
    kind: { type: String, enum: ["percent", "fixed"], required: true },
    value: { type: Number, required: true, min: 1, validate: Number.isInteger },
    minSubtotalInPaise: {
      type: Number,
      default: 0,
      min: 0,
      validate: Number.isSafeInteger,
    },
    maxUses: {
      type: Number,
      required: true,
      min: 1,
      validate: Number.isInteger,
    },
    used: { type: Number, default: 0, min: 0 },
    expiresAt: { type: Date, required: true },
    active: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, required: true },
  },
  { timestamps: true },
);
const Coupon = mongoose.model("Coupon", couponSchema);
export { Coupon };
