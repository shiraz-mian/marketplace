import { randomUUID } from "node:crypto";
import { Product } from "../models/productModel.js";
import { PRODUCT_FIELDS } from "../config/product.js";
import { ApiError } from "../utils/ApiError.js";
import { productImageStorage } from "./productImageStorage.js";
import { processProductImage } from "./productImageProcessor.js";

const toProductResponse = async (product) => ({
  id: product._id.toString(),
  vendorId: product.vendorId.toString(),
  storeName: product.storeName,
  title: product.title,
  description: product.description,
  category: product.category,
  priceInPaise: product.priceInPaise,
  currency: product.currency,
  stock: product.stock,
  status: product.status,
  imageUrl: product.image?.key
    ? await productImageStorage.sign(product.image.key)
    : null,
  createdAt: product.createdAt,
  updatedAt: product.updatedAt,
});

const listProducts = async ({ page, limit }, vendorId) => {
  const filter = vendorId
    ? { vendorId, status: { $ne: "archived" } }
    : { status: "active" };
  const [products, total] = await Promise.all([
    Product.find(filter)
      .select(PRODUCT_FIELDS)
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Product.countDocuments(filter),
  ]);
  return {
    products: await Promise.all(products.map(toProductResponse)),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
};

const createProduct = async (vendor, input) => {
  const { title, description, category, priceInPaise, stock, status } = input;
  const product = await Product.create({
    vendorId: vendor._id,
    storeName: vendor.storeName,
    title,
    description,
    category,
    priceInPaise,
    stock,
    status,
    currency: "INR",
  });
  return toProductResponse(product);
};

const updateProduct = async (productId, vendorId, input) => {
  const product = await Product.findOneAndUpdate(
    { _id: productId, vendorId, status: { $ne: "archived" } },
    { $set: { ...input, searchSyncPending: true }, $inc: { searchVersion: 1 } },
    { new: true, runValidators: true },
  ).select(PRODUCT_FIELDS);
  if (!product)
    throw new ApiError(404, "PRODUCT_NOT_FOUND", "Product not found.");
  return toProductResponse(product);
};

const archiveProduct = async (productId, vendorId) => {
  const product = await Product.findOneAndUpdate(
    { _id: productId, vendorId },
    {
      $set: { status: "archived", searchSyncPending: true },
      $inc: { searchVersion: 1 },
    },
    { new: true, runValidators: true },
  );
  if (!product)
    throw new ApiError(404, "PRODUCT_NOT_FOUND", "Product not found.");
};

const getPublicProduct = async (productId) => {
  const product = await Product.findOne({
    _id: productId,
    status: "active",
  }).select(PRODUCT_FIELDS);
  if (!product)
    throw new ApiError(404, "PRODUCT_NOT_FOUND", "Product not found.");
  return toProductResponse(product);
};

const removeUnusedImage = async (key) => {
  try {
    await productImageStorage.remove(key);
  } catch (error) {
    console.error("Unused product image cleanup failed:", error.name);
  }
};

const replaceProductImage = async (product, vendorId, file) => {
  if (!file)
    throw new ApiError(422, "IMAGE_REQUIRED", "Choose an image to upload.");
  const image = await processProductImage(file.buffer);
  const key = `product-images/${vendorId}/${product._id}/${randomUUID()}.webp`;
  await productImageStorage.upload(key, image.buffer);
  let updated;
  try {
    // Compare the previous key so overlapping uploads cannot orphan each other's images.
    updated = await Product.findOneAndUpdate(
      {
        _id: product._id,
        vendorId,
        status: { $ne: "archived" },
        "image.key": product.image?.key ?? null,
      },
      { $set: { image: { key, width: image.width, height: image.height } } },
      { new: true, runValidators: true },
    ).select(PRODUCT_FIELDS);
    if (!updated)
      throw new ApiError(
        409,
        "PRODUCT_CHANGED",
        "This product changed. Refresh it and try again.",
      );
  } catch (error) {
    await removeUnusedImage(key);
    throw error;
  }
  if (product.image?.key) await removeUnusedImage(product.image.key);
  return toProductResponse(updated);
};

export {
  toProductResponse,
  listProducts,
  createProduct,
  updateProduct,
  archiveProduct,
  getPublicProduct,
  replaceProductImage,
};
