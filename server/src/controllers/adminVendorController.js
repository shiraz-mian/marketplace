import {
  vendorListQuerySchema,
  vendorReviewParamsSchema,
  vendorReviewSchema,
} from "../validators/adminVendorValidator.js";
import {
  listVendorApplications,
  reviewVendorApplication,
} from "../services/adminVendorService.js";
import { apiResponse } from "../utils/apiResponse.js";

const listVendors = async (req, res) => {
  const query = vendorListQuerySchema.parse(req.query);
  const result = await listVendorApplications(query);
  return res
    .status(200)
    .json(apiResponse(result, "Vendor applications loaded."));
};

const reviewVendor = async (req, res) => {
  const { vendorId } = vendorReviewParamsSchema.parse(req.params);
  const input = vendorReviewSchema.parse(req.body);
  const vendor = await reviewVendorApplication(vendorId, req.user.id, input);
  return res
    .status(200)
    .json(apiResponse({ vendor }, "Vendor application reviewed."));
};

export { listVendors, reviewVendor };
