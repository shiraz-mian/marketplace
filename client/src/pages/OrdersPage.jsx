import { useCallback, useState } from "react";
import { Link } from "react-router";
import { MarketplaceLayout } from "../components/marketplace/MarketplaceLayout.jsx";
import {
  Button,
  EmptyState,
  Feedback,
  Loading,
  Pagination,
} from "../components/marketplace/ui.jsx";
import { OrderSummary } from "../components/orders/OrderSummary.jsx";
import { ShipmentCard } from "../components/orders/ShipmentCard.jsx";
import { useResource } from "../hooks/useResource.js";
import { useAction } from "../hooks/useAction.js";
import { useAuth } from "../hooks/useAuth.js";
import { listOrders, refreshOrder } from "../services/commerceService.js";
const OrdersContents = ({ mode }) => {
  const [page, setPage] = useState(1);
  const loader = useCallback(
    (signal) => listOrders(mode, page, { signal }),
    [mode, page],
  );
  const resource = useResource(loader);
  const action = useAction();
  const refresh = async (id) => {
    if (
      await action.run(
        (options) => refreshOrder(id, "admin", options),
        "Payment reconciled.",
      )
    )
      resource.reload();
  };
  return (
    <MarketplaceLayout title="Orders | Marketplace">
      <div className="flex flex-wrap justify-between gap-4">
        <h1 className="text-3xl font-bold">
          {mode === "vendor"
            ? "Store orders"
            : mode === "admin"
              ? "All orders"
              : "Your orders"}
        </h1>
        <Button
          secondary
          disabled={resource.loading || action.busy}
          onClick={resource.reload}
        >
          Refresh orders
        </Button>
      </div>
      <Feedback message={resource.error} error />
      <Feedback {...action.feedback} />
      {resource.loading ? (
        <Loading />
      ) : resource.data?.orders.length ? (
        <div className="mt-7 space-y-6">
          {resource.data.orders.map((order) => (
            <article
              key={order.id}
              className="rounded-2xl border border-line bg-white p-5 sm:p-7"
            >
              <OrderSummary order={order} />
              {mode === "customer" && (
                <Link
                  to={`/orders/${order.id}`}
                  className="mt-5 inline-block rounded-lg bg-brand px-4 py-3 text-sm font-semibold text-white"
                >
                  View order
                </Link>
              )}
              {mode === "vendor" && (
                <div className="mt-6 space-y-4">
                  {order.shipments.map((s) => (
                    <ShipmentCard
                      key={s.vendorId}
                      orderId={order.id}
                      shipment={s}
                      editable
                      onUpdate={resource.reload}
                    />
                  ))}
                </div>
              )}
              {mode === "admin" && (
                <>
                  <p className="mt-4 text-sm text-muted">
                    Commission: {order.commissionInPaise / 100} INR
                  </p>
                  {order.paymentFlow === "standard" && (
                    <p className="mt-2 text-xs text-muted">
                      Vendor shares are recorded for accounting. No automatic
                      vendor transfers are requested for this order.
                    </p>
                  )}
                  <Button
                    className="mt-4"
                    secondary
                    disabled={action.busy}
                    onClick={() => refresh(order.id)}
                  >
                    Reconcile payment
                  </Button>
                </>
              )}
            </article>
          ))}
        </div>
      ) : (
        !resource.error && (
          <div className="mt-7">
            <EmptyState title="No orders yet">
              {mode === "customer" ? (
                <Link to="/" className="text-brand underline">
                  Explore the shop
                </Link>
              ) : (
                "Orders will appear here when payments are confirmed."
              )}
            </EmptyState>
          </div>
        )
      )}
      <Pagination
        pagination={resource.data?.pagination}
        onPageChange={setPage}
        busy={resource.loading || action.busy}
      />
    </MarketplaceLayout>
  );
};
const OrdersPage = ({ mode = "customer" }) => {
  const { user } = useAuth();
  return <OrdersContents key={`${user.id}:${mode}`} mode={mode} />;
};
export { OrdersPage };
