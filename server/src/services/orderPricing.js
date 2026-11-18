import { ApiError } from "../utils/ApiError.js";
const calculateTotals = (products, items, coupon, commissionBps) => {
  const byId = new Map(products.map((p) => [String(p._id), p]));
  const lines = items.map((item) => {
    const p = byId.get(item.productId);
    if (!p || p.status !== "active" || p.stock < item.quantity)
      throw new ApiError(
        409,
        "CHECKOUT_STOCK_CHANGED",
        "An item is unavailable or has insufficient stock. Refresh your cart.",
      );
    return {
      productId: p._id,
      vendorId: p.vendorId,
      title: p.title,
      storeName: p.storeName,
      quantity: item.quantity,
      unitPriceInPaise: p.priceInPaise,
      grossInPaise: p.priceInPaise * item.quantity,
    };
  });
  const subtotalInPaise = lines.reduce((s, l) => s + l.grossInPaise, 0);
  if (!lines.length)
    throw new ApiError(409, "CART_EMPTY", "Your cart is empty.");
  if (subtotalInPaise < 100)
    throw new ApiError(
      422,
      "CHECKOUT_MINIMUM",
      "The minimum checkout amount is ₹1.",
    );
  if (
    coupon &&
    (!coupon.active ||
      coupon.expiresAt <= new Date() ||
      coupon.used >= coupon.maxUses ||
      subtotalInPaise < coupon.minSubtotalInPaise)
  )
    throw new ApiError(
      409,
      "COUPON_UNAVAILABLE",
      "This coupon is unavailable or its minimum spend has not been met.",
    );
  const discountInPaise = coupon
    ? Math.min(
        subtotalInPaise - 100,
        coupon.kind === "percent"
          ? Math.floor((subtotalInPaise * coupon.value) / 100)
          : coupon.value,
      )
    : 0;
  const shares = lines.map((l, index) => ({
    index,
    value: Number(
      (BigInt(discountInPaise) * BigInt(l.grossInPaise)) /
        BigInt(subtotalInPaise),
    ),
    remainder: Number(
      (BigInt(discountInPaise) * BigInt(l.grossInPaise)) %
        BigInt(subtotalInPaise),
    ),
  }));
  let left = discountInPaise - shares.reduce((s, x) => s + x.value, 0);
  for (const share of [...shares].sort(
    (a, b) => b.remainder - a.remainder || a.index - b.index,
  )) {
    if (left-- <= 0) break;
    share.value++;
  }
  lines.forEach((l, i) => {
    l.discountInPaise = shares[i].value;
    l.totalInPaise = l.grossInPaise - l.discountInPaise;
  });
  const vendors = new Map();
  for (const line of lines) {
    const id = String(line.vendorId);
    const split = vendors.get(id) || {
      vendorId: line.vendorId,
      storeName: line.storeName,
      totalInPaise: 0,
    };
    split.totalInPaise += line.totalInPaise;
    vendors.set(id, split);
  }
  const shipments = [...vendors.values()].map((s) => ({
    ...s,
    commissionInPaise: Math.floor((s.totalInPaise * commissionBps) / 10000),
    vendorAmountInPaise:
      s.totalInPaise - Math.floor((s.totalInPaise * commissionBps) / 10000),
    status: "placed",
    history: [],
  }));
  return {
    lines,
    shipments,
    subtotalInPaise,
    discountInPaise,
    totalInPaise: subtotalInPaise - discountInPaise,
    commissionInPaise: shipments.reduce((s, v) => s + v.commissionInPaise, 0),
    commissionBps,
  };
};
export { calculateTotals };
