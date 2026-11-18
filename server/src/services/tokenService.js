import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import {
  ACCESS_TOKEN_TTL_SECONDS,
  REFRESH_TOKEN_TTL_SECONDS,
  getAuthConfig,
} from "../config/auth.js";
import { ApiError } from "../utils/ApiError.js";

const invalidToken = (type) => {
  return type === "refresh"
    ? new ApiError(
        401,
        "INVALID_REFRESH_TOKEN",
        "The refresh token is invalid. Please sign in again.",
      )
    : new ApiError(401, "INVALID_TOKEN", "The access token is invalid.");
};

const createToken = (userId, type, lifetime) => {
  const { secret, issuer, audience } = getAuthConfig();

  return jwt.sign({ type }, secret, {
    algorithm: "HS256",
    subject: userId,
    jwtid: randomUUID(),
    issuer,
    audience,
    expiresIn: lifetime,
  });
};

const verifyToken = (token, expectedType, lifetime) => {
  if (typeof token !== "string" || !token || token.length > 4096) {
    throw invalidToken(expectedType);
  }

  const { secret, issuer, audience } = getAuthConfig();
  const claims = jwt.verify(token, secret, {
    algorithms: ["HS256"],
    issuer,
    audience,
    maxAge: lifetime,
  });

  const now = Math.floor(Date.now() / 1000);

  if (
    typeof claims !== "object" ||
    claims === null ||
    claims.type !== expectedType ||
    typeof claims.sub !== "string" ||
    !/^[a-fA-F0-9]{24}$/.test(claims.sub) ||
    !Number.isInteger(claims.iat) ||
    !Number.isInteger(claims.exp) ||
    claims.exp <= claims.iat ||
    claims.exp - claims.iat > lifetime ||
    claims.iat > now + 5
  ) {
    throw invalidToken(expectedType);
  }

  return claims;
};

const createAccessToken = (userId) =>
  createToken(userId, "access", ACCESS_TOKEN_TTL_SECONDS);
const createRefreshToken = (userId) =>
  createToken(userId, "refresh", REFRESH_TOKEN_TTL_SECONDS);
const verifyAccessToken = (token) =>
  verifyToken(token, "access", ACCESS_TOKEN_TTL_SECONDS);
const verifyRefreshToken = (token) =>
  verifyToken(token, "refresh", REFRESH_TOKEN_TTL_SECONDS);

export {
  createAccessToken,
  createRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
};
