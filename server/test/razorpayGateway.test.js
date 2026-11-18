import assert from "node:assert/strict";
import { beforeEach, afterEach, test } from "node:test";
import { razorpayGateway } from "../src/services/razorpayGateway.js";
import { linkVendorAccount } from "../src/controllers/commerceController.js";
import { Vendor } from "../src/models/vendorModel.js";

let previous;
beforeEach(() => {
  previous = [process.env.RAZORPAY_KEY_ID, process.env.RAZORPAY_KEY_SECRET];
  process.env.RAZORPAY_KEY_ID = "rzp_test_gateway";
  process.env.RAZORPAY_KEY_SECRET = "gateway-test-secret";
});
afterEach(() => {
  ["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET"].forEach((key, index) => {
    if (previous[index] === undefined) delete process.env[key];
    else process.env[key] = previous[index];
  });
});

test("linked-account verification calls the documented v2 endpoint", async (context) => {
  const fetch = context.mock.method(
    globalThis,
    "fetch",
    async (url, options) => {
      assert.equal(url, "https://api.razorpay.com/v2/accounts/acc_testvendor");
      assert.equal(options.method, "GET");
      return Response.json({
        id: "acc_testvendor",
        type: "route",
        status: "created",
      });
    },
  );
  const account = await razorpayGateway.fetchAccount("acc_testvendor");
  assert.equal(account.id, "acc_testvendor");
  assert.equal(fetch.mock.callCount(), 1);
});

test("payment and transfer lookups continue to use v1 endpoints", async (context) => {
  const calls = [];
  context.mock.method(globalThis, "fetch", async (url, options) => {
    calls.push([url, options.method]);
    return Response.json({ items: [] });
  });
  await razorpayGateway.fetchPayment("pay_test");
  await razorpayGateway.fetchTransfers("pay_test");
  assert.deepEqual(calls, [
    ["https://api.razorpay.com/v1/payments/pay_test", "GET"],
    ["https://api.razorpay.com/v1/payments/pay_test/transfers", "GET"],
  ]);
});

const paymentOrder = (paymentFlow) => ({
  _id: "507f1f77bcf86cd799439011",
  totalInPaise: 10000,
  paymentFlow,
  shipments: [
    {
      vendorId: "507f1f77bcf86cd799439012",
      accountId: "acc_testvendor",
      vendorAmountInPaise: 9000,
    },
  ],
});
test("standard test orders omit transfers even when a vendor has a linked account", async (context) => {
  context.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(url, "https://api.razorpay.com/v1/orders");
    assert.equal(options.method, "POST");
    const body = JSON.parse(options.body);
    assert.equal(body.amount, 10000);
    assert.equal(body.currency, "INR");
    assert.equal(body.receipt, "507f1f77bcf86cd799439011");
    assert.equal(Object.hasOwn(body, "transfers"), false);
    return Response.json({ id: "order_standard" });
  });
  assert.equal(
    (await razorpayGateway.createOrder(paymentOrder("standard"))).id,
    "order_standard",
  );
});
test("Route and legacy orders keep their held transfers", async (context) => {
  const calls = [];
  context.mock.method(globalThis, "fetch", async (url, options) => {
    calls.push(JSON.parse(options.body));
    return Response.json({ id: "order_route" });
  });
  for (const flow of ["route", undefined])
    await razorpayGateway.createOrder(paymentOrder(flow));
  for (const body of calls) {
    assert.equal(body.transfers.length, 1);
    assert.equal(body.transfers[0].account, "acc_testvendor");
    assert.equal(body.transfers[0].amount, 9000);
    assert.equal(body.transfers[0].on_hold, true);
  }
});
test("only Route refunds request transfer reversal", async (context) => {
  const calls = [];
  context.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(url, "https://api.razorpay.com/v1/payments/pay_test/refund");
    assert.equal(options.method, "POST");
    calls.push(JSON.parse(options.body));
    return Response.json({ id: "rfnd_test" });
  });
  for (const flow of ["standard", "route", undefined])
    await razorpayGateway.refund("pay_test", paymentOrder(flow));
  assert.equal(Object.hasOwn(calls[0], "reverse_all"), false);
  assert.equal(calls[1].reverse_all, true);
  assert.equal(calls[2].reverse_all, true);
  assert.ok(calls.every((body) => body.amount === 10000));
});

test("provider rejection stays safe and does not expose its response body", async (context) => {
  context.mock.method(globalThis, "fetch", async () =>
    Response.json(
      { error: { description: "PRIVATE_PROVIDER_DETAILS" } },
      { status: 400 },
    ),
  );
  await assert.rejects(
    razorpayGateway.fetchAccount("acc_testvendor"),
    (error) => {
      assert.equal(error.code, "PAYMENT_UNAVAILABLE");
      assert.equal(error.providerRejected, true);
      assert.equal(error.message.includes("PRIVATE_PROVIDER_DETAILS"), false);
      return true;
    },
  );
});

test("a created Route account can be connected without treating its status as product activation", async (context) => {
  context.mock.method(razorpayGateway, "fetchAccount", async () => ({
    id: "acc_testvendor",
    type: "route",
    status: "created",
  }));
  context.mock.method(Vendor, "findOneAndUpdate", async () => ({
    _id: "507f1f77bcf86cd799439011",
  }));
  let payload;
  await linkVendorAccount(
    {
      params: { vendorId: "507f1f77bcf86cd799439011" },
      body: { accountId: "acc_testvendor" },
    },
    {
      json: (value) => {
        payload = value;
      },
    },
  );
  assert.equal(payload.data.connected, true);
});

test("suspended and non-Route accounts cannot be connected", async (context) => {
  const write = context.mock.method(Vendor, "findOneAndUpdate", async () => {
    throw new Error("Must not update a vendor");
  });
  for (const account of [
    { id: "acc_testvendor", type: "route", status: "suspended" },
    { id: "acc_testvendor", type: "other", status: "created" },
  ]) {
    const fetchAccount = context.mock.method(
      razorpayGateway,
      "fetchAccount",
      async () => account,
    );
    await assert.rejects(
      linkVendorAccount(
        {
          params: { vendorId: "507f1f77bcf86cd799439011" },
          body: { accountId: "acc_testvendor" },
        },
        { json: () => {} },
      ),
      { code: "VENDOR_ACCOUNT_NOT_ACTIVE" },
    );
    fetchAccount.mock.restore();
  }
  assert.equal(write.mock.callCount(), 0);
});
