import assert from "node:assert/strict";
import { randomBytes, randomUUID, createHmac } from "node:crypto";
import { once } from "node:events";
import { before, beforeEach, after, describe, test, mock } from "node:test";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { app } from "../src/app.js";
import { User } from "../src/models/userModel.js";
import { Vendor } from "../src/models/vendorModel.js";
import { Product } from "../src/models/productModel.js";
import { Order } from "../src/models/orderModel.js";
import { Coupon } from "../src/models/couponModel.js";
import { Review } from "../src/models/reviewModel.js";
import { orderService } from "../src/services/orderService.js";
import { paymentService } from "../src/services/paymentService.js";
import { reviewService } from "../src/services/reviewService.js";
import { analyticsService } from "../src/services/analyticsService.js";
import { razorpayGateway } from "../src/services/razorpayGateway.js";
import { cartStorage } from "../src/services/cartStorage.js";
import { createAccessToken } from "../src/services/tokenService.js";

describe(
  "Commerce with real isolated MongoDB transactions; Razorpay transport simulated",
  { concurrency: false },
  () => {
    let db,
      server,
      base,
      buyer,
      other,
      seller,
      seller2,
      admin,
      vendor,
      vendor2,
      product,
      product2,
      cart;
    const remotes = new Map();
    let providerCreates = 0,
      cartClears = 0;
    const address = {
      name: "Test Buyer",
      phone: "9876543210",
      line1: "123 Test Street",
      line2: "",
      city: "Delhi",
      state: "Delhi",
      postalCode: "110001",
      country: "IN",
    };
    const request = async (
      route,
      user = buyer,
      method = "GET",
      body,
      headers = {},
    ) => {
      const response = await fetch(base + route, {
        method,
        headers: {
          ...(user
            ? { Authorization: `Bearer ${createAccessToken(String(user._id))}` }
            : {}),
          ...(body ? { "Content-Type": "application/json" } : {}),
          ...headers,
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      return {
        response,
        payload: response.headers.get("content-type")?.includes("json")
          ? await response.json()
          : Buffer.from(await response.arrayBuffer()),
      };
    };
    const checkout = (user = buyer, overrides = {}) =>
      orderService.createCheckout(
        String(user._id),
        { address, couponCode: "", cartVersion: cart.version, ...overrides },
        randomUUID(),
      );
    const capture = async (order) => {
      const stored = await Order.findById(order.id);
      const remote = remotes.get(stored.providerOrderId);
      remote.payment = {
        id: `pay_${String(stored._id)}`,
        order_id: remote.id,
        amount: stored.totalInPaise,
        amount_refunded: 0,
        currency: "INR",
        status: "captured",
      };
      return remote.payment;
    };
    before(async () => {
      process.env.JWT_SECRET = randomBytes(64).toString("hex");
      process.env.RAZORPAY_KEY_ID = "rzp_test_checkout";
      process.env.RAZORPAY_KEY_SECRET = "test-secret";
      process.env.RAZORPAY_WEBHOOK_SECRET = "webhook-secret";
      db = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
      await mongoose.connect(db.getUri(), {
        dbName: "marketplace-commerce-tests",
      });
      await Promise.all([
        User.init(),
        Vendor.init(),
        Product.init(),
        Order.init(),
        Coupon.init(),
        Review.init(),
      ]);
      mock.method(cartStorage, "read", async () => cart);
      mock.method(cartStorage, "mutate", async () => {
        cartClears++;
        return { version: randomUUID(), items: [] };
      });
      mock.method(razorpayGateway, "createOrder", async (order) => {
        providerCreates++;
        const remote = {
          id: `order_${order._id}`,
          receipt: String(order._id),
          amount: order.totalInPaise,
          currency: "INR",
          transfers:
            order.paymentFlow === "standard"
              ? []
              : order.shipments.map((s, i) => ({
                  id: `trf_${order._id}${i}`,
                  recipient: s.accountId,
                  amount: s.vendorAmountInPaise,
                  currency: "INR",
                  on_hold: true,
                  status: "processed",
                })),
        };
        remotes.set(remote.id, remote);
        return remote;
      });
      mock.method(
        razorpayGateway,
        "recoverOrder",
        async (order) =>
          [...remotes.values()].find((r) => r.receipt === String(order._id)) ||
          null,
      );
      mock.method(razorpayGateway, "fetchPayments", async (id) => ({
        items: remotes.get(id)?.payment ? [remotes.get(id).payment] : [],
      }));
      mock.method(
        razorpayGateway,
        "fetchPayment",
        async (id) =>
          [...remotes.values()].find((r) => r.payment?.id === id).payment,
      );
      mock.method(razorpayGateway, "fetchTransfers", async (id) => ({
        items: [...remotes.values()].find((r) => r.payment?.id === id)
          .transfers,
      }));
      mock.method(razorpayGateway, "releaseTransfer", async (id) => {
        const t = [...remotes.values()]
          .flatMap((r) => r.transfers)
          .find((t) => t.id === id);
        t.on_hold = false;
        return t;
      });
      mock.method(razorpayGateway, "fetchRefunds", async (id) => ({
        items: [...remotes.values()].find((r) => r.payment?.id === id)?.refund
          ? [[...remotes.values()].find((r) => r.payment?.id === id).refund]
          : [],
      }));
      mock.method(razorpayGateway, "refund", async (id, order) => {
        const r = [...remotes.values()].find((r) => r.payment?.id === id);
        r.payment.amount_refunded = order.totalInPaise;
        r.refund = {
          id: `rfnd_${order._id}`,
          receipt: String(order._id),
          status: "processed",
        };
        return r.refund;
      });
      server = app.listen(0, "127.0.0.1");
      await once(server, "listening");
      base = `http://127.0.0.1:${server.address().port}`;
    });
    beforeEach(async () => {
      process.env.RAZORPAY_PAYMENT_FLOW = "route";
      for (const model of [Order, Coupon, Review, Product, Vendor, User])
        await model.deleteMany({});
      remotes.clear();
      providerCreates = 0;
      cartClears = 0;
      [buyer, other, seller, seller2, admin] = await User.create(
        [
          ["Buyer", "customer"],
          ["Other", "customer"],
          ["Seller", "vendor"],
          ["Second Seller", "vendor"],
          ["Admin", "admin"],
        ].map(([name, role], i) => ({
          name,
          emailNormalized: `user${i}@example.test`,
          passwordHash: "not-used-in-test",
          roles: [role],
        })),
      );
      [vendor, vendor2] = await Vendor.create([
        {
          ownerId: seller._id,
          storeName: "First store",
          description: "A test store selling useful home products.",
          status: "approved",
          razorpayAccountId: "acc_testfirst",
        },
        {
          ownerId: seller2._id,
          storeName: "Second store",
          description: "Another test store selling useful products.",
          status: "approved",
          razorpayAccountId: "acc_testsecond",
        },
      ]);
      [product, product2] = await Product.create(
        [vendor, vendor2].map((v, i) => ({
          vendorId: v._id,
          storeName: v.storeName,
          title: `Test Product ${i}`,
          description: "A useful everyday product for testing the marketplace.",
          category: "home",
          priceInPaise: 10000 + i,
          stock: 10,
          status: "active",
        })),
      );
      cart = {
        version: randomUUID(),
        items: [
          { productId: String(product._id), quantity: 2 },
          { productId: String(product2._id), quantity: 1 },
        ],
      };
    });
    after(async () => {
      if (server) await new Promise((resolve) => server.close(resolve));
      mock.restoreAll();
      await mongoose.disconnect();
      if (db) await db.stop();
    });

    test("checkout calculates vendor splits and stores one order for retried requests", async () => {
      const input = { address, couponCode: "", cartVersion: cart.version },
        operation = randomUUID();
      const first = await orderService.createCheckout(
        String(buyer._id),
        input,
        operation,
      );
      const second = await orderService.createCheckout(
        String(buyer._id),
        input,
        operation,
      );
      assert.equal(first.id, second.id);
      assert.equal(providerCreates, 1);
      assert.equal(first.totalInPaise, 30001);
      assert.equal(
        first.shipments.reduce(
          (s, x) => s + x.vendorAmountInPaise + x.commissionInPaise,
          0,
        ),
        first.totalInPaise,
      );
      await assert.rejects(
        orderService.createCheckout(
          String(buyer._id),
          { ...input, couponCode: "CHANGED" },
          operation,
        ),
        { code: "IDEMPOTENCY_CONFLICT" },
      );
      assert.equal(JSON.stringify(first).includes("acc_testfirst"), false);
    });
    test("HTTP boundaries reject forged prices, unauthenticated users and customer admin access", async () => {
      assert.equal((await request("/api/orders", null)).response.status, 401);
      assert.equal(
        (await request("/api/admin/analytics")).response.status,
        403,
      );
      assert.equal(
        (
          await request(
            "/api/orders",
            buyer,
            "POST",
            { address, cartVersion: cart.version, priceInPaise: 1 },
            { "Idempotency-Key": randomUUID() },
          )
        ).response.status,
        422,
      );
    });
    test("standard checkout verifies a coupon purchase without linked accounts or any Route calls", async () => {
      process.env.RAZORPAY_PAYMENT_FLOW = "standard";
      await Vendor.updateMany({}, { $unset: { razorpayAccountId: 1 } });
      await Coupon.create({
        code: "SAVE10",
        kind: "percent",
        value: 10,
        maxUses: 10,
        expiresAt: new Date(Date.now() + 600000),
        createdBy: admin._id,
      });
      const input = {
        address,
        cartVersion: cart.version,
        couponCode: "SAVE10",
      };
      const operation = randomUUID();
      const response = await request("/api/orders", buyer, "POST", input, {
        "Idempotency-Key": operation,
      });
      assert.equal(response.response.status, 201);
      const order = response.payload.data.order;
      assert.equal(order.paymentFlow, "standard");
      assert.equal(order.totalInPaise, 27001);
      assert.equal(order.commissionInPaise, 2700);
      assert.ok(
        order.shipments.every((s) => s.transferStatus === "not_requested"),
      );
      const stored = await Order.findById(order.id);
      assert.ok(
        stored.shipments.every(
          (s) => s.accountId === null && s.transferId === null,
        ),
      );
      assert.equal(
        (await request(`/api/orders/${order.id}/payment`)).response.status,
        200,
      );
      // A configuration change must not turn an already-created standard order into Route.
      process.env.RAZORPAY_PAYMENT_FLOW = "route";
      const retry = await orderService.createCheckout(
        String(buyer._id),
        input,
        operation,
      );
      assert.equal(retry.id, order.id);
      assert.equal(retry.paymentFlow, "standard");
      assert.equal(providerCreates, 1);
      const transferReads = razorpayGateway.fetchTransfers.mock.callCount();
      const releases = razorpayGateway.releaseTransfer.mock.callCount();
      const payment = await capture(order);
      const signature = createHmac("sha256", "test-secret")
        .update(`${payment.order_id}|${payment.id}`)
        .digest("hex");
      const verified = await request(
        `/api/orders/${order.id}/verify-payment`,
        buyer,
        "POST",
        {
          razorpay_order_id: payment.order_id,
          razorpay_payment_id: payment.id,
          razorpay_signature: signature,
        },
      );
      assert.equal(verified.response.status, 200);
      assert.equal(verified.payload.data.order.paymentStatus, "paid");
      await paymentService.reconcileOrder(order.id);
      assert.equal(
        razorpayGateway.fetchTransfers.mock.callCount(),
        transferReads,
      );
      assert.equal(razorpayGateway.releaseTransfer.mock.callCount(), releases);
      assert.equal(cartClears, 1);
      assert.equal((await Product.findById(product._id)).stock, 8);
      assert.equal((await Coupon.findOne({ code: "SAVE10" })).used, 1);
      assert.equal(
        (await Order.findById(order.id)).reconciliationComplete,
        true,
      );
      assert.equal(
        (await request(`/api/orders/${order.id}/invoice`)).response.status,
        200,
      );
    });
    test("Route checkout still requires linked vendor accounts", async () => {
      await Vendor.updateMany({}, { $unset: { razorpayAccountId: 1 } });
      await assert.rejects(checkout(), { code: "VENDOR_PAYMENTS_NOT_READY" });
      assert.equal(await Order.countDocuments(), 0);
      assert.equal(providerCreates, 0);
    });
    test("standard captured expiry uses the refund flow without vendor transfers or stock changes", async () => {
      process.env.RAZORPAY_PAYMENT_FLOW = "standard";
      const order = await checkout();
      await capture(order);
      await Order.updateOne(
        { _id: order.id },
        { $set: { expiresAt: new Date(0) } },
      );
      const transfers = razorpayGateway.fetchTransfers.mock.callCount();
      await paymentService.reconcileOrder(order.id);
      await paymentService.reconcileOrder(order.id);
      assert.equal((await Order.findById(order.id)).paymentStatus, "refunded");
      assert.equal((await Product.findById(product._id)).stock, 10);
      assert.equal(cartClears, 0);
      assert.equal(razorpayGateway.fetchTransfers.mock.callCount(), transfers);
      const refunds = razorpayGateway.refund.mock.calls.filter(
        (call) => String(call.arguments[1]._id) === order.id,
      );
      assert.equal(refunds.length, 1);
      assert.equal(refunds[0].arguments[1].paymentFlow, "standard");
    });
    test("order and invoice are scoped to their customer", async () => {
      const order = await checkout();
      assert.equal(
        (await request(`/api/orders/${order.id}`, other)).response.status,
        404,
      );
      assert.equal(
        (await request(`/api/orders/${order.id}/invoice`, other)).response
          .status,
        404,
      );
      assert.equal(
        (await request(`/api/orders/${order.id}/invoice`)).response.status,
        409,
      );
    });
    test("duplicate concurrent captured callbacks deduct stock and coupon usage once", async () => {
      await Coupon.create({
        code: "SAVE10",
        kind: "percent",
        value: 10,
        maxUses: 100,
        expiresAt: new Date(Date.now() + 600000),
        createdBy: admin._id,
      });
      const order = await checkout(buyer, { couponCode: "SAVE10" }),
        payment = await capture(order);
      await Promise.all(
        Array.from({ length: 5 }, () =>
          orderService.recordCapturedPayment(order.id, payment),
        ),
      );
      assert.equal((await Product.findById(product._id)).stock, 8);
      assert.equal((await Coupon.findOne({ code: "SAVE10" })).used, 1);
      assert.equal((await Order.findById(order.id)).paymentStatus, "paid");
    });
    test("competing checkouts cannot sell the last unit twice", async () => {
      await Product.updateOne({ _id: product._id }, { $set: { stock: 1 } });
      cart.items = [{ productId: String(product._id), quantity: 1 }];
      const a = await checkout(),
        b = await checkout(other);
      const pa = await capture(a),
        pb = await capture(b);
      await Promise.all([
        orderService.recordCapturedPayment(a.id, pa),
        orderService.recordCapturedPayment(b.id, pb),
      ]);
      const orders = await Order.find();
      assert.equal(orders.filter((o) => o.paymentStatus === "paid").length, 1);
      assert.equal(
        orders.filter((o) => o.paymentStatus === "refund_pending").length,
        1,
      );
      assert.equal((await Product.findById(product._id)).stock, 0);
    });
    test("a later stock failure rolls back earlier stock changes in the transaction", async () => {
      const order = await checkout(),
        payment = await capture(order);
      await Product.updateOne({ _id: product2._id }, { $set: { stock: 0 } });
      await orderService.recordCapturedPayment(order.id, payment);
      assert.equal((await Product.findById(product._id)).stock, 10);
      assert.equal(
        (await Order.findById(order.id)).paymentStatus,
        "refund_pending",
      );
      await paymentService.reconcileOrder(order.id);
      await paymentService.reconcileOrder(order.id);
      assert.equal((await Order.findById(order.id)).paymentStatus, "refunded");
      assert.equal(
        razorpayGateway.refund.mock.calls.filter(
          (c) => String(c.arguments[1]._id) === order.id,
        ).length,
        1,
      );
    });
    test("valid signature alone never marks an uncaptured payment paid", async () => {
      const order = await checkout(),
        stored = await Order.findById(order.id),
        paymentId = "pay_notcaptured";
      remotes.get(stored.providerOrderId).payment = {
        id: paymentId,
        order_id: stored.providerOrderId,
        amount: stored.totalInPaise,
        currency: "INR",
        status: "authorized",
      };
      const signature = createHmac("sha256", "test-secret")
        .update(`${stored.providerOrderId}|${paymentId}`)
        .digest("hex");
      const result = await request(
        `/api/orders/${order.id}/verify-payment`,
        buyer,
        "POST",
        {
          razorpay_order_id: stored.providerOrderId,
          razorpay_payment_id: paymentId,
          razorpay_signature: signature,
        },
      );
      assert.equal(result.response.status, 200);
      assert.equal(result.payload.data.order.paymentStatus, "pending");
      assert.equal((await Product.findById(product._id)).stock, 10);
    });
    test("legacy Route orders still release held transfers after the default changes to standard", async () => {
      const order = await checkout();
      await Order.collection.updateOne(
        { _id: new mongoose.Types.ObjectId(order.id) },
        { $unset: { paymentFlow: 1 } },
      );
      process.env.RAZORPAY_PAYMENT_FLOW = "standard";
      await capture(order);
      await paymentService.reconcileOrder(order.id);
      assert.ok([...remotes.values()][0].transfers.every((t) => !t.on_hold));
      assert.equal(cartClears, 1);
      const invoice = await request(`/api/orders/${order.id}/invoice`);
      assert.equal(invoice.response.status, 200);
      assert.equal(invoice.payload.subarray(0, 5).toString(), "%PDF-");
      assert.ok(invoice.payload.length > 1000);
      assert.equal(
        (await Order.findById(order.id)).reconciliationComplete,
        true,
      );
    });
    test("vendor DTO hides other stores and shipment stages cannot be skipped or changed by another vendor", async () => {
      const order = await checkout(),
        payment = await capture(order);
      await orderService.recordCapturedPayment(order.id, payment);
      const list = await request("/api/vendor/orders", seller);
      assert.equal(list.payload.data.orders[0].lines.length, 1);
      assert.equal(list.payload.data.orders[0].shipments.length, 1);
      assert.equal(
        (
          await request(
            `/api/vendor/orders/${order.id}/shipment`,
            seller,
            "PATCH",
            { status: "delivered" },
          )
        ).response.status,
        409,
      );
      for (const status of ["packed", "shipped", "delivered"])
        assert.equal(
          (
            await request(
              `/api/vendor/orders/${order.id}/shipment`,
              seller,
              "PATCH",
              {
                status,
                trackingNumber: status === "shipped" ? "TRACK123" : "",
              },
            )
          ).response.status,
          200,
        );
      const own = (await Order.findById(order.id)).shipments.find(
        (s) => String(s.vendorId) === String(vendor._id),
      );
      assert.equal(own.status, "delivered");
      assert.equal(own.history.length, 4);
    });
    test("reviews require delivery and one customer can update only one review per product", async () => {
      const order = await checkout(),
        payment = await capture(order);
      await orderService.recordCapturedPayment(order.id, payment);
      await assert.rejects(
        reviewService.save(
          { id: String(buyer._id), name: buyer.name },
          String(product._id),
          { rating: 5, body: "A great product" },
        ),
        { code: "REVIEW_NOT_ELIGIBLE" },
      );
      for (const status of ["packed", "shipped", "delivered"])
        await orderService.updateShipment(String(seller._id), order.id, {
          status,
          trackingNumber: "TRACK123",
        });
      await reviewService.save(
        { id: String(buyer._id), name: buyer.name },
        String(product._id),
        { rating: 5, body: "A great product" },
      );
      await reviewService.save(
        { id: String(buyer._id), name: buyer.name },
        String(product._id),
        { rating: 4, body: "Updated honest review" },
      );
      assert.equal(await Review.countDocuments(), 1);
      const list = await reviewService.list(String(product._id), {
        page: 1,
        limit: 5,
      });
      assert.equal(list.average, 4);
      assert.equal(JSON.stringify(list).includes(buyer.emailNormalized), false);
      await assert.rejects(
        reviewService.save(
          { id: String(seller._id), name: seller.name },
          String(product._id),
          { rating: 5, body: "Own review" },
        ),
        { code: "SELF_REVIEW" },
      );
    });
    test("raw webhook signatures reject tampering and duplicate events stay idempotent", async () => {
      const order = await checkout(),
        payment = await capture(order),
        body = {
          event: "payment.captured",
          payload: { payment: { entity: { order_id: payment.order_id } } },
        };
      const signature = createHmac("sha256", "webhook-secret")
        .update(JSON.stringify(body))
        .digest("hex");
      assert.equal(
        (
          await request("/api/payments/razorpay/webhook", null, "POST", body, {
            "X-Razorpay-Signature": "0".repeat(64),
          })
        ).response.status,
        400,
      );
      for (let i = 0; i < 2; i++)
        assert.equal(
          (
            await request(
              "/api/payments/razorpay/webhook",
              null,
              "POST",
              body,
              { "X-Razorpay-Signature": signature },
            )
          ).response.status,
          200,
        );
      assert.equal((await Product.findById(product._id)).stock, 8);
    });
    test("uncertain provider creation recovers by receipt without a second POST", async (context) => {
      const create = razorpayGateway.createOrder;
      context.mock.method(razorpayGateway, "createOrder", async (order) => {
        await create(order);
        const error = new Error("Uncertain network outcome");
        error.code = "PAYMENT_UNAVAILABLE";
        throw error;
      });
      await assert.rejects(checkout(), { code: "PAYMENT_UNAVAILABLE" });
      const stored = await Order.findOne();
      assert.equal(stored.providerState, "unknown");
      await Order.collection.updateOne(
        { _id: stored._id },
        { $set: { updatedAt: new Date(Date.now() - 20000) } },
      );
      const recovered = await orderService.ensureProviderOrder(
        await Order.findById(stored._id),
      );
      assert.equal(recovered.providerOrderId, `order_${stored._id}`);
      assert.equal(providerCreates, 1);
    });
    test("expired captured checkouts enter refund handling without deducting stock", async () => {
      const order = await checkout(),
        payment = await capture(order);
      await Order.updateOne(
        { _id: order.id },
        { $set: { expiresAt: new Date(0) } },
      );
      await orderService.recordCapturedPayment(order.id, payment);
      assert.equal(
        (await Order.findById(order.id)).paymentStatus,
        "refund_pending",
      );
      assert.equal((await Product.findById(product._id)).stock, 10);
    });
    test("coupon usage limit is enforced atomically across competing payments", async () => {
      await Coupon.create({
        code: "LASTUSE",
        kind: "percent",
        value: 10,
        maxUses: 1,
        expiresAt: new Date(Date.now() + 600000),
        createdBy: admin._id,
      });
      const a = await checkout(buyer, { couponCode: "LASTUSE" }),
        b = await checkout(other, { couponCode: "LASTUSE" });
      await Promise.all([
        orderService.recordCapturedPayment(a.id, await capture(a)),
        orderService.recordCapturedPayment(b.id, await capture(b)),
      ]);
      assert.equal((await Coupon.findOne({ code: "LASTUSE" })).used, 1);
      assert.equal(await Order.countDocuments({ paymentStatus: "paid" }), 1);
      assert.equal((await Product.findById(product._id)).stock, 8);
    });
    test("admin can create and disable coupons while customers cannot", async () => {
      const input = {
        code: "NEWCODE",
        kind: "fixed",
        value: 500,
        maxUses: 10,
        expiresAt: new Date(Date.now() + 600000).toISOString(),
      };
      assert.equal(
        (await request("/api/admin/coupons", buyer, "POST", input)).response
          .status,
        403,
      );
      const created = await request("/api/admin/coupons", admin, "POST", input);
      assert.equal(created.response.status, 201);
      const updated = await request(
        `/api/admin/coupons/${created.payload.data.coupon.id}`,
        admin,
        "PATCH",
        { active: false },
      );
      assert.equal(updated.payload.data.coupon.active, false);
    });
    test("analytics counts paid sales and commission only", async () => {
      const order = await checkout(),
        payment = await capture(order);
      await orderService.recordCapturedPayment(order.id, payment);
      await checkout(other);
      const analytics = await analyticsService.overview();
      assert.equal(analytics.totals.orders, 1);
      assert.equal(analytics.totals.revenueInPaise, order.totalInPaise);
      assert.equal(analytics.pendingPayments, 1);
      assert.equal(analytics.topStores.length, 2);
    });
  },
);
