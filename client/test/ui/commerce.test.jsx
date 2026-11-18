import { StrictMode } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, afterEach, test, expect, vi } from "vitest";
import { AxiosError } from "axios";
import { App } from "../../src/App.jsx";
import { AuthContext } from "../../src/context/AuthContext.js";
import { apiClient, protectedApiClient } from "../../src/api/apiClient.js";
const ID = "507f1f77bcf86cd799439011",
  PRODUCT = "507f1f77bcf86cd799439012",
  VENDOR = "507f1f77bcf86cd799439013",
  ORDER = "507f1f77bcf86cd799439014";
const USER = {
  id: ID,
  name: "Buyer",
  email: "buyer@example.test",
  roles: ["customer"],
};
const VERSION = "3cc220a1-512a-4c6b-8ce0-8bac48146e5c";
const product = {
  id: PRODUCT,
  vendorId: VENDOR,
  title: "Test Mug",
  storeName: "Test store",
  description: "A useful mug for your daily coffee.",
  category: "home",
  stock: 10,
  priceInPaise: 10000,
  currency: "INR",
  imageUrl: null,
};
const cart = {
  version: VERSION,
  currency: "INR",
  items: [
    {
      productId: PRODUCT,
      quantity: 2,
      product,
      issue: null,
      lineTotalInPaise: 20000,
    },
  ],
  summary: { itemCount: 2, subtotalInPaise: 20000, hasIssues: false },
};
const order = {
  id: ORDER,
  paymentStatus: "pending",
  status: "pending",
  currency: "INR",
  createdAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 1800000).toISOString(),
  couponCode: "",
  address: {
    name: "Buyer",
    line1: "123 Test Street",
    city: "Delhi",
    state: "Delhi",
    postalCode: "110001",
    phone: "9876543210",
  },
  lines: [
    {
      productId: PRODUCT,
      title: "Test Mug",
      storeName: "Test store",
      quantity: 2,
      unitPriceInPaise: 10000,
      totalInPaise: 20000,
    },
  ],
  shipments: [
    {
      vendorId: VENDOR,
      storeName: "Test store",
      status: "placed",
      trackingNumber: "",
      totalInPaise: 20000,
      commissionInPaise: 2000,
      vendorAmountInPaise: 18000,
      transferStatus: "processed",
      history: [],
    },
  ],
  subtotalInPaise: 20000,
  discountInPaise: 0,
  totalInPaise: 20000,
  commissionInPaise: 2000,
};
const pagination = { page: 1, total: 1, totalPages: 1, limit: 12 };
const ok = (config, data) => ({
  config,
  status: 200,
  statusText: "OK",
  headers: {},
  data: { success: true, data },
});
const fail = (config, code, status = 409) => {
  throw new AxiosError(
    "Private transport",
    AxiosError.ERR_BAD_RESPONSE,
    config,
    null,
    { status, data: { error: { code, message: "PRIVATE_SERVER_ERROR" } } },
  );
};
let originalPublic, originalPrivate, privateAdapter, quoteAdapter;
beforeEach(() => {
  originalPublic = apiClient.defaults.adapter;
  originalPrivate = protectedApiClient.defaults.adapter;
  apiClient.defaults.adapter = async (c) =>
    c.url.endsWith("/reviews")
      ? ok(c, {
          reviews: [],
          average: 0,
          pagination: { ...pagination, total: 0 },
        })
      : ok(c, { product });
  privateAdapter = vi.fn(async (c) =>
    c.url === "/cart"
      ? ok(c, { cart })
      : c.url === "/orders"
        ? ok(c, { orders: [order], pagination })
        : ok(c, { order }),
  );
  quoteAdapter = vi.fn(async (c) =>
    ok(c, {
      quote: {
        currency: "INR",
        couponCode: JSON.parse(c.data).couponCode,
        subtotalInPaise: 20000,
        discountInPaise: JSON.parse(c.data).couponCode ? 2000 : 0,
        totalInPaise: JSON.parse(c.data).couponCode ? 18000 : 20000,
      },
    }),
  );
  protectedApiClient.defaults.adapter = (c) =>
    c.url === "/orders/quote" ? quoteAdapter(c) : privateAdapter(c);
});
afterEach(() => {
  apiClient.defaults.adapter = originalPublic;
  protectedApiClient.defaults.adapter = originalPrivate;
  vi.unstubAllGlobals();
});
const show = (route, user = USER) =>
  render(
    <StrictMode>
      <MemoryRouter initialEntries={[route]}>
        <AuthContext.Provider
          value={{ user, status: user ? "authenticated" : "guest" }}
        >
          <App />
        </AuthContext.Provider>
      </MemoryRouter>
    </StrictMode>,
  );
const fillAddress = async () => {
  for (const [label, value] of [
    ["Mobile number", "9876543210"],
    ["Address line 1", "123 Test Street"],
    ["City", "Delhi"],
    ["State", "Delhi"],
    ["PIN code", "110001"],
  ])
    await userEvent.type(screen.getByLabelText(label), value);
};
test("coupon totals can be previewed without an address or payment setup", async () => {
  show("/checkout");
  await screen.findByLabelText("Coupon code (optional)");
  await userEvent.type(
    screen.getByLabelText("Coupon code (optional)"),
    "SAVE10",
  );
  await userEvent.click(screen.getByRole("button", { name: "Check total" }));
  const preview = screen.getByRole("region", {
    name: "Checkout price preview",
  });
  await within(preview).findByText("₹180.00");
  expect(JSON.parse(quoteAdapter.mock.calls.at(-1)[0].data)).toEqual({
    cartVersion: VERSION,
    couponCode: "SAVE10",
  });
  expect(privateAdapter.mock.calls.some(([c]) => c.method === "post")).toBe(
    false,
  );
  await userEvent.type(
    screen.getByLabelText("Coupon code (optional)"),
    "OTHER",
  );
  expect(within(preview).queryByText("₹180.00")).toBeNull();
  expect(
    within(preview).getByText(
      "Check the total to apply your latest coupon code.",
    ),
  ).toBeTruthy();
});
test("invalid coupons display a safe preview error without creating an order", async () => {
  quoteAdapter.mockImplementation(async (c) =>
    JSON.parse(c.data).couponCode
      ? fail(c, "COUPON_UNAVAILABLE")
      : ok(c, {
          quote: {
            currency: "INR",
            couponCode: "",
            subtotalInPaise: 20000,
            discountInPaise: 0,
            totalInPaise: 20000,
          },
        }),
  );
  show("/checkout");
  await screen.findByLabelText("Coupon code (optional)");
  await userEvent.type(
    screen.getByLabelText("Coupon code (optional)"),
    "BADCODE",
  );
  await userEvent.click(screen.getByRole("button", { name: "Check total" }));
  await screen.findByText(
    "This coupon is expired, fully used, disabled or below its minimum spend.",
  );
  expect(privateAdapter.mock.calls.some(([c]) => c.method === "post")).toBe(
    false,
  );
});
test("checkout sends address, coupon and cart revision without client prices", async () => {
  privateAdapter.mockImplementation(async (c) =>
    c.url === "/cart"
      ? ok(c, { cart })
      : c.method === "post"
        ? ok(c, { order })
        : ok(c, { order }),
  );
  show("/checkout");
  await screen.findByLabelText("Mobile number");
  await fillAddress();
  await userEvent.type(
    screen.getByLabelText("Coupon code (optional)"),
    "SAVE10",
  );
  await userEvent.click(screen.getByRole("button", { name: "Review order" }));
  await screen.findByRole("heading", { name: "Your order" });
  const request = privateAdapter.mock.calls
    .map(([c]) => c)
    .find((c) => c.method === "post" && c.url === "/orders");
  expect(JSON.parse(request.data)).toEqual({
    address: {
      name: "Buyer",
      phone: "9876543210",
      line1: "123 Test Street",
      line2: "",
      city: "Delhi",
      state: "Delhi",
      postalCode: "110001",
      country: "IN",
    },
    couponCode: "SAVE10",
    cartVersion: VERSION,
  });
  expect(request.headers.get("Idempotency-Key")).toMatch(/^[a-f0-9-]{36}$/);
});
test("uncertain checkout retries preserve the same operation key", async () => {
  privateAdapter.mockImplementation(async (c) =>
    c.url === "/cart" ? ok(c, { cart }) : fail(c, "PAYMENT_UNAVAILABLE", 503),
  );
  show("/checkout");
  await screen.findByLabelText("Mobile number");
  await fillAddress();
  for (let i = 0; i < 2; i++) {
    await userEvent.click(screen.getByRole("button", { name: "Review order" }));
    await screen.findByRole("alert");
  }
  const calls = privateAdapter.mock.calls
    .map(([c]) => c)
    .filter((c) => c.method === "post");
  expect(calls).toHaveLength(2);
  expect(calls[0].headers.get("Idempotency-Key")).toBe(
    calls[1].headers.get("Idempotency-Key"),
  );
  expect(screen.queryByText("PRIVATE_SERVER_ERROR")).toBeNull();
});
test("checkout blocks carts with unavailable quantities", async () => {
  privateAdapter.mockImplementation(async (c) =>
    ok(c, { cart: { ...cart, summary: { ...cart.summary, hasIssues: true } } }),
  );
  show("/checkout");
  await screen.findByText("Review your cart items before checkout.");
  expect(
    screen.getByRole("button", { name: "Review order" }).closest("fieldset")
      .disabled,
  ).toBe(true);
});
test("missing test keys produce a clear setup error on the payment screen", async () => {
  privateAdapter.mockImplementation(async (c) =>
    c.url.endsWith("/payment")
      ? fail(c, "PAYMENT_NOT_CONFIGURED", 503)
      : ok(c, { order }),
  );
  show(`/orders/${ORDER}`);
  await userEvent.click(
    await screen.findByRole("button", { name: "Pay with Razorpay (test)" }),
  );
  await screen.findByText(
    "Add Razorpay test keys to the server environment before checkout. Live keys are not supported.",
  );
  expect(screen.queryByText("PRIVATE_SERVER_ERROR")).toBeNull();
});
test("test checkout forwards callback to server and displays paid order only after server verification", async () => {
  const open = vi.fn();
  vi.stubGlobal(
    "Razorpay",
    class {
      constructor(options) {
        this.options = options;
      }
      open() {
        open();
        queueMicrotask(() =>
          this.options.handler({
            razorpay_order_id: "order_test",
            razorpay_payment_id: "pay_test",
            razorpay_signature: "0".repeat(64),
          }),
        );
      }
      close() {}
    },
  );
  privateAdapter.mockImplementation(async (c) =>
    c.url.endsWith("/payment")
      ? ok(c, {
          payment: {
            keyId: "rzp_test_test",
            orderId: "order_test",
            amount: 20000,
            currency: "INR",
          },
        })
      : c.url.endsWith("/verify-payment")
        ? ok(c, {
            order: { ...order, paymentStatus: "paid", status: "placed" },
          })
        : ok(c, { order }),
  );
  show(`/orders/${ORDER}`);
  await userEvent.click(
    await screen.findByRole("button", { name: "Pay with Razorpay (test)" }),
  );
  await screen.findByRole("button", { name: "Download PDF invoice" });
  expect(open).toHaveBeenCalledTimes(1);
  expect(
    privateAdapter.mock.calls.some(([c]) => c.url.endsWith("/verify-payment")),
  ).toBe(true);
});
test("vendors must enter a tracking number before marking a shipment shipped", async () => {
  const paid = {
    ...order,
    paymentStatus: "paid",
    status: "packed",
    shipments: [{ ...order.shipments[0], status: "packed" }],
  };
  privateAdapter.mockImplementation(async (c) =>
    c.method === "patch"
      ? ok(c, { order: paid })
      : ok(c, { orders: [paid], pagination }),
  );
  show("/vendor/orders", { ...USER, roles: ["customer", "vendor"] });
  await screen.findByLabelText("Tracking number");
  await userEvent.click(screen.getByRole("button", { name: "Mark shipped" }));
  expect(privateAdapter.mock.calls.some(([c]) => c.method === "patch")).toBe(
    false,
  );
  await userEvent.type(screen.getByLabelText("Tracking number"), "TRACK123");
  await userEvent.click(screen.getByRole("button", { name: "Mark shipped" }));
  await waitFor(() =>
    expect(privateAdapter.mock.calls.some(([c]) => c.method === "patch")).toBe(
      true,
    ),
  );
  const patch = privateAdapter.mock.calls
    .map(([c]) => c)
    .find((c) => c.method === "patch");
  expect(JSON.parse(patch.data)).toEqual({
    status: "shipped",
    trackingNumber: "TRACK123",
  });
});

test("standard vendor orders show accounting shares without claiming a Route transfer", async () => {
  privateAdapter.mockImplementation(async (c) =>
    ok(c, {
      orders: [
        {
          ...order,
          paymentFlow: "standard",
          paymentStatus: "paid",
          status: "placed",
          shipments: [
            { ...order.shipments[0], transferStatus: "not_requested" },
          ],
        },
      ],
      pagination,
    }),
  );
  show("/vendor/orders", { ...USER, roles: ["customer", "vendor"] });
  await screen.findByText(
    "Vendor transfers are disabled. Your share is recorded for accounting only.",
  );
  expect(screen.getByText("₹180.00")).toBeTruthy();
  expect(screen.queryByText(/Route transfer:/)).toBeNull();
  expect(screen.getByRole("button", { name: "Mark packed" })).toBeTruthy();
});
test("reviews show eligibility errors safely", async () => {
  privateAdapter.mockImplementation(async (c) =>
    fail(c, "REVIEW_NOT_ELIGIBLE", 403),
  );
  show(`/products/${PRODUCT}`);
  await screen.findByLabelText("Your review");
  await userEvent.type(screen.getByLabelText("Your review"), "A useful mug");
  await userEvent.click(screen.getByRole("button", { name: "Save review" }));
  await screen.findByText(
    "You can review this product after your order is delivered.",
  );
});
test("customer cannot open admin analytics or vendor order tools", async () => {
  show("/admin/analytics");
  await screen.findByText(/does not have access/i);
  expect(privateAdapter).not.toHaveBeenCalled();
});
test("admin analytics renders confirmed totals and management links", async () => {
  privateAdapter.mockImplementation(async (c) =>
    ok(c, {
      analytics: {
        users: 5,
        vendors: 2,
        products: 3,
        pendingApplications: 1,
        refundPending: 0,
        pendingPayments: 1,
        totals: {
          orders: 2,
          revenueInPaise: 20000,
          commissionInPaise: 2000,
          discountInPaise: 1000,
        },
        dailySales: [],
        topStores: [],
      },
    }),
  );
  show("/admin/analytics", { ...USER, roles: ["admin"] });
  await screen.findByText("Platform commission");
  expect(
    screen.getByRole("link", { name: "Coupons" }).getAttribute("href"),
  ).toBe("/admin/coupons");
});
