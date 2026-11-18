import { verifyAccessToken } from "../services/tokenService.js";
import { getAuthenticatedUser } from "../services/authService.js";
import { USER_ROLES } from "../config/roles.js";
import { ApiError } from "../utils/ApiError.js";

const authenticate = async (req, res, next) => {
  const authorization = req.get("Authorization");
  const match = authorization?.match(/^Bearer (\S+)$/i);

  if (!match || match[1].length > 4096) {
    throw new ApiError(
      401,
      "AUTH_REQUIRED",
      "A Bearer access token is required.",
    );
  }

  const claims = verifyAccessToken(match[1]);
  req.user = await getAuthenticatedUser(claims.sub);
  next();
};

const authorizeRoles = (...allowedRoles) => {
  if (
    allowedRoles.length === 0 ||
    allowedRoles.some((role) => !USER_ROLES.includes(role))
  ) {
    throw new TypeError(
      "authorizeRoles requires one or more valid customer, vendor or admin roles.",
    );
  }

  return (req, res, next) => {
    if (!req.user) {
      throw new ApiError(401, "AUTH_REQUIRED", "Authentication is required.");
    }

    const hasAllowedRole =
      Array.isArray(req.user.roles) &&
      req.user.roles.some((role) => allowedRoles.includes(role));

    if (!hasAllowedRole) {
      throw new ApiError(
        403,
        "FORBIDDEN",
        "You do not have permission to access this resource.",
      );
    }

    next();
  };
};

export { authenticate, authorizeRoles };
