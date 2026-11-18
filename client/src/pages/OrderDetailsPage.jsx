import { useCallback } from "react";
import { Link, useParams } from "react-router";
import { MarketplaceLayout } from "../components/marketplace/MarketplaceLayout.jsx";
import { Button, Feedback, Loading } from "../components/marketplace/ui.jsx";
import { OrderSummary } from "../components/orders/OrderSummary.jsx";
import { ShipmentCard } from "../components/orders/ShipmentCard.jsx";
import { useResource } from "../hooks/useResource.js";
import { useAction } from "../hooks/useAction.js";
import { useAuth } from "../hooks/useAuth.js";
import {
  getOrder,
  getPayment,
  verifyPayment,
  refreshOrder,
  downloadInvoice,
} from "../services/commerceService.js";
import { openTestCheckout } from "../utils/razorpayCheckout.js";
const OrderDetails = ({ orderId }) => {
  const { user } = useAuth();
  const loader = useCallback(
    (signal) => getOrder(orderId, { signal }),
    [orderId],
  );
  const resource = useResource(loader);
  const action = useAction();
  const pay = async () => {
    const result = await action.run(async (options) => {
      const payment = await getPayment(orderId, options);
      const response = await openTestCheckout(
        payment,
        user.name,
        options.signal,
      );
      return response ? verifyPayment(orderId, response, options) : null;
    });
    if (result && result !== true) resource.replaceData(result);
    else resource.reload();
  };
  const refresh = async () => {
    const order = await action.run(
      (options) => refreshOrder(orderId, "customer", options),
      "Payment status refreshed.",
    );
    if (order) resource.replaceData(order);
  };
  const order = resource.data;
  return (
    <MarketplaceLayout title="Your order | Marketplace">
      <Link to="/orders" className="text-sm text-brand underline">
        All orders
      </Link>
      <h1 className="mt-5 text-3xl font-bold">Your order</h1>
      <p className="mt-3 text-sm text-muted">
        Razorpay test mode · No real money is charged.
      </p>
      <Feedback message={resource.error} error />
      <Feedback {...action.feedback} />
      {resource.error && (
        <Button onClick={resource.reload} secondary>
          Try again
        </Button>
      )}
      {resource.loading ? (
        <Loading />
      ) : (
        order && (
          <div className="mt-7 grid items-start gap-6 lg:grid-cols-2">
            <section className="rounded-2xl border border-line bg-white p-5 sm:p-7">
              <OrderSummary order={order} />
              {order.paymentStatus === "pending" && (
                <>
                  <p className="mt-6 text-sm text-muted">
                    Checkout prices are valid until{" "}
                    {new Date(order.expiresAt).toLocaleTimeString("en-IN")}.
                    Availability is checked on payment confirmation.
                  </p>
                  <Button
                    className="mt-4"
                    disabled={
                      action.busy || new Date(order.expiresAt) <= new Date()
                    }
                    onClick={pay}
                  >
                    {action.busy
                      ? "Checking payment…"
                      : "Pay with Razorpay (test)"}
                  </Button>
                </>
              )}
              {order.paymentStatus === "refund_pending" && (
                <Feedback
                  error
                  message="This order could not be fulfilled. A test refund is being reconciled. You will not receive a shipment."
                />
              )}
              {order.paymentStatus === "refunded" && (
                <Feedback message="Your test payment has been refunded." />
              )}
              <div className="mt-4 flex flex-wrap gap-3">
                <Button secondary disabled={action.busy} onClick={refresh}>
                  Check payment status
                </Button>
                {order.paymentStatus === "paid" && (
                  <Button
                    secondary
                    disabled={action.busy}
                    onClick={() =>
                      action.run((options) =>
                        downloadInvoice(order.id, options),
                      )
                    }
                  >
                    Download PDF invoice
                  </Button>
                )}
              </div>
            </section>
            <div className="space-y-4">
              {order.paymentStatus === "paid" ? (
                order.shipments.map((shipment) => (
                  <ShipmentCard
                    key={shipment.vendorId}
                    orderId={order.id}
                    shipment={shipment}
                  />
                ))
              ) : (
                <p className="rounded-xl border border-line p-5 text-sm text-muted">
                  Shipment tracking will appear after payment is confirmed.
                </p>
              )}
            </div>
          </div>
        )
      )}
    </MarketplaceLayout>
  );
};
const OrderDetailsPage = () => {
  const { orderId } = useParams();
  const { user } = useAuth();
  return <OrderDetails key={`${user.id}:${orderId}`} orderId={orderId} />;
};
export { OrderDetailsPage };
