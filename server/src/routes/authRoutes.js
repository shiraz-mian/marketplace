import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import {
  register,
  login,
  refresh,
  logout,
  getMe,
} from "../controllers/authController.js";
import { authenticate } from "../middleware/authMiddleware.js";
import {
  requireTrustedOrigin,
  requireCsrfHeader,
} from "../middleware/csrfMiddleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const authRoutes = Router();

const registrationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: "RATE_LIMITED",
      message: "Too many registration attempts. Try again later.",
    },
  },
});

authRoutes.post("/register", registrationLimiter, asyncHandler(register));

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: "RATE_LIMITED",
      message: "Too many login attempts. Try again later.",
    },
  },
});

const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: "RATE_LIMITED",
      message: "Too many refresh attempts. Try again later.",
    },
  },
});

authRoutes.post(
  "/login",
  requireTrustedOrigin,
  loginLimiter,
  asyncHandler(login),
);
authRoutes.post(
  "/refresh",
  requireTrustedOrigin,
  requireCsrfHeader,
  refreshLimiter,
  asyncHandler(refresh),
);
authRoutes.post(
  "/logout",
  requireTrustedOrigin,
  requireCsrfHeader,
  asyncHandler(logout),
);
authRoutes.get("/me", asyncHandler(authenticate), asyncHandler(getMe));

export { authRoutes };
