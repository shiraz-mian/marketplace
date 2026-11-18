import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import { calculateTotals } from "../src/services/orderPricing.js";
import { getPaymentConfig } from "../src/config/checkout.js";
import { verifySignature } from "../src/services/razorpayGateway.js";
import {
  checkoutSchema,
  couponSchema,
  reviewSchema,
  shipmentSchema,
} from "../src/validators/commerceValidator.js";
import { createInvoice } from "../src/services/invoiceService.js";
const products = [1, 2, 3].map((n) => ({
  _id: String(n),
  vendorId: String(n % 2),
  title: `Product ${n}`,
  storeName: `Store ${n % 2}`,
  stock: 99,
  priceInPaise: 10001,
  status: "active",
}));
const items = products.map((p) => ({ productId: p._id, quantity: 3 }));
const coupon = {
  active: true,
  used: 0,
  maxUses: 100,
  expiresAt: new Date(Date.now() + 60000),
  minSubtotalInPaise: 0,
  kind: "fixed",
  value: 10000,
};
test("discount allocation and vendor shares exactly conserve every paise", () => {
  const total = calculateTotals(products, items, coupon, 1000);
  assert.equal(
    total.lines.reduce((s, l) => s + l.discountInPaise, 0),
    10000,
  );
  assert.equal(
    total.shipments.reduce(
      (s, l) => s + l.vendorAmountInPaise + l.commissionInPaise,
      0,
    ),
    total.totalInPaise,
  );
  assert.equal(
    total.subtotalInPaise - total.discountInPaise,
    total.totalInPaise,
  );
});
test("large carts retain integer precision in proportional discount allocation", () => {
  const ps = Array.from({ length: 50 }, (_, i) => ({
    ...products[0],
    _id: String(i),
    priceInPaise: 99999999 - i,
  }));
  const total = calculateTotals(
    ps,
    ps.map((p) => ({ productId: p._id, quantity: 99 })),
    { ...coupon, kind: "percent", value: 79 },
    1000,
  );
  assert.equal(
    total.lines.reduce((s, l) => s + l.discountInPaise, 0),
    total.discountInPaise,
  );
  assert.ok(
    total.lines.every(
      (l) => Number.isSafeInteger(l.totalInPaise) && l.totalInPaise >= 0,
    ),
  );
});
test("expired, exhausted, disabled and minimum-spend coupons are rejected", () => {
  for (const change of [
    { active: false },
    { used: 100 },
    { expiresAt: new Date(0) },
    { minSubtotalInPaise: 1000000 },
  ])
    assert.throws(
      () => calculateTotals(products, items, { ...coupon, ...change }, 1000),
      { code: "COUPON_UNAVAILABLE" },
    );
});
test("coupon cannot reduce checkout below one rupee", () =>
  assert.equal(
    calculateTotals(products, items, { ...coupon, value: 99999999 }, 1000)
      .totalInPaise,
    100,
  ));
test("missing and insufficient products prevent checkout", () => {
  assert.throws(() => calculateTotals([], items, null, 1000), {
    code: "CHECKOUT_STOCK_CHANGED",
  });
  assert.throws(
    () =>
      calculateTotals(
        products.map((p) => ({ ...p, stock: 0 })),
        items,
        null,
        1000,
      ),
    { code: "CHECKOUT_STOCK_CHANGED" },
  );
});
test("payment signatures are exact and cannot be forged or accepted with malformed length", () => {
  const body = "order_test|pay_test",
    secret = "test-secret";
  const signature = createHmac("sha256", secret).update(body).digest("hex");
  verifySignature(body, signature, secret);
  for (const bad of ["", signature.slice(1), "g".repeat(64), "0".repeat(64)])
    assert.throws(() => verifySignature(body, bad, secret), {
      code: "INVALID_PAYMENT_SIGNATURE",
    });
  assert.throws(() => verifySignature(body + "changed", signature, secret));
});
test("live keys and missing keys fail closed", () => {
  const old = [process.env.RAZORPAY_KEY_ID, process.env.RAZORPAY_KEY_SECRET];
  try {
    process.env.RAZORPAY_KEY_SECRET = "secret";
    for (const key of ["", "rzp_live_example"]) {
      process.env.RAZORPAY_KEY_ID = key;
      assert.throws(getPaymentConfig, { code: "PAYMENT_NOT_CONFIGURED" });
    }
    process.env.RAZORPAY_KEY_ID = "rzp_test_example";
    assert.equal(getPaymentConfig().keyId, "rzp_test_example");
  } finally {
    for (const [i, key] of [
      "RAZORPAY_KEY_ID",
      "RAZORPAY_KEY_SECRET",
    ].entries()) {
      if (old[i] === undefined) delete process.env[key];
      else process.env[key] = old[i];
    }
  }
});
test("standard checkout is the default and unsupported payment flows fail closed", () => {
  const keys = [
    "RAZORPAY_KEY_ID",
    "RAZORPAY_KEY_SECRET",
    "RAZORPAY_PAYMENT_FLOW",
  ];
  const previous = keys.map((key) => process.env[key]);
  try {
    process.env.RAZORPAY_KEY_ID = "rzp_test_example";
    process.env.RAZORPAY_KEY_SECRET = "test-secret";
    delete process.env.RAZORPAY_PAYMENT_FLOW;
    assert.equal(getPaymentConfig().paymentFlow, "standard");
    process.env.RAZORPAY_PAYMENT_FLOW = "route";
    assert.equal(getPaymentConfig().paymentFlow, "route");
    for (const flow of ["demo", "live", "", "unknown"]) {
      process.env.RAZORPAY_PAYMENT_FLOW = flow;
      assert.throws(getPaymentConfig, { code: "PAYMENT_NOT_CONFIGURED" });
    }
  } finally {
    keys.forEach((key, i) => {
      if (previous[i] === undefined) delete process.env[key];
      else process.env[key] = previous[i];
    });
  }
});
test("boundary validators reject forged checkout totals, invalid shipment and review values", () => {
  assert.equal(checkoutSchema.safeParse({ priceInPaise: 1 }).success, false);
  assert.equal(
    shipmentSchema.safeParse({ status: "shipped", trackingNumber: "" }).success,
    false,
  );
  assert.equal(shipmentSchema.safeParse({ status: "placed" }).success, false);
  assert.equal(
    reviewSchema.safeParse({ rating: 6, body: "A review" }).success,
    false,
  );
  assert.equal(
    couponSchema.safeParse({
      code: "VALID",
      kind: "percent",
      value: 99,
      maxUses: 2,
      expiresAt: new Date(Date.now() + 60000).toISOString(),
    }).success,
    false,
  );
});
test("unpaid orders cannot generate an invoice", () =>
  assert.throws(() => createInvoice({ paymentStatus: "pending" }), {
    code: "INVOICE_NOT_AVAILABLE",
  }));
