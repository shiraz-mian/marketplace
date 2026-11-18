import { useState } from "react";
import { Link } from "react-router";
import { MarketplaceLayout } from "../components/marketplace/MarketplaceLayout.jsx";
import {
  Button,
  EmptyState,
  Feedback,
  Loading,
} from "../components/marketplace/ui.jsx";
import { CartItem } from "../components/cart/CartItem.jsx";
import { CartSummary } from "../components/cart/CartSummary.jsx";
import { useAuth } from "../hooks/useAuth.js";
import { useCart } from "../hooks/useCart.js";
import {
  updateCartItem,
  removeCartItem,
  clearCart,
} from "../services/cartService.js";

const CartContents = () => {
  const cart = useCart();
  const [confirmClear, setConfirmClear] = useState(false);
  const busy = Boolean(cart.busy) || cart.loading;
  const update = (id, quantity) =>
    cart.mutate(
      id,
      (version, options) => updateCartItem(id, quantity, version, options),
      "Quantity updated.",
    );
  const remove = (id) =>
    cart.mutate(
      id,
      (version, options) => removeCartItem(id, version, options),
      "Item removed from your cart.",
    );
  const empty = async () => {
    const done = await cart.mutate(
      "clear",
      clearCart,
      "Your cart has been cleared.",
    );
    if (done) setConfirmClear(false);
  };
  return (
    <MarketplaceLayout title="Your cart | Marketplace">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold tracking-widest text-accent uppercase">
            Your next finds
          </p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight">Your cart</h1>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            Review items from all your favorite stores in one place.
          </p>
        </div>
        <Link
          to="/"
          className="inline-flex min-h-11 items-center rounded px-2 text-sm font-semibold text-brand underline underline-offset-4"
        >
          Continue shopping
        </Link>
      </div>
      <Feedback message={cart.feedback.message} error={cart.feedback.error} />
      <Feedback message={cart.error} error />
      {cart.error && (
        <Button secondary onClick={cart.reload}>
          Try again
        </Button>
      )}
      {cart.loading ? (
        <Loading />
      ) : (
        cart.data &&
        (cart.data.items.length ? (
          <>
            <div className="my-6 flex flex-wrap items-center justify-between gap-3">
              <p aria-live="polite" className="text-sm text-muted">
                {cart.data.summary.itemCount}{" "}
                {cart.data.summary.itemCount === 1 ? "item" : "items"} in your
                cart
              </p>
              <div className="flex gap-2">
                <Button secondary disabled={busy} onClick={cart.reload}>
                  Refresh cart
                </Button>
                <Button
                  secondary
                  disabled={busy}
                  onClick={() => setConfirmClear(true)}
                >
                  Clear cart
                </Button>
              </div>
            </div>
            {confirmClear && (
              <div
                role="group"
                aria-label="Clear cart confirmation"
                className="mb-6 rounded-xl border border-line bg-white p-4"
              >
                <p className="text-sm font-semibold">
                  Remove all items from your cart?
                </p>
                <div className="mt-3 flex flex-wrap gap-3">
                  <Button disabled={busy} onClick={empty}>
                    Clear all items
                  </Button>
                  <Button
                    secondary
                    disabled={busy}
                    onClick={() => setConfirmClear(false)}
                  >
                    Keep items
                  </Button>
                </div>
              </div>
            )}
            <div
              className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]"
              aria-busy={Boolean(cart.busy)}
            >
              <div className="space-y-4">
                {cart.data.items.map((item, index) => (
                  <CartItem
                    key={`${item.productId}:${item.quantity}:${item.product?.stock ?? 0}`}
                    item={item}
                    index={index}
                    busy={busy}
                    onUpdate={update}
                    onRemove={remove}
                  />
                ))}
              </div>
              <CartSummary cart={cart.data} />
            </div>
          </>
        ) : (
          <div className="mt-8">
            <EmptyState title="Your cart is empty">
              <p>Find something you love and add it to your cart.</p>
              <div className="mt-5 flex flex-wrap justify-center gap-3">
                <Link
                  to="/"
                  className="inline-flex min-h-11 items-center rounded-lg bg-brand px-5 py-3 font-semibold text-white"
                >
                  Explore products
                </Link>
                <Button secondary disabled={busy} onClick={cart.reload}>
                  Refresh cart
                </Button>
              </div>
            </EmptyState>
          </div>
        ))
      )}
    </MarketplaceLayout>
  );
};

const CartPage = () => {
  const { user } = useAuth();
  return <CartContents key={user.id} />;
};

export { CartPage };
