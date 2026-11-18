import { registerSchema, loginSchema } from "../validators/authValidator.js";
import {
  registerUser,
  loginUser,
  refreshAccessToken,
} from "../services/authService.js";
import { apiResponse } from "../utils/apiResponse.js";
import {
  readRefreshCookie,
  setRefreshCookie,
  clearRefreshCookie,
} from "../utils/refreshCookie.js";

const sendAuthResponse = (res, result, message) => {
  const { refreshToken, refreshExpiresAt, ...data } = result;
  if (refreshToken) setRefreshCookie(res, refreshToken, refreshExpiresAt);
  res.set("Cache-Control", "no-store");
  return res.status(200).json(apiResponse(data, message));
};

const register = async (req, res) => {
  const input = registerSchema.parse(req.body);
  const user = await registerUser(input);

  return res
    .status(201)
    .json(apiResponse({ user }, "Account created successfully."));
};

const login = async (req, res) => {
  const input = loginSchema.parse(req.body);
  const result = await loginUser(input);

  return sendAuthResponse(res, result, "Signed in successfully.");
};

const refresh = async (req, res) => {
  const result = await refreshAccessToken(readRefreshCookie(req));
  return sendAuthResponse(res, result, "Access token refreshed successfully.");
};

const logout = (req, res) => {
  clearRefreshCookie(res);
  res.set("Cache-Control", "no-store");
  return res.status(200).json(apiResponse(null, "Signed out successfully."));
};

const getMe = (req, res) => {
  res.set("Cache-Control", "no-store");
  return res
    .status(200)
    .json(apiResponse({ user: req.user }, "Current user loaded."));
};

export { register, login, refresh, logout, getMe };
