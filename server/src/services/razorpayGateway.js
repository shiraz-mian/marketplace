import { createHmac, timingSafeEqual } from "node:crypto";
import { getPaymentConfig, usesRouteTransfers } from "../config/checkout.js";
import { ApiError } from "../utils/ApiError.js";

const request = async (method, resource, body, version = "v1") => {
  const { keyId, secret } = getPaymentConfig();
  let response;
  try {
    response = await fetch(`https://api.razorpay.com/${version}/${resource}`, {
      method,
      headers: {
        Authorization: `Basic ${Buffer.from(`${keyId}:${secret}`).toString("base64")}`,
        "Content-Type": "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    throw new ApiError(
      503,
      "PAYMENT_UNAVAILABLE",
      "Razorpay is temporarily unavailable. Check your order before retrying.",
    );
  }
  if (!response.ok) {
    const error = new ApiError(
      503,
      "PAYMENT_UNAVAILABLE",
      "Razorpay could not complete this request. Check your test keys and payment settings.",
    );
    error.providerRejected = response.status >= 400 && response.status < 500;
    throw error;
  }
  return response.json();
};
const verifySignature = (payload, signature, secret) => {
  const expected = createHmac("sha256", secret).update(payload).digest();
  if (
    typeof signature !== "string" ||
    !/^[a-f0-9]{64}$/i.test(signature) ||
    !timingSafeEqual(expected, Buffer.from(signature, "hex"))
  )
    throw new ApiError(
      400,
      "INVALID_PAYMENT_SIGNATURE",
      "Payment signature verification failed.",
    );
};
const razorpayGateway = {
  createOrder: (order) =>
    request("POST", "orders", {
      amount: order.totalInPaise,
      currency: "INR",
      receipt: String(order._id),
      partial_payment: false,
      notes: { marketplace_order: String(order._id) },
      ...(usesRouteTransfers(order)
        ? {
            transfers: order.shipments
              .filter((s) => s.vendorAmountInPaise > 0)
              .map((s) => ({
                account: s.accountId,
                amount: s.vendorAmountInPaise,
                currency: "INR",
                on_hold: true,
                notes: {
                  marketplace_order: String(order._id),
                  vendor_id: String(s.vendorId),
                },
              })),
          }
        : {}),
    }),
  // Never blindly repeat a timed-out POST: locate its unique receipt first.
  recoverOrder: async (order) => {
    for (let skip = 0; skip < 1000; skip += 100) {
      const result = await request(
        "GET",
        `orders?from=${Math.floor(new Date(order.createdAt).getTime() / 1000) - 60}&count=100&skip=${skip}`,
      );
      const found = result.items.find(
        (item) => item.receipt === String(order._id),
      );
      if (found) return found;
      if (result.items.length < 100) break;
    }
    return null;
  },
  fetchPayments: (id) => request("GET", `orders/${id}/payments`),
  fetchPayment: (id) => request("GET", `payments/${id}`),
  fetchTransfers: (id) => request("GET", `payments/${id}/transfers`),
  releaseTransfer: (id) =>
    request("PATCH", `transfers/${id}`, { on_hold: false }),
  refund: (paymentId, order) =>
    request("POST", `payments/${paymentId}/refund`, {
      amount: order.totalInPaise,
      ...(usesRouteTransfers(order) ? { reverse_all: true } : {}),
      receipt: String(order._id),
      notes: { reason: "Marketplace could not fulfill this order" },
    }),
  fetchRefunds: (id) => request("GET", `payments/${id}/refunds`),
  fetchAccount: (id) => request("GET", `accounts/${id}`, undefined, "v2"),
};
export { razorpayGateway, verifySignature };
