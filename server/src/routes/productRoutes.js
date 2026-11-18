import { Router } from "express";
import {
  listCatalog,
  getCatalogProduct,
} from "../controllers/productController.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { searchCatalog } from "../controllers/productSearchController.js";

const productRoutes = Router();
productRoutes.get("/", asyncHandler(listCatalog));
productRoutes.get("/search", asyncHandler(searchCatalog));
productRoutes.get("/:productId", asyncHandler(getCatalogProduct));

export { productRoutes };
