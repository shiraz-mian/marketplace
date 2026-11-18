const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
const REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;
const REFRESH_COOKIE_NAME = "marketplace_refresh";

const getClientOrigins = () => {
  const configuredOrigins = process.env.CLIENT_ORIGINS;

  if (process.env.NODE_ENV === "production" && !configuredOrigins) {
    throw new Error("CLIENT_ORIGINS must be configured in production.");
  }

  const origins = (
    configuredOrigins || "http://localhost:5173,http://127.0.0.1:5173"
  )
    .split(",")
    .map((origin) => origin.trim());

  for (const origin of origins) {
    const url = new URL(origin);
    if (
      url.origin !== origin ||
      !["http:", "https:"].includes(url.protocol) ||
      (process.env.NODE_ENV === "production" && url.protocol !== "https:")
    ) {
      throw new Error(
        "CLIENT_ORIGINS must contain exact origins; production requires HTTPS.",
      );
    }
  }

  return origins;
};

const getRefreshCookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/api/auth",
});

const getAuthConfig = () => {
  const secret = process.env.JWT_SECRET;

  if (!secret || Buffer.byteLength(secret, "utf8") < 32) {
    throw new Error(
      "JWT_SECRET must be configured with at least 32 random bytes.",
    );
  }

  return {
    secret,
    issuer: process.env.JWT_ISSUER || "marketplace-api",
    audience: process.env.JWT_AUDIENCE || "marketplace-client",
  };
};

export {
  ACCESS_TOKEN_TTL_SECONDS,
  REFRESH_TOKEN_TTL_SECONDS,
  REFRESH_COOKIE_NAME,
  getAuthConfig,
  getClientOrigins,
  getRefreshCookieOptions,
};
