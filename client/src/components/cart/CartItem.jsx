import { useState } from "react";
import { Link } from "react-router";
import { Button, ProductImage } from "../marketplace/ui.jsx";
import { QuantityInput } from "./QuantityInput.jsx";
import {
  MAX_CART_QUANTITY,
  parseCartQuantity,
} from "../../utils/cartQuantity.js";
import { formatPrice } from "../../utils/productPrice.js";

const CartItem = ({ item, index, busy, onUpdate, onRemove }) => {
  const [quantity, setQuantity] = useState(String(item.quantity));
  const [error, setError] = useState("");
  const product = item.product;
  const title = product?.title || `Unavailable item ${index + 1}`;
  const limit = Math.min(product?.stock ?? 0, MAX_CART_QUANTITY);
  const submit = (event) => {
    event.preventDefault();
    const parsed = parseCartQuantity(quantity, product?.stock ?? 0);
    if (parsed === null) {
      setError(`Choose a quantity from 1 to ${limit}.`);
      return;
    }
    setError("");
    void onUpdate(item.productId, parsed);
  };
  return (
    <article
      className="rounded-2xl border border-line bg-white p-4 sm:p-5"
      aria-label={title}
    >
      <div className="grid gap-4 sm:grid-cols-[140px_1fr]">
        <ProductImage src={product?.imageUrl} title={title} />
        <div className="min-w-0">
          {product ? (
            <Link
              to={`/products/${item.productId}`}
              className="rounded text-lg font-semibold text-brand underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-brand"
            >
              {title}
            </Link>
          ) : (
            <h2 className="text-lg font-semibold">{title}</h2>
          )}
          {product && (
            <p className="mt-1 text-xs text-muted">
              Sold by {product.storeName}
            </p>
          )}
          {product && (
            <p className="mt-3 text-base font-semibold">
              {formatPrice(product.priceInPaise)} each
            </p>
          )}
          {item.issue && (
            <p className="mt-3 text-sm leading-relaxed text-danger">
              {!product
                ? "This product is no longer available. Remove it from your cart."
                : product.stock < 1
                  ? "This product is out of stock. You can remove it or check again later."
                  : `Only ${product.stock} available. Reduce the quantity to continue.`}
            </p>
          )}
          <form
            onSubmit={submit}
            noValidate
            className="mt-4 flex flex-wrap items-end gap-3"
          >
            {product && limit > 0 ? (
              <>
                <QuantityInput
                  id={`cart-quantity-${item.productId}`}
                  label={`Quantity for ${title}`}
                  value={quantity}
                  onChange={(value) => {
                    setQuantity(value);
                    setError("");
                  }}
                  max={limit}
                  disabled={busy}
                  error={error}
                />
                <Button
                  secondary
                  type="submit"
                  disabled={busy || quantity === String(item.quantity)}
                >
                  Update
                </Button>
              </>
            ) : (
              <p className="text-sm text-muted">Quantity: {item.quantity}</p>
            )}
            <button
              type="button"
              disabled={busy}
              onClick={() => onRemove(item.productId)}
              aria-label={`Remove ${title}`}
              className="min-h-11 rounded px-2 text-sm font-semibold text-danger underline underline-offset-4 disabled:opacity-50"
            >
              Remove
            </button>
          </form>
          <p className="mt-4 text-sm text-muted">
            Item total:{" "}
            <span className="font-semibold text-ink">
              {item.lineTotalInPaise === null
                ? "Unavailable"
                : formatPrice(item.lineTotalInPaise)}
            </span>
          </p>
        </div>
      </div>
    </article>
  );
};

export { CartItem };
