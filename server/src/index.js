import "dotenv/config";
import { app } from "./app.js";
import { connectDB } from "./config/db.js";
import { User } from "./models/userModel.js";
import { Vendor } from "./models/vendorModel.js";
import { Product } from "./models/productModel.js";
import { initializeAuth } from "./services/authService.js";
import { startProductSearchSync } from "./services/productSearchSync.js";
import { Order } from "./models/orderModel.js";
import { Coupon } from "./models/couponModel.js";
import { Review } from "./models/reviewModel.js";
import { startOrderReconciliation } from "./services/paymentService.js";

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    await initializeAuth();
    await connectDB();
    await Promise.all([
      User.init(),
      Vendor.init(),
      Product.init(),
      Order.init(),
      Coupon.init(),
      Review.init(),
    ]);

    const server = app.listen(PORT);

    server.once("listening", () => {
      console.log(`Backend running at http://localhost:${PORT}`);
      const stopSearchSync = startProductSearchSync();
      server.once("close", stopSearchSync);
      server.once("close", startOrderReconciliation());
    });

    server.on("error", (error) => {
      console.error("HTTP server failed:", error.code);
      process.exit(1);
    });
  } catch (error) {
    console.error("Startup failed:", error.message);
    console.error(
      "Check server configuration, Atlas credentials and IP access.",
    );

    process.exit(1);
  }
};

startServer();
