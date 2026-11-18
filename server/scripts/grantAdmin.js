import dotenv from "dotenv";
import mongoose from "mongoose";
import { fileURLToPath, pathToFileURL } from "node:url";
import { z, ZodError } from "zod";
import { connectDB } from "../src/config/db.js";
import { User } from "../src/models/userModel.js";
import { ApiError } from "../src/utils/ApiError.js";

const adminArgumentsSchema = z.tuple([
  z.string().trim().toLowerCase().max(254).pipe(z.email()),
]);

const parseAdminEmail = (args) => adminArgumentsSchema.parse(args)[0];

const grantAdminRole = async (email) => {
  const user = await User.findOneAndUpdate(
    { emailNormalized: email, status: "active" },
    { $addToSet: { roles: "admin" } },
    { new: true, runValidators: true, upsert: false, projection: "roles" },
  );
  if (!user) {
    throw new ApiError(
      404,
      "ADMIN_ACCOUNT_NOT_FOUND",
      "No active account has that email. Register the account first.",
    );
  }
  return { id: user._id.toString(), roles: user.roles };
};

const run = async () => {
  // Validate the target before loading credentials or connecting to MongoDB.
  const email = parseAdminEmail(process.argv.slice(2));
  dotenv.config({
    path: fileURLToPath(new URL("../.env", import.meta.url)),
    quiet: true,
  });
  try {
    await connectDB();
    await User.init();
    const account = await grantAdminRole(email);
    console.log(`Admin role ready for account ${account.id}.`);
  } finally {
    await mongoose.disconnect();
  }
};

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  run().catch((error) => {
    const message =
      error instanceof ZodError
        ? "Usage: npm run admin:grant -- email@example.com"
        : error instanceof ApiError
          ? error.message
          : "Admin setup failed. Check MongoDB configuration, connectivity and database permissions.";
    console.error(message);
    process.exitCode = 1;
  });
}

export { parseAdminEmail, grantAdminRole };
