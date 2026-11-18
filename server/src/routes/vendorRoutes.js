import { Router } from "express";
import {
  applyForVendor,
  getMyVendorApplication,
} from "../controllers/vendorController.js";
import { authenticate } from "../middleware/authMiddleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const vendorRoutes = Router();

vendorRoutes.use((req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});
vendorRoutes.use(asyncHandler(authenticate));

vendorRoutes.post("/apply", asyncHandler(applyForVendor));
vendorRoutes.get("/me", asyncHandler(getMyVendorApplication));

export { vendorRoutes };
