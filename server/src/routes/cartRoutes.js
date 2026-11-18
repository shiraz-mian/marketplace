import { Router } from "express";
import { authenticate } from "../middleware/authMiddleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  readCart,
  addItem,
  updateItem,
  removeItem,
  emptyCart,
} from "../controllers/cartController.js";

const cartRoutes = Router();
cartRoutes.use((req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});
cartRoutes.use(asyncHandler(authenticate));
cartRoutes.get("/", asyncHandler(readCart));
cartRoutes.post("/items", asyncHandler(addItem));
cartRoutes.patch("/items/:productId", asyncHandler(updateItem));
cartRoutes.delete("/items/:productId", asyncHandler(removeItem));
cartRoutes.delete("/", asyncHandler(emptyCart));

export { cartRoutes };
