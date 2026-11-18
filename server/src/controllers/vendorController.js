import { vendorApplicationSchema } from "../validators/vendorValidator.js";
import {
  getVendorApplication,
  submitVendorApplication,
} from "../services/vendorService.js";
import { apiResponse } from "../utils/apiResponse.js";

const applyForVendor = async (req, res) => {
  const input = vendorApplicationSchema.parse(req.body);
  const vendor = await submitVendorApplication(req.user.id, input);

  return res
    .status(201)
    .json(apiResponse({ vendor }, "Vendor application submitted for review."));
};

const getMyVendorApplication = async (req, res) => {
  const vendor = await getVendorApplication(req.user.id);

  return res
    .status(200)
    .json(apiResponse({ vendor }, "Vendor application loaded."));
};

export { applyForVendor, getMyVendorApplication };
