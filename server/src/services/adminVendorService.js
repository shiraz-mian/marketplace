import mongoose from "mongoose";
import { Vendor } from "../models/vendorModel.js";
import { User } from "../models/userModel.js";
import { ApiError } from "../utils/ApiError.js";
import { toVendorResponse } from "./vendorService.js";

const ADMIN_VENDOR_FIELDS =
  "ownerId storeName description status createdAt updatedAt reviewedBy reviewedAt";

const toAdminVendorResponse = (vendor) => ({
  ...toVendorResponse(vendor),
  reviewedBy: vendor.reviewedBy?.toString() ?? null,
  reviewedAt: vendor.reviewedAt ?? null,
});

const listVendorApplications = async ({ status, page, limit }) => {
  const filter = { status };
  const [vendors, total] = await Promise.all([
    Vendor.find(filter)
      .select(ADMIN_VENDOR_FIELDS)
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Vendor.countDocuments(filter),
  ]);

  return {
    vendors: vendors.map(toAdminVendorResponse),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
};

const reviewVendorApplication = async (vendorId, reviewerId, { status }) => {
  return mongoose.connection.transaction(
    async (session) => {
      // The pending filter is also checked on transaction retries, preventing
      // another administrator from overwriting a completed review.
      const vendor = await Vendor.findOneAndUpdate(
        { _id: vendorId, status: "pending" },
        { $set: { status, reviewedBy: reviewerId, reviewedAt: new Date() } },
        { new: true, runValidators: true, session },
      ).select(ADMIN_VENDOR_FIELDS);

      if (!vendor) {
        const exists = await Vendor.exists({ _id: vendorId }).session(session);
        if (!exists) {
          throw new ApiError(
            404,
            "VENDOR_APPLICATION_NOT_FOUND",
            "Vendor application not found.",
          );
        }
        throw new ApiError(
          409,
          "VENDOR_ALREADY_REVIEWED",
          "This vendor application has already been reviewed.",
        );
      }

      if (status === "approved") {
        // Keep customer/admin roles and avoid adding the vendor role twice.
        const owner = await User.findOneAndUpdate(
          { _id: vendor.ownerId, status: "active" },
          { $addToSet: { roles: "vendor" } },
          { new: true, runValidators: true, session, projection: "_id" },
        );
        if (!owner) {
          throw new ApiError(
            409,
            "VENDOR_OWNER_UNAVAILABLE",
            "The application owner is missing or inactive.",
          );
        }
      }

      return toAdminVendorResponse(vendor);
    },
    {
      readPreference: "primary",
      readConcern: { level: "snapshot" },
      writeConcern: { w: "majority" },
    },
  );
};

export { listVendorApplications, reviewVendorApplication };
