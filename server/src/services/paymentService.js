import { Order } from "../models/orderModel.js";
import { ApiError } from "../utils/ApiError.js";
import { getPaymentConfig, usesRouteTransfers } from "../config/checkout.js";
import { orderService } from "./orderService.js";
import { razorpayGateway, verifySignature } from "./razorpayGateway.js";
import { presentOrder } from "./orderPresenter.js";
import { cartStorage } from "./cartStorage.js";

const reconcileTransfers = async (order) => {
  const { items } = await razorpayGateway.fetchTransfers(order.paymentId);
  for (const shipment of order.shipments) {
    if (shipment.vendorAmountInPaise === 0) continue;
    let transfer = items.find(
      (t) =>
        t.recipient === shipment.accountId &&
        t.amount === shipment.vendorAmountInPaise &&
        t.currency === "INR",
    );
    if (!transfer) continue; // Route may still be processing; the worker retries.
    if (transfer.on_hold && order.paymentStatus === "paid")
      transfer = await razorpayGateway.releaseTransfer(transfer.id);
    await Order.updateOne(
      { _id: order._id, "shipments.vendorId": shipment.vendorId },
      {
        $set: {
          "shipments.$.transferId": transfer.id,
          "shipments.$.transferStatus": transfer.status || "pending",
        },
      },
    );
  }
};
const reconcileRefund = async (order) => {
  const payment = await razorpayGateway.fetchPayment(order.paymentId);
  if (payment.amount_refunded >= order.totalInPaise) {
    await Order.updateOne(
      { _id: order._id, paymentStatus: "refund_pending" },
      { $set: { paymentStatus: "refunded" } },
    );
    return;
  }
  const refunds = await razorpayGateway.fetchRefunds(order.paymentId);
  const existing = refunds.items.find((r) => r.receipt === String(order._id));
  if (existing) {
    await Order.updateOne(
      { _id: order._id },
      { $set: { refundId: existing.id } },
    );
    return;
  }
  // Claim before POST. An uncertain provider response is reconciled with GETs;
  // never repeat a refund blindly after a network timeout.
  const claimed = await Order.findOneAndUpdate(
    {
      _id: order._id,
      paymentStatus: "refund_pending",
      refundAttemptedAt: null,
    },
    { $set: { refundAttemptedAt: new Date() } },
    { returnDocument: "after" },
  );
  if (!claimed) return;
  let refund;
  try {
    refund = await razorpayGateway.refund(order.paymentId, order);
  } catch (error) {
    if (error.providerRejected)
      await Order.updateOne(
        { _id: order._id },
        { $set: { refundAttemptedAt: null } },
      );
    throw error;
  }
  await Order.updateOne({ _id: order._id }, { $set: { refundId: refund.id } });
};
const cleanPaidCart = async (order) => {
  if (order.cartCleaned) return;
  try {
    await cartStorage.mutate(String(order.userId), {
      action: "clear",
      version: order.cartVersion,
    });
  } catch (error) {
    if (error.code !== "CART_CHANGED") throw error;
    // Preserve anything the customer changed after starting checkout.
  }
  await Order.updateOne({ _id: order._id }, { $set: { cartCleaned: true } });
};
const reconcileOrder = async (orderId) => {
  let order = await Order.findById(orderId);
  if (!order) return null;
  if (!order.providerOrderId)
    order = await orderService.ensureProviderOrder(order);
  if (order.paymentStatus === "pending") {
    const payments = await razorpayGateway.fetchPayments(order.providerOrderId);
    const captured = payments.items.find((p) => p.status === "captured");
    if (captured) await orderService.recordCapturedPayment(order._id, captured);
    order = await Order.findById(orderId);
  }
  if (order.paymentStatus === "refund_pending") await reconcileRefund(order);
  if (order.paymentStatus === "paid") {
    if (usesRouteTransfers(order)) await reconcileTransfers(order);
    await cleanPaidCart(order);
    const latest = await Order.findById(orderId);
    if (
      latest.cartCleaned &&
      (!usesRouteTransfers(latest) ||
        latest.shipments.every(
          (s) =>
            s.vendorAmountInPaise === 0 || s.transferStatus === "processed",
        ))
    )
      await Order.updateOne(
        { _id: orderId },
        { $set: { reconciliationComplete: true } },
      );
  }
  return Order.findById(orderId);
};
const getPayment = async (userId, orderId) => {
  const config = getPaymentConfig();
  let order = await orderService.requireOrder(userId, orderId);
  if (order.paymentStatus !== "pending" || order.expiresAt <= new Date())
    throw new ApiError(
      409,
      "CHECKOUT_EXPIRED",
      "This checkout is no longer available. Check your orders before starting again.",
    );
  order = await orderService.ensureProviderOrder(order);
  return {
    keyId: config.keyId,
    orderId: order.providerOrderId,
    amount: order.totalInPaise,
    currency: "INR",
  };
};
const verifyPayment = async (userId, orderId, input) => {
  const order = await orderService.requireOrder(userId, orderId);
  if (input.razorpay_order_id !== order.providerOrderId)
    throw new ApiError(
      400,
      "PAYMENT_MISMATCH",
      "Payment order does not match.",
    );
  verifySignature(
    `${order.providerOrderId}|${input.razorpay_payment_id}`,
    input.razorpay_signature,
    getPaymentConfig().secret,
  );
  const payment = await razorpayGateway.fetchPayment(input.razorpay_payment_id);
  if (payment.order_id !== order.providerOrderId)
    throw new ApiError(
      400,
      "PAYMENT_MISMATCH",
      "Payment does not belong to this order.",
    );
  return presentOrder(await reconcileOrder(order._id));
};
const handleWebhook = async (body, signature) => {
  getPaymentConfig();
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret)
    throw new ApiError(
      503,
      "PAYMENT_NOT_CONFIGURED",
      "Webhook configuration is missing.",
    );
  verifySignature(body, signature, secret);
  let event;
  try {
    event = JSON.parse(body.toString("utf8"));
  } catch {
    throw new ApiError(400, "INVALID_JSON", "Invalid webhook JSON.");
  }
  const providerId = event.payload?.payment?.entity?.order_id;
  if (typeof providerId === "string") {
    const order = await Order.findOne({ providerOrderId: providerId });
    if (order) await reconcileOrder(order._id);
  }
};
const startOrderReconciliation = () => {
  let stopped = false;
  let timer;
  const tick = async () => {
    try {
      getPaymentConfig();
      const orders = await Order.find({
        reconciliationComplete: false,
        paymentStatus: { $in: ["pending", "paid", "refund_pending"] },
        reconcileAfter: { $lte: new Date() },
      })
        .sort({ reconcileAfter: 1 })
        .limit(10);
      for (const order of orders) {
        if (stopped) break;
        await Order.updateOne(
          { _id: order._id },
          {
            $set: {
              reconcileAfter: new Date(
                Date.now() +
                  (order.expiresAt < new Date() &&
                  order.paymentStatus === "pending"
                    ? 3600000
                    : 60000),
              ),
            },
          },
        );
        try {
          await reconcileOrder(order._id);
        } catch (error) {
          console.error("Order reconciliation:", error.code || error.name);
        }
      }
    } catch (error) {
      if (error.code !== "PAYMENT_NOT_CONFIGURED")
        console.error("Order worker:", error.name);
    } finally {
      if (!stopped) {
        timer = setTimeout(tick, 15000);
        timer.unref();
      }
    }
  };
  timer = setTimeout(tick, 15000);
  timer.unref();
  return () => {
    stopped = true;
    clearTimeout(timer);
  };
};
const paymentService = {
  getPayment,
  verifyPayment,
  handleWebhook,
  reconcileOrder,
};
export { paymentService, startOrderReconciliation };
