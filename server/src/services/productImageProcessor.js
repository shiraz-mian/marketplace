import sharp from "sharp";
import { PRODUCT_LIMITS } from "../config/product.js";
import { ApiError } from "../utils/ApiError.js";

const processProductImage = async (buffer) => {
  try {
    const image = sharp(buffer, {
      limitInputPixels: PRODUCT_LIMITS.imagePixels,
      failOn: "error",
    });
    const metadata = await image.metadata();
    if (
      !["jpeg", "png", "webp"].includes(metadata.format) ||
      (metadata.pages || 1) > 1
    ) {
      throw new Error("Unsupported image format");
    }
    const { data, info } = await image
      .rotate()
      .resize({
        width: 1600,
        height: 1600,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 82 })
      .toBuffer({ resolveWithObject: true });
    return { buffer: data, width: info.width, height: info.height };
  } catch {
    throw new ApiError(
      422,
      "INVALID_PRODUCT_IMAGE",
      "Use a valid JPEG, PNG or WebP image of at most 20 megapixels.",
    );
  }
};

export { processProductImage };
