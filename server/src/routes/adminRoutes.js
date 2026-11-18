import { Router } from "express";
import {
  listVendors,
  reviewVendor,
} from "../controllers/adminVendorController.js";
import { authenticate, authorizeRoles } from "../middleware/authMiddleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const adminRoutes = Router();

adminRoutes.use((req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});
adminRoutes.use(asyncHandler(authenticate), authorizeRoles("admin"));

adminRoutes.get("/vendors", asyncHandler(listVendors));
adminRoutes.patch("/vendors/:vendorId/review", asyncHandler(reviewVendor));

export { adminRoutes };
