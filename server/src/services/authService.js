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

const toAccessTokenResponse = (user) => ({
  user,
  accessToken: createAccessToken(user.id),
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
    ...toAccessTokenResponse(publicUser),
    refreshToken: createRefreshToken(publicUser.id),
    refreshExpiresAt,
  };
};

const getAuthenticatedUser = async (userId) => {
  const user = await User.findById(userId).select(
    "name emailNormalized roles status createdAt",
  );

  if (!user || user.status !== "active") {
    throw new ApiError(
      401,
      "INVALID_TOKEN",
      "The access token is no longer valid.",
    );
  }

  return toPublicUser(user);
};

const refreshAccessToken = async (refreshToken) => {
  const claims = verifyRefreshToken(refreshToken);
  const user = await getAuthenticatedUser(claims.sub);

  return toAccessTokenResponse(user);
};

export {
  initializeAuth,
  registerUser,
  loginUser,
  getAuthenticatedUser,
  refreshAccessToken,
};
