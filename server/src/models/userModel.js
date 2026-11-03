import mongoose from "mongoose";
import { USER_ROLES } from "../config/roles.js";

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 100,
    },

    emailNormalized: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 254,
      unique: true,
    },

    passwordHash: {
      type: String,
      required: true,
      select: false,
    },

    roles: {
      type: [
        {
          type: String,
          enum: USER_ROLES,
        },
      ],
      default: ["customer"],
    },

    status: {
      type: String,
      enum: ["active", "disabled"],
      default: "active",
    },
  },
  {
    timestamps: true,
  },
);

const User = mongoose.model("User", userSchema);

export { User };
