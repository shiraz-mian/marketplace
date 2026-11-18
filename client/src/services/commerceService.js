import { apiClient, protectedApiClient } from "../api/apiClient.js";
const data = (response) => {
  if (!response.data?.success || !response.data.data)
    throw new Error("Invalid API response");
  return response.data.data;
};
const createCheckout = async (input, operationId, { signal } = {}) =>
  data(
    await protectedApiClient.post("/orders", input, {
      signal,
      headers: { "Idempotency-Key": operationId },
    }),
  ).order;
const previewCheckout = async (input, { signal } = {}) => {
  const quote = data(
    await protectedApiClient.post("/orders/quote", input, { signal }),
  ).quote;
  if (
    !quote ||
    quote.currency !== "INR" ||
    ![quote.subtotalInPaise, quote.discountInPaise, quote.totalInPaise].every(
      (value) => Number.isSafeInteger(value) && value >= 0,
    ) ||
    quote.subtotalInPaise - quote.discountInPaise !== quote.totalInPaise
  )
    throw new Error("Unexpected checkout quote response");
  return quote;
};
const getOrder = async (id, { signal } = {}) =>
  data(await protectedApiClient.get(`/orders/${id}`, { signal })).order;
const listOrders = async (mode, page, { signal } = {}) =>
  data(
    await protectedApiClient.get(
      mode === "vendor"
        ? "/vendor/orders"
        : mode === "admin"
          ? "/admin/orders"
          : "/orders",
      { signal, params: { page, limit: 12 } },
    ),
  );
const refreshOrder = async (id, mode = "customer", { signal } = {}) =>
  data(
    await protectedApiClient.post(
      `${mode === "admin" ? "/admin" : ""}/orders/${id}/refresh`,
      {},
      { signal },
    ),
  ).order;
const getPayment = async (id, { signal } = {}) =>
  data(await protectedApiClient.get(`/orders/${id}/payment`, { signal }))
    .payment;
const verifyPayment = async (id, input, { signal } = {}) =>
  data(
    await protectedApiClient.post(`/orders/${id}/verify-payment`, input, {
      signal,
    }),
  ).order;
const updateShipment = async (id, input, { signal } = {}) =>
  data(
    await protectedApiClient.patch(`/vendor/orders/${id}/shipment`, input, {
      signal,
    }),
  ).order;
const downloadInvoice = async (id, { signal } = {}) => {
  const response = await protectedApiClient.get(`/orders/${id}/invoice`, {
    signal,
    responseType: "blob",
  });
  const url = URL.createObjectURL(response.data);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Marketplace-${id}.pdf`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
const getReviews = async (id, page, { signal } = {}) =>
  data(
    await apiClient.get(`/products/${id}/reviews`, {
      signal,
      params: { page, limit: 5 },
    }),
  );
const saveReview = async (id, input, { signal } = {}) =>
  data(
    await protectedApiClient.put(`/products/${id}/reviews`, input, { signal }),
  ).review;
const getAnalytics = async ({ signal } = {}) =>
  data(await protectedApiClient.get("/admin/analytics", { signal })).analytics;
const listCoupons = async (page, { signal } = {}) =>
  data(
    await protectedApiClient.get("/admin/coupons", {
      signal,
      params: { page, limit: 12 },
    }),
  );
const createCoupon = async (input, { signal } = {}) =>
  data(await protectedApiClient.post("/admin/coupons", input, { signal }))
    .coupon;
const toggleCoupon = async (id, active, { signal } = {}) =>
  data(
    await protectedApiClient.patch(
      `/admin/coupons/${id}`,
      { active },
      { signal },
    ),
  ).coupon;
const linkVendorAccount = async (id, accountId, { signal } = {}) =>
  data(
    await protectedApiClient.put(
      `/admin/vendors/${id}/payment-account`,
      { accountId },
      { signal },
    ),
  );
export {
  previewCheckout,
  createCheckout,
  getOrder,
  listOrders,
  refreshOrder,
  getPayment,
  verifyPayment,
  updateShipment,
  downloadInvoice,
  getReviews,
  saveReview,
  getAnalytics,
  listCoupons,
  createCoupon,
  toggleCoupon,
  linkVendorAccount,
};
