import { Coupon } from "../models/couponModel.js";
import { ApiError } from "../utils/ApiError.js";
const toCoupon = (c) => ({
  id: String(c._id),
  code: c.code,
  kind: c.kind,
  value: c.value,
  minSubtotalInPaise: c.minSubtotalInPaise,
  maxUses: c.maxUses,
  used: c.used,
  expiresAt: c.expiresAt,
  active: c.active,
});
const couponService = {
  list: async ({ page, limit }) => {
    const [coupons, total] = await Promise.all([
      Coupon.find()
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Coupon.countDocuments(),
    ]);
    return {
      coupons: coupons.map(toCoupon),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  },
  create: async (userId, input) =>
    toCoupon(await Coupon.create({ ...input, createdBy: userId })),
  update: async (couponId, input) => {
    const coupon = await Coupon.findByIdAndUpdate(
      couponId,
      { $set: input },
      { returnDocument: "after", runValidators: true },
    );
    if (!coupon)
      throw new ApiError(404, "COUPON_NOT_FOUND", "Coupon not found.");
    return toCoupon(coupon);
  },
};
export { couponService };
