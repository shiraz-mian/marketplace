import "dotenv/config";
import { app } from "./app.js";
import { connectDB } from "./config/db.js";
import { User } from "./models/userModel.js";
import { initializeAuth } from "./services/authService.js";

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    await initializeAuth();
    await connectDB();
    await User.init();

    const server = app.listen(PORT);

    server.once("listening", () => {
      console.log(`Backend running at http://localhost:${PORT}`);
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
