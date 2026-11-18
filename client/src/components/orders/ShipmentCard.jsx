import { useState } from "react";
import { Button, Feedback, StatusBadge } from "../marketplace/ui.jsx";
import { INPUT_CLASSES, LABEL_CLASSES } from "../auth/authStyles.js";
import { useAction } from "../../hooks/useAction.js";
import { updateShipment } from "../../services/commerceService.js";
import { formatPrice } from "../../utils/productPrice.js";
const NEXT = { placed: "packed", packed: "shipped", shipped: "delivered" };
const ShipmentCard = ({ orderId, shipment, editable = false, onUpdate }) => {
  const action = useAction();
  const [trackingNumber, setTrackingNumber] = useState(
    shipment.trackingNumber || "",
  );
  const next = NEXT[shipment.status];
  const submit = async (e) => {
    e.preventDefault();
    const order = await action.run(
      (options) =>
        updateShipment(orderId, { status: next, trackingNumber }, options),
      "Shipment updated.",
    );
    if (order) onUpdate(order);
  };
  return (
    <section className="rounded-xl border border-line bg-canvas p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-semibold">{shipment.storeName}</h3>
        <StatusBadge status={shipment.status} />
      </div>
      {shipment.trackingNumber && (
        <p className="mt-3 break-words text-sm">
          Tracking: {shipment.trackingNumber}
        </p>
      )}
      <ol className="mt-4 flex flex-wrap gap-3 text-xs text-muted">
        {shipment.history.map((h) => (
          <li key={h.status} className="capitalize">
            {h.status} · {new Date(h.at).toLocaleDateString("en-IN")}
          </li>
        ))}
      </ol>
      {editable && (
        <>
          <p className="mt-4 text-sm">
            Your share:{" "}
            <strong>{formatPrice(shipment.vendorAmountInPaise)}</strong> ·
            Commission: {formatPrice(shipment.commissionInPaise)}
          </p>
          <p className="mt-2 text-xs text-muted">
            {shipment.transferStatus === "not_requested"
              ? "Vendor transfers are disabled. Your share is recorded for accounting only."
              : `Route transfer: ${shipment.transferStatus}`}
          </p>
        </>
      )}
      <Feedback {...action.feedback} />
      {editable && next && (
        <form onSubmit={submit} className="mt-4">
          <fieldset disabled={action.busy}>
            {next === "shipped" && (
              <div className="mb-3">
                <label
                  htmlFor={`tracking-${orderId}`}
                  className={LABEL_CLASSES}
                >
                  Tracking number
                </label>
                <input
                  id={`tracking-${orderId}`}
                  value={trackingNumber}
                  onChange={(e) => setTrackingNumber(e.target.value)}
                  className={INPUT_CLASSES}
                  minLength={3}
                  maxLength={100}
                  required
                />
              </div>
            )}
            <Button type="submit" disabled={action.busy}>
              {action.busy ? "Updating…" : `Mark ${next}`}
            </Button>
          </fieldset>
        </form>
      )}
    </section>
  );
};
export { ShipmentCard };
