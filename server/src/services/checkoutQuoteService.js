import { Product } from "../models/productModel.js";
import { Vendor } from "../models/vendorModel.js";
import { Coupon } from "../models/couponModel.js";
import { ApiError } from "../utils/ApiError.js";
import { getCommissionBps } from "../config/checkout.js";
import { cartStorage } from "./cartStorage.js";
import { calculateTotals } from "./orderPricing.js";

const loadCheckoutQuote = async (userId, { cartVersion, couponCode }) => {
  const cart = await cartStorage.read(userId);
  if (cart.version !== cartVersion)
    throw new ApiError(
      409,
      "CART_CHANGED",
      "Your cart changed. Review it before checkout.",
    );
  const products = await Product.find({
    _id: { $in: cart.items.map((item) => item.productId) },
    status: "active",
  });
  const coupon = couponCode ? await Coupon.findOne({ code: couponCode }) : null;
  if (couponCode && !coupon)
    throw new ApiError(
      409,
      "COUPON_UNAVAILABLE",
      "This coupon is unavailable.",
    );
  const totals = calculateTotals(
    products,
    cart.items,
    coupon,
    getCommissionBps(),
  );
  const vendors = await Vendor.find({
    _id: { $in: totals.shipments.map((shipment) => shipment.vendorId) },
    status: "approved",
  });
  if (
    totals.shipments.some(
      (shipment) =>
        !vendors.some(
          (vendor) => String(vendor._id) === String(shipment.vendorId),
        ),
    )
  )
    throw new ApiError(
      409,
      "CHECKOUT_STOCK_CHANGED",
      "A store is no longer available. Review your cart.",
    );
  return { totals, vendors, cartVersion: cart.version };
};
const previewCheckout = async (userId, input) => {
  const { totals, cartVersion } = await loadCheckoutQuote(userId, input);
  return {
    cartVersion,
    couponCode: input.couponCode,
    currency: "INR",
    subtotalInPaise: totals.subtotalInPaise,
    discountInPaise: totals.discountInPaise,
    totalInPaise: totals.totalInPaise,
    items: totals.lines.map((line) => ({
      productId: String(line.productId),
      title: line.title,
      storeName: line.storeName,
      quantity: line.quantity,
      grossInPaise: line.grossInPaise,
      discountInPaise: line.discountInPaise,
      totalInPaise: line.totalInPaise,
    })),
  };
};
const checkoutQuoteService = { loadCheckoutQuote, previewCheckout };
export { checkoutQuoteService };
