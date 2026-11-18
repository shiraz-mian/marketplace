import { isAxiosError } from "axios";

const MESSAGES = {
  PAYMENT_NOT_CONFIGURED:
    "Add Razorpay test keys to the server environment before checkout. Live keys are not supported.",
  PAYMENT_UNAVAILABLE:
    "Razorpay could not complete the request. Check your test keys and payment settings, then refresh your order.",
  PAYMENT_PREPARING:
    "Payment setup is in progress. Refresh the order in a few seconds.",
  PAYMENT_REVIEW_REQUIRED:
    "Payment setup needs review in the Razorpay test dashboard. Check your order before starting another checkout.",
  PAYMENT_MISMATCH:
    "The payment does not match this order. Refresh its payment status.",
  INVALID_PAYMENT_SIGNATURE:
    "Payment verification failed. Check your order status before retrying.",
  VENDOR_PAYMENTS_NOT_READY:
    "A store needs a linked Razorpay test account. Ask the administrator to connect it.",
  VENDOR_ACCOUNT_NOT_ACTIVE:
    "Activate this linked test account in Razorpay Route before connecting it.",
  CHECKOUT_STOCK_CHANGED:
    "Stock changed. Refresh your cart and review quantities before checkout.",
  CHECKOUT_EXPIRED:
    "This checkout has expired. Check your orders before starting a new checkout.",
  COUPON_UNAVAILABLE:
    "This coupon is expired, fully used, disabled or below its minimum spend.",
  COUPON_EXISTS: "A coupon with this code already exists.",
  CART_EMPTY: "Add items to your cart before checkout.",
  CHECKOUT_MINIMUM: "The minimum checkout amount is ₹1.",
  INVALID_ORDER_TRANSITION:
    "The shipment changed or this status transition is not allowed. Refresh orders.",
  REVIEW_NOT_ELIGIBLE:
    "You can review this product after your order is delivered.",
  SELF_REVIEW: "You cannot review your own product.",
  INVOICE_NOT_AVAILABLE: "Invoices are available after payment is confirmed.",
  CART_UNAVAILABLE:
    "Your cart is temporarily unavailable. Please try again shortly.",
  CART_CHANGED:
    "Your cart changed in another tab. Review the latest cart before trying again.",
  CART_ITEM_NOT_FOUND:
    "This item is no longer in your cart. Refresh to review the latest items.",
  CART_STOCK_LIMIT:
    "That quantity is no longer available. Check current stock and try a smaller quantity.",
  CART_FULL:
    "Your cart can hold up to 50 different products. Remove an item before adding another.",
  IDEMPOTENCY_CONFLICT:
    "Please refresh the page before trying to add this item again.",
  SEARCH_UNAVAILABLE:
    "Product search is temporarily unavailable. Please try again shortly.",
  VENDOR_APPLICATION_EXISTS:
    "You already have a vendor application. Refresh to view it.",
  VENDOR_ALREADY_REVIEWED:
    "Another review has already decided this application. Refresh the list.",
  VENDOR_OWNER_UNAVAILABLE: "The applicant's account is missing or inactive.",
  VENDOR_NOT_APPROVED:
    "Your store must be approved before you can manage products.",
  PRODUCT_NOT_FOUND: "This product is unavailable.",
  PRODUCT_CHANGED: "This product changed. Refresh it and try again.",
  IMAGE_STORAGE_UNAVAILABLE:
    "Image uploads are currently unavailable. Your product details can still be saved.",
  IMAGE_TOO_LARGE: "Choose an image smaller than 5 MB.",
  INVALID_PRODUCT_IMAGE:
    "Choose a valid JPEG, PNG or WebP image of at most 20 megapixels.",
  UNSUPPORTED_IMAGE_TYPE: "Choose a JPEG, PNG or WebP image.",
  IMAGE_REQUIRED: "Choose an image to upload.",
};

const getMarketplaceError = (error) => {
  if (!isAxiosError(error)) return "Something went wrong. Please try again.";
  if (["ECONNABORTED", "ETIMEDOUT"].includes(error.code))
    return "The request took too long. Please try again.";
  if (!error.response)
    return "We couldn't reach the server. Check your connection and try again.";
  const code = error.response.data?.error?.code;
  if (Object.hasOwn(MESSAGES, code)) return MESSAGES[code];
  if ([502, 503, 504].includes(error.response.status))
    return "The service is temporarily unavailable. Please try again shortly.";
  if (error.response.status === 403)
    return "Your account does not have permission to do this.";
  if (error.response.status === 422)
    return "Check the entered values and try again.";
  if (error.response.status === 429)
    return "Too many attempts. Please wait and try again.";
  if (error.response.status === 404) return "The requested item was not found.";
  return "Something went wrong. Please try again.";
};

export { getMarketplaceError };
