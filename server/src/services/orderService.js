import mongoose from "mongoose";
import { createHash } from "node:crypto";
import { Order } from "../models/orderModel.js";
import { Product } from "../models/productModel.js";
import { Vendor } from "../models/vendorModel.js";
import { Coupon } from "../models/couponModel.js";
import { ApiError } from "../utils/ApiError.js";
import { FULFILLMENT_STATES, getPaymentConfig } from "../config/checkout.js";
import { checkoutQuoteService } from "./checkoutQuoteService.js";
import { razorpayGateway } from "./razorpayGateway.js";
import { presentOrder } from "./orderPresenter.js";

const requireOrder = async (userId, orderId) => {
  const order = await Order.findOne({ _id: orderId, userId });
  if (!order) throw new ApiError(404, "ORDER_NOT_FOUND", "Order not found.");
  return order;
};
const ensureProviderOrder = async (order) => {
  if (order.providerOrderId) return order;
  const claimed = await Order.findOneAndUpdate(
    { _id: order._id, providerState: "new" },
    { $set: { providerState: "creating" } },
    { returnDocument: "after" },
  );
  let remote;
  if (claimed) {
    try {
      remote = await razorpayGateway.createOrder(claimed);
    } catch (error) {
      await Order.updateOne(
        { _id: order._id, providerOrderId: null },
        { $set: { providerState: error.providerRejected ? "new" : "unknown" } },
      );
      throw error;
    }
  } else {
    const latest = await Order.findById(order._id);
    if (latest.providerOrderId) return latest;
    // Give an in-flight creation time to finish before recovery polling.
    if (Date.now() - new Date(latest.updatedAt).getTime() < 15000)
      throw new ApiError(
        409,
        "PAYMENT_PREPARING",
        "Payment is being prepared. Refresh the order in a few seconds.",
      );
    remote = await razorpayGateway.recoverOrder(latest);
    if (!remote)
      throw new ApiError(
        503,
        "PAYMENT_REVIEW_REQUIRED",
        "Payment setup needs review. No new payment order was created. Check Razorpay for this order receipt.",
      );
  }
  if (
    remote.amount !== order.totalInPaise ||
    remote.currency !== "INR" ||
    remote.receipt !== String(order._id)
  )
    throw new ApiError(
      503,
      "PAYMENT_MISMATCH",
      "The payment order does not match the checkout.",
    );
  return Order.findOneAndUpdate(
    { _id: order._id, providerOrderId: null },
    { $set: { providerOrderId: remote.id, providerState: "ready" } },
    { returnDocument: "after" },
  );
};
const createCheckout = async (userId, input, operationId) => {
  const { paymentFlow } = getPaymentConfig();
  const fingerprint = createHash("sha256")
    .update(JSON.stringify(input))
    .digest("hex");
  let order = await Order.findOne({ userId, operationId });
  if (order && order.fingerprint !== fingerprint)
    throw new ApiError(
      409,
      "IDEMPOTENCY_CONFLICT",
      "This checkout request was already used with different details.",
    );
  if (!order) {
    const { totals, vendors, cartVersion } =
      await checkoutQuoteService.loadCheckoutQuote(userId, input);
    for (const shipment of totals.shipments) {
      if (paymentFlow === "standard") {
        shipment.accountId = null;
        shipment.transferStatus = "not_requested";
        continue;
      }
      const vendor = vendors.find(
        (v) => String(v._id) === String(shipment.vendorId),
      );
      if (!vendor?.razorpayAccountId)
        throw new ApiError(
          409,
          "VENDOR_PAYMENTS_NOT_READY",
          "A store has not connected its Razorpay test account yet.",
        );
      shipment.accountId = vendor.razorpayAccountId;
    }
    try {
      order = await Order.create({
        userId,
        operationId,
        fingerprint,
        ...totals,
        paymentFlow,
        address: input.address,
        cartVersion,
        couponCode: input.couponCode,
        expiresAt: new Date(Date.now() + 30 * 60000),
      });
    } catch (error) {
      if (error.code !== 11000) throw error;
      order = await Order.findOne({ userId, operationId });
      if (!order || order.fingerprint !== fingerprint)
        throw new ApiError(
          409,
          "IDEMPOTENCY_CONFLICT",
          "Checkout details changed. Review your order.",
        );
    }
  }
  return presentOrder(await ensureProviderOrder(order));
};
const listOrders = async (filter, { page, limit }, vendorId = null) => {
  const [orders, total] = await Promise.all([
    Order.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Order.countDocuments(filter),
  ]);
  return {
    orders: orders.map((o) => presentOrder(o, vendorId)),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
};
const requireVendor = async (userId) => {
  const vendor = await Vendor.findOne({ ownerId: userId, status: "approved" });
  if (!vendor)
    throw new ApiError(
      403,
      "VENDOR_NOT_APPROVED",
      "An approved store is required.",
    );
  return vendor;
};
const updateShipment = async (userId, orderId, input) => {
  const vendor = await requireVendor(userId);
  const previous =
    FULFILLMENT_STATES[FULFILLMENT_STATES.indexOf(input.status) - 1];
  const changes = { "shipments.$.status": input.status };
  if (input.status === "shipped")
    changes["shipments.$.trackingNumber"] = input.trackingNumber;
  const order = await Order.findOneAndUpdate(
    {
      _id: orderId,
      paymentStatus: "paid",
      shipments: { $elemMatch: { vendorId: vendor._id, status: previous } },
    },
    {
      $set: changes,
      $push: {
        "shipments.$.history": { status: input.status, at: new Date() },
      },
    },
    { returnDocument: "after", runValidators: true },
  );
  if (!order)
    throw new ApiError(
      409,
      "INVALID_ORDER_TRANSITION",
      "The order changed or this status transition is not allowed.",
    );
  return presentOrder(order, vendor._id);
};

// The transaction makes stock, coupon usage and payment recording one change.
// Concurrent callbacks/webhooks retry against the paid state without double deductions.
const recordCapturedPayment = async (orderId, payment) => {
  try {
    await mongoose.connection.transaction(async (session) => {
      const order = await Order.findById(orderId).session(session);
      if (!order || order.paymentStatus !== "pending") return;
      if (
        payment.order_id !== order.providerOrderId ||
        payment.amount !== order.totalInPaise ||
        payment.currency !== "INR" ||
        payment.status !== "captured"
      )
        throw new ApiError(
          409,
          "PAYMENT_MISMATCH",
          "Payment does not match this order.",
        );
      if (order.expiresAt <= new Date())
        throw new ApiError(
          409,
          "CHECKOUT_EXPIRED",
          "The checkout has expired.",
        );
      for (const shipment of order.shipments) {
        if (
          !(await Vendor.exists({
            _id: shipment.vendorId,
            status: "approved",
          }).session(session))
        )
          throw new ApiError(
            409,
            "CHECKOUT_STOCK_CHANGED",
            "This store is no longer available.",
          );
      }
      for (const line of order.lines) {
        const result = await Product.updateOne(
          {
            _id: line.productId,
            vendorId: line.vendorId,
            status: "active",
            stock: { $gte: line.quantity },
          },
          {
            $inc: { stock: -line.quantity, searchVersion: 1 },
            $set: { searchSyncPending: true },
          },
          { session },
        );
        if (result.modifiedCount !== 1)
          throw new ApiError(
            409,
            "CHECKOUT_STOCK_CHANGED",
            "Stock changed before payment confirmation.",
          );
      }
      if (order.couponCode) {
        const result = await Coupon.updateOne(
          {
            code: order.couponCode,
            active: true,
            expiresAt: { $gt: new Date() },
            $expr: { $lt: ["$used", "$maxUses"] },
          },
          { $inc: { used: 1 } },
          { session },
        );
        if (result.modifiedCount !== 1)
          throw new ApiError(
            409,
            "COUPON_UNAVAILABLE",
            "The coupon is no longer available.",
          );
      }
      order.paymentStatus = "paid";
      order.paymentId = payment.id;
      order.paidAt = new Date();
      for (const shipment of order.shipments)
        shipment.history = [{ status: "placed", at: order.paidAt }];
      await order.save({ session });
    });
  } catch (error) {
    if (
      ![
        "CHECKOUT_STOCK_CHANGED",
        "COUPON_UNAVAILABLE",
        "CHECKOUT_EXPIRED",
      ].includes(error.code)
    )
      throw error;
    await Order.updateOne(
      { _id: orderId, paymentStatus: "pending" },
      {
        $set: {
          paymentStatus: "refund_pending",
          paymentId: payment.id,
          refundReason: error.code,
        },
      },
    );
  }
};
const orderService = {
  requireOrder,
  createCheckout,
  listOrders,
  requireVendor,
  updateShipment,
  ensureProviderOrder,
  recordCapturedPayment,
};
export { orderService };
