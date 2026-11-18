import mongoose from "mongoose";
const reviewSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, required: true },
    authorName: { type: String, required: true },
    rating: {
      type: Number,
      min: 1,
      max: 5,
      required: true,
      validate: Number.isInteger,
    },
    body: { type: String, trim: true, maxlength: 1000, required: true },
  },
  { timestamps: true },
);
reviewSchema.index({ productId: 1, userId: 1 }, { unique: true });
reviewSchema.index({ productId: 1, createdAt: -1 });
const Review = mongoose.model("Review", reviewSchema);
export { Review };
