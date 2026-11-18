import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getImageStorageConfig } from "../config/s3.js";
import { ApiError } from "../utils/ApiError.js";

const withImageStorage = async (operation) => {
  try {
    return await operation(getImageStorageConfig());
  } catch (error) {
    if (error instanceof ApiError) throw error;
    console.error("Image storage failed:", error.name);
    throw new ApiError(
      503,
      "IMAGE_STORAGE_UNAVAILABLE",
      "Image storage is currently unavailable. Please try again later.",
    );
  }
};

const productImageStorage = {
  upload: (key, body) =>
    withImageStorage(({ client, bucket }) =>
      client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: body,
          ContentType: "image/webp",
          ServerSideEncryption: "AES256",
          CacheControl: "private, max-age=300",
        }),
        { abortSignal: AbortSignal.timeout(15000) },
      ),
    ),
  sign: (key) =>
    withImageStorage(({ client, bucket }) =>
      getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: key }), {
        expiresIn: 900,
      }),
    ),
  remove: (key) =>
    withImageStorage(({ client, bucket }) =>
      client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }), {
        abortSignal: AbortSignal.timeout(15000),
      }),
    ),
};

export { productImageStorage };
