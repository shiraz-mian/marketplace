import express from "express";
import { fileURLToPath } from "node:url";
import { healthRoutes } from "./routes/healthRoutes.js";
import { authRoutes } from "./routes/authRoutes.js";
import { vendorRoutes } from "./routes/vendorRoutes.js";
import { adminRoutes } from "./routes/adminRoutes.js";
import { productRoutes } from "./routes/productRoutes.js";
import { vendorProductRoutes } from "./routes/vendorProductRoutes.js";
import { cartRoutes } from "./routes/cartRoutes.js";
import {
  orderRoutes,
  vendorOrderRoutes,
  adminCommerceRoutes,
  reviewRoutes,
} from "./routes/commerceRoutes.js";
import { razorpayWebhook } from "./controllers/commerceController.js";
import { asyncHandler } from "./utils/asyncHandler.js";
import { notFound, errorHandler } from "./middleware/errorMiddleware.js";

const app = express();

app.disable("x-powered-by");
app.post(
  "/api/payments/razorpay/webhook",
  express.raw({ type: "application/json", limit: "256kb" }),
  asyncHandler(razorpayWebhook),
);
app.use(express.json({ limit: "32kb" }));
app.use("/api", healthRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/vendors", vendorRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/products", productRoutes);
app.use("/api/vendor/products", vendorProductRoutes);
app.use("/api/cart", cartRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/vendor/orders", vendorOrderRoutes);
app.use("/api/admin", adminCommerceRoutes);
app.use("/api/products/:productId/reviews", reviewRoutes);

// API paths always return API errors, even when the React app is served here.
app.use("/api", notFound);

if (process.env.SERVE_CLIENT === "true") {
  const clientDir = fileURLToPath(
    new URL("../../client/dist/", import.meta.url),
  );
  app.use(express.static(clientDir));
  app.get(/.*/, (req, res, next) => {
    if (!req.accepts("html")) return next();
    return res.sendFile("index.html", { root: clientDir });
  });
}

app.use(notFound);
app.use(errorHandler);

export { app };
