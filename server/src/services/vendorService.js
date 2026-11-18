import { Vendor } from "../models/vendorModel.js";
import { ApiError } from "../utils/ApiError.js";

const toVendorResponse = (vendor) => ({
  id: vendor._id.toString(),
  ownerId: vendor.ownerId.toString(),
  storeName: vendor.storeName,
  description: vendor.description,
  status: vendor.status,
  createdAt: vendor.createdAt,
  updatedAt: vendor.updatedAt,
});

const submitVendorApplication = async (ownerId, { storeName, description }) => {
  // The unique owner index handles simultaneous applications without a separate
  // read-before-write check. The central error handler maps duplicates to 409.
  const vendor = await Vendor.create({
    ownerId,
    storeName,
    description,
    status: "pending",
  });

  return toVendorResponse(vendor);
};

const getVendorApplication = async (ownerId) => {
  const vendor = await Vendor.findOne({ ownerId }).select(
    "ownerId storeName description status createdAt updatedAt",
  );

  if (!vendor) {
    throw new ApiError(
      404,
      "VENDOR_APPLICATION_NOT_FOUND",
      "You have not submitted a vendor application.",
    );
  }

  return toVendorResponse(vendor);
};

export { submitVendorApplication, getVendorApplication, toVendorResponse };
