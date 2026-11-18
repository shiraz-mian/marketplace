import { FULFILLMENT_STATES } from "../config/checkout.js";
const presentOrder = (order, vendorId = null) => {
  const shipments = order.shipments.filter(
    (s) => !vendorId || String(s.vendorId) === String(vendorId),
  );
  const lines = order.lines.filter(
    (l) => !vendorId || String(l.vendorId) === String(vendorId),
  );
  return {
    id: String(order._id),
    currency: order.currency,
    paymentFlow: order.paymentFlow ?? "route",
    paymentStatus: order.paymentStatus,
    status:
      order.paymentStatus === "paid"
        ? FULFILLMENT_STATES[
            Math.min(
              ...shipments.map((s) => FULFILLMENT_STATES.indexOf(s.status)),
            )
          ]
        : order.paymentStatus,
    address: {
      name: order.address.name,
      phone: order.address.phone,
      line1: order.address.line1,
      line2: order.address.line2,
      city: order.address.city,
      state: order.address.state,
      postalCode: order.address.postalCode,
      country: order.address.country,
    },
    lines: lines.map((l) => ({
      productId: String(l.productId),
      vendorId: String(l.vendorId),
      title: l.title,
      storeName: l.storeName,
      quantity: l.quantity,
      unitPriceInPaise: l.unitPriceInPaise,
      grossInPaise: l.grossInPaise,
      discountInPaise: l.discountInPaise,
      totalInPaise: l.totalInPaise,
    })),
    shipments: shipments.map((s) => ({
      vendorId: String(s.vendorId),
      storeName: s.storeName,
      status: s.status,
      trackingNumber: s.trackingNumber,
      totalInPaise: s.totalInPaise,
      commissionInPaise: s.commissionInPaise,
      vendorAmountInPaise: s.vendorAmountInPaise,
      transferStatus: s.transferStatus,
      history: s.history.map((h) => ({ status: h.status, at: h.at })),
    })),
    subtotalInPaise: lines.reduce((sum, l) => sum + l.grossInPaise, 0),
    discountInPaise: lines.reduce((sum, l) => sum + l.discountInPaise, 0),
    totalInPaise: lines.reduce((sum, l) => sum + l.totalInPaise, 0),
    commissionInPaise: shipments.reduce(
      (sum, s) => sum + s.commissionInPaise,
      0,
    ),
    couponCode: order.couponCode,
    createdAt: order.createdAt,
    paidAt: order.paidAt,
    expiresAt: order.expiresAt,
  };
};
export { presentOrder };
