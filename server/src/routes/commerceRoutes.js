import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { authenticate, authorizeRoles } from "../middleware/authMiddleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import * as controller from "../controllers/commerceController.js";

const privateResponse = (req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
};
const mutationLimit = rateLimit({
  windowMs: 60000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
});
const orderRoutes = Router();
orderRoutes.use(privateResponse, asyncHandler(authenticate));
orderRoutes.get("/", asyncHandler(controller.listMyOrders));
orderRoutes.post(
  "/quote",
  mutationLimit,
  asyncHandler(controller.previewOrder),
);
orderRoutes.post("/", mutationLimit, asyncHandler(controller.createOrder));
orderRoutes.get("/:orderId", asyncHandler(controller.getMyOrder));
orderRoutes.get("/:orderId/payment", asyncHandler(controller.getOrderPayment));
orderRoutes.post(
  "/:orderId/verify-payment",
  mutationLimit,
  asyncHandler(controller.verifyOrderPayment),
);
orderRoutes.post(
  "/:orderId/refresh",
  mutationLimit,
  asyncHandler(controller.refreshMyOrder),
);
orderRoutes.get("/:orderId/invoice", asyncHandler(controller.downloadInvoice));
const vendorOrderRoutes = Router();
vendorOrderRoutes.use(
  privateResponse,
  asyncHandler(authenticate),
  authorizeRoles("vendor"),
);
vendorOrderRoutes.get("/", asyncHandler(controller.listVendorOrders));
vendorOrderRoutes.patch(
  "/:orderId/shipment",
  asyncHandler(controller.changeShipment),
);
const adminCommerceRoutes = Router();
adminCommerceRoutes.use(
  privateResponse,
  asyncHandler(authenticate),
  authorizeRoles("admin"),
);
adminCommerceRoutes.get("/analytics", asyncHandler(controller.getAnalytics));
adminCommerceRoutes.get("/coupons", asyncHandler(controller.listCoupons));
adminCommerceRoutes.post("/coupons", asyncHandler(controller.createCoupon));
adminCommerceRoutes.patch(
  "/coupons/:couponId",
  asyncHandler(controller.updateCoupon),
);
adminCommerceRoutes.get("/orders", asyncHandler(controller.listAdminOrders));
adminCommerceRoutes.post(
  "/orders/:orderId/refresh",
  mutationLimit,
  asyncHandler(controller.refreshAdminOrder),
);
adminCommerceRoutes.put(
  "/vendors/:vendorId/payment-account",
  asyncHandler(controller.linkVendorAccount),
);
const reviewRoutes = Router({ mergeParams: true });
reviewRoutes.get("/", asyncHandler(controller.listReviews));
reviewRoutes.put(
  "/",
  privateResponse,
  asyncHandler(authenticate),
  mutationLimit,
  asyncHandler(controller.saveReview),
);
export { orderRoutes, vendorOrderRoutes, adminCommerceRoutes, reviewRoutes };
