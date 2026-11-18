import { ZodError } from "zod";
import jwt from "jsonwebtoken";
import multer from "multer";
import { ApiError } from "../utils/ApiError.js";
import { clearRefreshCookie } from "../utils/refreshCookie.js";

const notFound = (req, res, next) => {
  next(new ApiError(404, "NOT_FOUND", "Endpoint not found."));
};

const errorHandler = (error, req, res, next) => {
  if (res.headersSent) {
    return next(error);
  }

  const isRefreshRequest = /^\/api\/auth\/refresh\/?$/i.test(
    req.originalUrl.split("?")[0],
  );
  let statusCode = 500;
  let code = "INTERNAL_ERROR";
  let message = "Something went wrong. Please try again later.";
  let details;

  if (error instanceof multer.MulterError) {
    statusCode = error.code === "LIMIT_FILE_SIZE" ? 413 : 400;
    code =
      error.code === "LIMIT_FILE_SIZE"
        ? "IMAGE_TOO_LARGE"
        : "INVALID_IMAGE_UPLOAD";
    message =
      error.code === "LIMIT_FILE_SIZE"
        ? "Choose an image smaller than 5 MB."
        : "Upload one file using the image field.";
  } else if (error instanceof ZodError) {
    statusCode = 422;
    code = "VALIDATION_FAILED";
    message = "Please check the submitted fields.";
    details = error.issues.map((issue) => ({
      field: issue.path.join(".") || "body",
      message: issue.message,
    }));
  } else if (error instanceof ApiError) {
    statusCode = error.statusCode;
    code = error.code;
    message = error.message;
  } else if (error instanceof jwt.TokenExpiredError) {
    statusCode = 401;
    code = isRefreshRequest ? "REFRESH_TOKEN_EXPIRED" : "TOKEN_EXPIRED";
    message = isRefreshRequest
      ? "The refresh token has expired. Please sign in again."
      : "The access token has expired. Request a new access token.";
  } else if (error instanceof jwt.JsonWebTokenError) {
    statusCode = 401;
    code = isRefreshRequest ? "INVALID_REFRESH_TOKEN" : "INVALID_TOKEN";
    message = isRefreshRequest
      ? "The refresh token is invalid. Please sign in again."
      : "The access token is invalid.";
  } else if (error.code === 11000 && error.keyPattern?.emailNormalized) {
    statusCode = 409;
    code = "EMAIL_ALREADY_EXISTS";
    message = "An account with this email already exists.";
  } else if (error.code === 11000 && error.keyPattern?.ownerId) {
    statusCode = 409;
    code = "VENDOR_APPLICATION_EXISTS";
    message = "You already have a vendor application.";
  } else if (error.code === 11000 && error.keyPattern?.code) {
    statusCode = 409;
    code = "COUPON_EXISTS";
    message = "A coupon with this code already exists.";
  } else if (error.type === "entity.parse.failed") {
    statusCode = 400;
    code = "INVALID_JSON";
    message = "The request body must contain valid JSON.";
  } else if (error.type === "entity.too.large") {
    statusCode = 413;
    code = "BODY_TOO_LARGE";
    message = "The request body is too large.";
  }

  if (statusCode >= 500) {
    console.error("Unexpected API error:", error.name, error.code ?? "");
  }

  if (statusCode === 401) {
    res.set("WWW-Authenticate", "Bearer");
    res.set("Cache-Control", "no-store");
    if (isRefreshRequest) {
      clearRefreshCookie(res);
    }
  }

  return res.status(statusCode).json({
    success: false,
    error: {
      code,
      message,
      ...(details ? { details } : {}),
    },
  });
};

export { notFound, errorHandler };
