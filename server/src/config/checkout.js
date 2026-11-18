import { ApiError } from "../utils/ApiError.js";

const FULFILLMENT_STATES = ["placed", "packed", "shipped", "delivered"];
// Orders created before paymentFlow was stored used Route. Keep their transfers intact.
const usesRouteTransfers = (order) =>
  (order.paymentFlow ?? "route") === "route";
const getCommissionBps = () => {
  const value = Number(process.env.COMMISSION_BPS || 1000);
  if (!Number.isInteger(value) || value < 0 || value > 5000)
    throw new Error("COMMISSION_BPS must be between 0 and 5000.");
  return value;
};
const getPaymentConfig = () => {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const secret = process.env.RAZORPAY_KEY_SECRET;
  const paymentFlow = process.env.RAZORPAY_PAYMENT_FLOW ?? "standard";
  if (!/^rzp_test_[A-Za-z0-9]+$/.test(keyId || "") || !secret)
    throw new ApiError(
      503,
      "PAYMENT_NOT_CONFIGURED",
      "Configure Razorpay test keys on the server. Live keys are not supported.",
    );
  if (!["standard", "route"].includes(paymentFlow))
    throw new ApiError(
      503,
      "PAYMENT_NOT_CONFIGURED",
      "Set RAZORPAY_PAYMENT_FLOW to standard or route.",
    );
  return { keyId, secret, paymentFlow };
};

export {
  FULFILLMENT_STATES,
  usesRouteTransfers,
  getCommissionBps,
  getPaymentConfig,
};
