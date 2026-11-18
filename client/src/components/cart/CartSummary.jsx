import { formatPrice } from "../../utils/productPrice.js";
import { Link } from "react-router";

const CartSummary = ({ cart }) => (
  <aside
    aria-label="Cart summary"
    className="h-fit rounded-2xl border border-line bg-white p-6 lg:sticky lg:top-6"
  >
    <h2 className="text-xl font-semibold">Cart summary</h2>
    <div className="mt-6 flex items-center justify-between gap-4 text-sm">
      <span className="text-muted">Items in cart</span>
      <span>{cart.summary.itemCount}</span>
    </div>
    <div className="mt-5 border-t border-line pt-5">
      <p className="text-sm text-muted">
        {cart.summary.hasIssues ? "Available items subtotal" : "Subtotal"}
      </p>
      <p className="mt-2 text-3xl font-bold text-brand">
        {formatPrice(cart.summary.subtotalInPaise)}
      </p>
    </div>
    {cart.summary.hasIssues && (
      <p className="mt-4 text-sm leading-relaxed text-danger">
        Unavailable quantities are excluded from this subtotal. Review the
        highlighted items.
      </p>
    )}
    {!cart.summary.hasIssues && cart.items.length > 0 && (
      <Link
        to="/checkout"
        className="mt-6 flex min-h-11 items-center justify-center rounded-lg bg-brand px-4 py-3 text-sm font-semibold text-white"
      >
        Proceed to checkout
      </Link>
    )}
    <p className="mt-5 text-xs leading-relaxed text-muted">
      Adding items does not reserve stock. Prices and availability may change.
    </p>
    <p className="mt-3 text-xs leading-relaxed text-muted">
      Your cart is saved for 30 days after its last change.
    </p>
  </aside>
);

export { CartSummary };
