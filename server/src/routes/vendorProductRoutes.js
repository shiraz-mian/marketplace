import { Router } from "express";
import { authenticate, authorizeRoles } from "../middleware/authMiddleware.js";
import {
  requireApprovedVendor,
  loadOwnedProduct,
  imageUpload,
} from "../middleware/productMiddleware.js";
import {
  listMyProducts,
  getMyProduct,
  addProduct,
  editProduct,
  deleteProduct,
  uploadProductImage,
} from "../controllers/productController.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const vendorProductRoutes = Router();
vendorProductRoutes.use((req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});
vendorProductRoutes.use(
  asyncHandler(authenticate),
  authorizeRoles("vendor"),
  asyncHandler(requireApprovedVendor),
);
const ownedProduct = asyncHandler(loadOwnedProduct);

vendorProductRoutes.get("/", asyncHandler(listMyProducts));
vendorProductRoutes.post("/", asyncHandler(addProduct));
vendorProductRoutes.get(
  "/:productId",
  ownedProduct,
  asyncHandler(getMyProduct),
);
vendorProductRoutes.patch(
  "/:productId",
  ownedProduct,
  asyncHandler(editProduct),
);
vendorProductRoutes.delete(
  "/:productId",
  ownedProduct,
  asyncHandler(deleteProduct),
);
vendorProductRoutes.post(
  "/:productId/image",
  ownedProduct,
  imageUpload.single("image"),
  asyncHandler(uploadProductImage),
);

export { vendorProductRoutes };
