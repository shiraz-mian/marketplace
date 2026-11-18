import { getClientOrigins } from "../config/auth.js";
import { ApiError } from "../utils/ApiError.js";

// Browsers cannot send this custom header cross-origin without a successful
// CORS preflight. Keep the origin allowlist exact when CORS is added later.
const requireTrustedOrigin = (req, res, next) => {
  const origin = req.get("Origin");
  if (
    (origin && !getClientOrigins().includes(origin)) ||
    (!origin && req.get("Sec-Fetch-Site") === "cross-site")
  ) {
    throw new ApiError(
      403,
      "ORIGIN_NOT_ALLOWED",
      "This request origin is not allowed.",
    );
  }
  next();
};

const requireCsrfHeader = (req, res, next) => {
  if (req.get("X-Requested-With") !== "XMLHttpRequest") {
    throw new ApiError(
      403,
      "CSRF_CHECK_FAILED",
      "The X-Requested-With header is required.",
    );
  }
  next();
};

export { requireTrustedOrigin, requireCsrfHeader };
