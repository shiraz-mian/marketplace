import cookie from "cookie";
import {
  REFRESH_COOKIE_NAME,
  getRefreshCookieOptions,
} from "../config/auth.js";

const readRefreshCookie = (req) => {
  const cookies = cookie.parse(req.get("Cookie") || "");
  return cookies[REFRESH_COOKIE_NAME];
};

const setRefreshCookie = (res, refreshToken, expiresAt) => {
  res.cookie(REFRESH_COOKIE_NAME, refreshToken, {
    ...getRefreshCookieOptions(),
    expires: expiresAt,
  });
};

const clearRefreshCookie = (res) => {
  res.clearCookie(REFRESH_COOKIE_NAME, getRefreshCookieOptions());
};

export { readRefreshCookie, setRefreshCookie, clearRefreshCookie };
