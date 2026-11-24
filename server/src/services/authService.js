import argon2 from "argon2";
import { randomBytes } from "node:crypto";
import {
  ACCESS_TOKEN_TTL_SECONDS,
  REFRESH_TOKEN_TTL_SECONDS,
  getAuthConfig,
  getClientOrigins,
} from "../config/auth.js";
import { User } from "../models/userModel.js";
import { ApiError } from "../utils/ApiError.js";
import {
  createAccessToken,
  createRefreshToken,
  verifyRefreshToken,
} from "./tokenService.js";

const PASSWORD_HASH_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
};

let dummyPasswordHash;

const initializeAuth = async () => {
  getAuthConfig();
  getClientOrigins();
  // Unknown accounts still perform password verification instead of taking a
  // fast exit that would make account existence easier to infer from timing.
  dummyPasswordHash = await argon2.hash(
    randomBytes(32).toString("hex"),
    PASSWORD_HASH_OPTIONS,
  );
};

const toPublicUser = (user) => {
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.emailNormalized,
    roles: user.roles,
    status: user.status,
    createdAt: user.createdAt,
  };
};

const toAccessTokenResponse = (user, tokenVersion) => ({
  user,
  accessToken: createAccessToken(user.id, tokenVersion),
  tokenType: "Bearer",
  expiresIn: ACCESS_TOKEN_TTL_SECONDS,
});

const registerUser = async ({ name, email, password }) => {
  const passwordHash = await argon2.hash(password, PASSWORD_HASH_OPTIONS);
  const user = await User.create({
    name,
    emailNormalized: email,
    passwordHash,
    roles: ["customer"],
    status: "active",
  });

  return toPublicUser(user);
};

const loginUser = async ({ email, password }) => {
  const user = await User.findOne({ emailNormalized: email }).select(
    "+passwordHash",
  );

  if (!dummyPasswordHash) {
    throw new Error(
      "Authentication must be initialized before accepting login.",
    );
  }

  const passwordMatches = await argon2.verify(
    user?.passwordHash || dummyPasswordHash,
    password,
  );

  if (!user || !passwordMatches || user.status !== "active") {
    throw new ApiError(
      401,
      "INVALID_CREDENTIALS",
      "Email or password is incorrect.",
    );
  }

  const publicUser = toPublicUser(user);
  const refreshExpiresAt = new Date(
    Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000,
  );

  return {
    ...toAccessTokenResponse(publicUser, user.tokenVersion ?? 0),
    refreshToken: createRefreshToken(publicUser.id, user.tokenVersion ?? 0),
    refreshExpiresAt,
  };
};

const getAuthenticatedUser = async (
  userId,
  tokenVersion = 0,
  type = "access",
) => {
  const user = await User.findById(userId).select(
    "name emailNormalized roles status createdAt tokenVersion",
  );

  if (!user || user.status !== "active") {
    throw new ApiError(
      401,
      "INVALID_TOKEN",
      "The access token is no longer valid.",
    );
  }

  if ((user.tokenVersion ?? 0) !== tokenVersion) {
    throw new ApiError(
      401,
      type === "refresh" ? "INVALID_REFRESH_TOKEN" : "INVALID_TOKEN",
      "The token is no longer valid. Please sign in again.",
    );
  }

  return toPublicUser(user);
};

const refreshAccessToken = async (refreshToken) => {
  const claims = verifyRefreshToken(refreshToken);
  const version = claims.tokenVersion ?? 0;
  const user = await getAuthenticatedUser(claims.sub, version, "refresh");

  return toAccessTokenResponse(user, version);
};

const logoutUser = async (refreshToken) => {
  let claims;
  try {
    claims = verifyRefreshToken(refreshToken);
  } catch (error) {
    if (
      error instanceof ApiError ||
      ["JsonWebTokenError", "TokenExpiredError", "NotBeforeError"].includes(
        error.name,
      )
    )
      return;
    throw error;
  }
  const version = claims.tokenVersion ?? 0;
  await User.updateOne(
    {
      _id: claims.sub,
      ...(version === 0
        ? { $or: [{ tokenVersion: 0 }, { tokenVersion: { $exists: false } }] }
        : { tokenVersion: version }),
    },
    { $inc: { tokenVersion: 1 } },
  );
};

export {
  initializeAuth,
  registerUser,
  loginUser,
  getAuthenticatedUser,
  refreshAccessToken,
  logoutUser,
};
