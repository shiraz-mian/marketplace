import { S3Client } from "@aws-sdk/client-s3";
import { ApiError } from "../utils/ApiError.js";

let cachedClient;
let cachedRegion;

const getImageStorageConfig = () => {
  const region = process.env.AWS_REGION?.trim();
  const bucket = process.env.S3_BUCKET?.trim();
  if (!region || !bucket) {
    throw new ApiError(
      503,
      "IMAGE_STORAGE_UNAVAILABLE",
      "Image uploads are currently unavailable. Please try again later.",
    );
  }
  if (!cachedClient || cachedRegion !== region) {
    cachedClient = new S3Client({ region, maxAttempts: 2 });
    cachedRegion = region;
  }
  return { client: cachedClient, bucket };
};

export { getImageStorageConfig };
