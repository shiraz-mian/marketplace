import { orderService } from "../services/orderService.js";
import { checkoutQuoteService } from "../services/checkoutQuoteService.js";
import { paymentService } from "../services/paymentService.js";
import { reviewService } from "../services/reviewService.js";
import { couponService } from "../services/couponService.js";
import { analyticsService } from "../services/analyticsService.js";
import { createInvoice } from "../services/invoiceService.js";
import { presentOrder } from "../services/orderPresenter.js";
import { Vendor } from "../models/vendorModel.js";
import { razorpayGateway } from "../services/razorpayGateway.js";
import { ApiError } from "../utils/ApiError.js";
import { apiResponse } from "../utils/apiResponse.js";
import {
  orderParamsSchema,
  productReviewParamsSchema,
  listSchema,
  checkoutSchema,
  checkoutQuoteSchema,
  operationSchema,
  verifyPaymentSchema,
  shipmentSchema,
  couponSchema,
  couponUpdateSchema,
  couponParamsSchema,
  vendorAccountSchema,
  reviewSchema,
  idSchema,
} from "../validators/commerceValidator.js";

const previewOrder = async (req, res) =>
  res.json(
    apiResponse(
      {
        quote: await checkoutQuoteService.previewCheckout(
          req.user.id,
          checkoutQuoteSchema.parse(req.body),
        ),
      },
      "Checkout total calculated.",
    ),
  );
const createOrder = async (req, res) =>
  res.status(201).json(
    apiResponse(
      {
        order: await orderService.createCheckout(
          req.user.id,
          checkoutSchema.parse(req.body),
          operationSchema.parse(req.get("Idempotency-Key")),
        ),
      },
      "Checkout created.",
    ),
  );
const listMyOrders = async (req, res) =>
  res.json(
    apiResponse(
      await orderService.listOrders(
        { userId: req.user.id },
        listSchema.parse(req.query),
      ),
      "Orders loaded.",
    ),
  );
const getMyOrder = async (req, res) =>
  res.json(
    apiResponse(
      {
        order: presentOrder(
          await orderService.requireOrder(
            req.user.id,
            orderParamsSchema.parse(req.params).orderId,
          ),
        ),
      },
      "Order loaded.",
    ),
  );
const getOrderPayment = async (req, res) =>
  res.json(
    apiResponse(
      {
        payment: await paymentService.getPayment(
          req.user.id,
          orderParamsSchema.parse(req.params).orderId,
        ),
      },
      "Test payment ready.",
    ),
  );
const verifyOrderPayment = async (req, res) =>
  res.json(
    apiResponse(
      {
        order: await paymentService.verifyPayment(
          req.user.id,
          orderParamsSchema.parse(req.params).orderId,
          verifyPaymentSchema.parse(req.body),
        ),
      },
      "Payment checked.",
    ),
  );
const refreshMyOrder = async (req, res) => {
  const { orderId } = orderParamsSchema.parse(req.params);
  await orderService.requireOrder(req.user.id, orderId);
  res.json(
    apiResponse(
      { order: presentOrder(await paymentService.reconcileOrder(orderId)) },
      "Order refreshed.",
    ),
  );
};
const downloadInvoice = async (req, res) => {
  const { orderId } = orderParamsSchema.parse(req.params);
  const doc = createInvoice(
    await orderService.requireOrder(req.user.id, orderId),
  );
  res.type("application/pdf").attachment(`Marketplace-${orderId}.pdf`);
  doc.on("error", () => res.destroy());
  doc.pipe(res);
  doc.end();
};
const listVendorOrders = async (req, res) => {
  const vendor = await orderService.requireVendor(req.user.id);
  res.json(
    apiResponse(
      await orderService.listOrders(
        { "shipments.vendorId": vendor._id, paymentStatus: "paid" },
        listSchema.parse(req.query),
        vendor._id,
      ),
      "Store orders loaded.",
    ),
  );
};
const changeShipment = async (req, res) =>
  res.json(
    apiResponse(
      {
        order: await orderService.updateShipment(
          req.user.id,
          orderParamsSchema.parse(req.params).orderId,
          shipmentSchema.parse(req.body),
        ),
      },
      "Shipment updated.",
    ),
  );
const listReviews = async (req, res) =>
  res.json(
    apiResponse(
      await reviewService.list(
        productReviewParamsSchema.parse(req.params).productId,
        listSchema.parse(req.query),
      ),
      "Reviews loaded.",
    ),
  );
const saveReview = async (req, res) =>
  res.json(
    apiResponse(
      {
        review: await reviewService.save(
          req.user,
          productReviewParamsSchema.parse(req.params).productId,
          reviewSchema.parse(req.body),
        ),
      },
      "Review saved.",
    ),
  );
const listCoupons = async (req, res) =>
  res.json(
    apiResponse(
      await couponService.list(listSchema.parse(req.query)),
      "Coupons loaded.",
    ),
  );
const createCoupon = async (req, res) =>
  res.status(201).json(
    apiResponse(
      {
        coupon: await couponService.create(
          req.user.id,
          couponSchema.parse(req.body),
        ),
      },
      "Coupon created.",
    ),
  );
const updateCoupon = async (req, res) =>
  res.json(
    apiResponse(
      {
        coupon: await couponService.update(
          couponParamsSchema.parse(req.params).couponId,
          couponUpdateSchema.parse(req.body),
        ),
      },
      "Coupon updated.",
    ),
  );
const getAnalytics = async (req, res) =>
  res.json(
    apiResponse(
      { analytics: await analyticsService.overview() },
      "Analytics loaded.",
    ),
  );
const listAdminOrders = async (req, res) =>
  res.json(
    apiResponse(
      await orderService.listOrders({}, listSchema.parse(req.query)),
      "Orders loaded.",
    ),
  );
const refreshAdminOrder = async (req, res) => {
  const order = await paymentService.reconcileOrder(
    orderParamsSchema.parse(req.params).orderId,
  );
  if (!order) throw new ApiError(404, "ORDER_NOT_FOUND", "Order not found.");
  res.json(
    apiResponse(
      { order: presentOrder(order) },
      "Payment reconciliation completed.",
    ),
  );
};
const linkVendorAccount = async (req, res) => {
  const vendorId = idSchema.parse(req.params.vendorId);
  const { accountId } = vendorAccountSchema.parse(req.body);
  const account = await razorpayGateway.fetchAccount(accountId);
  // Route account status is created/suspended. Product activation is separate
  // and Razorpay validates transfer eligibility when the checkout is created.
  if (
    account.id !== accountId ||
    account.type !== "route" ||
    account.status !== "created"
  )
    throw new ApiError(
      409,
      "VENDOR_ACCOUNT_NOT_ACTIVE",
      "Choose a valid, non-suspended Razorpay Route test account.",
    );
  const vendor = await Vendor.findOneAndUpdate(
    { _id: vendorId, status: "approved" },
    { $set: { razorpayAccountId: accountId } },
    { returnDocument: "after" },
  );
  if (!vendor)
    throw new ApiError(
      404,
      "VENDOR_APPLICATION_NOT_FOUND",
      "Approved vendor not found.",
    );
  res.json(apiResponse({ connected: true }, "Linked test account saved."));
};
const razorpayWebhook = async (req, res) => {
  await paymentService.handleWebhook(req.body, req.get("X-Razorpay-Signature"));
  res.json({ received: true });
};
export {
  previewOrder,
  createOrder,
  listMyOrders,
  getMyOrder,
  getOrderPayment,
  verifyOrderPayment,
  refreshMyOrder,
  downloadInvoice,
  listVendorOrders,
  changeShipment,
  listReviews,
  saveReview,
  listCoupons,
  createCoupon,
  updateCoupon,
  getAnalytics,
  listAdminOrders,
  refreshAdminOrder,
  linkVendorAccount,
  razorpayWebhook,
};
