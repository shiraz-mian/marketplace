import { Link } from "react-router";
import { formatPrice } from "../../utils/productPrice.js";
import { StatusBadge } from "../marketplace/ui.jsx";
const OrderSummary = ({ order }) => (
  <div className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div>
        <p className="text-sm font-medium break-all text-ink">
          Order ID: {order.id}
        </p>
        <p className="mt-2 text-sm text-muted">
          {new Date(order.createdAt).toLocaleString("en-IN")}
        </p>
      </div>
      <StatusBadge status={order.status} />
    </div>
    <ul className="divide-y divide-line">
      {order.lines.map((line) => (
        <li key={line.productId} className="flex justify-between gap-4 py-4">
          <div>
            <Link
              to={`/products/${line.productId}`}
              className="font-semibold text-brand underline"
            >
              {line.title}
            </Link>
            <p className="mt-1 text-sm text-muted">
              {line.storeName} · {line.quantity} ×{" "}
              {formatPrice(line.unitPriceInPaise)}
            </p>
          </div>
          <span className="shrink-0 text-sm">
            {formatPrice(line.totalInPaise)}
          </span>
        </li>
      ))}
    </ul>
    <dl className="space-y-3 border-t border-line pt-4">
      <div className="flex justify-between gap-3">
        <dt>Subtotal</dt>
        <dd>{formatPrice(order.subtotalInPaise)}</dd>
      </div>
      <div className="flex justify-between gap-3">
        <dt>Discount {order.couponCode && `(${order.couponCode})`}</dt>
        <dd>−{formatPrice(order.discountInPaise)}</dd>
      </div>
      <div className="flex justify-between gap-3 text-xl font-bold">
        <dt>Total</dt>
        <dd>{formatPrice(order.totalInPaise)}</dd>
      </div>
    </dl>
    <div>
      <h3 className="font-semibold">Delivery address</h3>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        {order.address.name}
        <br />
        {order.address.line1} {order.address.line2}
        <br />
        {order.address.city}, {order.address.state} {order.address.postalCode}
        <br />
        {order.address.phone}
      </p>
    </div>
  </div>
);
export { OrderSummary };
