import mongoose from "mongoose";
import { Review } from "../models/reviewModel.js";
import { Order } from "../models/orderModel.js";
import { Product } from "../models/productModel.js";
import { Vendor } from "../models/vendorModel.js";
import { ApiError } from "../utils/ApiError.js";
const presentReview = (r) => ({
  id: String(r._id),
  authorName: r.authorName,
  rating: r.rating,
  body: r.body,
  updatedAt: r.updatedAt,
  verifiedPurchase: true,
});
const requireProduct = async (productId) => {
  const product = await Product.findOne({ _id: productId, status: "active" });
  if (!product)
    throw new ApiError(404, "PRODUCT_NOT_FOUND", "Product not found.");
  return product;
};
const reviewService = {
  list: async (productId, { page, limit }) => {
    await requireProduct(productId);
    const [reviews, total, stats] = await Promise.all([
      Review.find({ productId })
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Review.countDocuments({ productId }),
      Review.aggregate([
        { $match: { productId: new mongoose.Types.ObjectId(productId) } },
        { $group: { _id: null, average: { $avg: "$rating" } } },
      ]),
    ]);
    return {
      reviews: reviews.map(presentReview),
      average: stats[0]?.average || 0,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  },
  save: async (user, productId, input) => {
    const product = await requireProduct(productId);
    if (await Vendor.exists({ _id: product.vendorId, ownerId: user.id }))
      throw new ApiError(
        403,
        "SELF_REVIEW",
        "You cannot review your own product.",
      );
    const purchased = await Order.exists({
      userId: user.id,
      paymentStatus: "paid",
      "lines.productId": productId,
      shipments: {
        $elemMatch: { vendorId: product.vendorId, status: "delivered" },
      },
    });
    if (!purchased)
      throw new ApiError(
        403,
        "REVIEW_NOT_ELIGIBLE",
        "You can review a product after your order is delivered.",
      );
    return presentReview(
      await Review.findOneAndUpdate(
        { productId, userId: user.id },
        { $set: { ...input, authorName: user.name } },
        { upsert: true, returnDocument: "after", runValidators: true },
      ),
    );
  },
};
export { reviewService };
