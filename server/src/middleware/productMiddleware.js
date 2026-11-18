import multer from "multer";
import { Vendor } from "../models/vendorModel.js";
import { Product } from "../models/productModel.js";
import { PRODUCT_FIELDS, PRODUCT_LIMITS } from "../config/product.js";
import { productParamsSchema } from "../validators/productValidator.js";
import { ApiError } from "../utils/ApiError.js";

const requireApprovedVendor = async (req, res, next) => {
  const vendor = await Vendor.findOne({
    ownerId: req.user.id,
    status: "approved",
  }).select("ownerId storeName status");
  if (!vendor)
    throw new ApiError(
      403,
      "VENDOR_NOT_APPROVED",
      "An approved vendor account is required.",
    );
  req.vendor = vendor;
  next();
};

const loadOwnedProduct = async (req, res, next) => {
  const { productId } = productParamsSchema.parse(req.params);
  const product = await Product.findOne({
    _id: productId,
    vendorId: req.vendor._id,
    status: { $ne: "archived" },
  }).select(PRODUCT_FIELDS);
  if (!product)
    throw new ApiError(404, "PRODUCT_NOT_FOUND", "Product not found.");
  req.product = product;
  next();
};

const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: PRODUCT_LIMITS.imageBytes,
    files: 1,
    fields: 0,
    parts: 1,
  },
  fileFilter: (req, file, done) => {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.mimetype)) {
      return done(
        new ApiError(
          415,
          "UNSUPPORTED_IMAGE_TYPE",
          "Choose a JPEG, PNG or WebP image.",
        ),
      );
    }
    return done(null, true);
  },
});

export { requireApprovedVendor, loadOwnedProduct, imageUpload };
