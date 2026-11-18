import { useEffect, useRef, useState } from "react";
import { isCancel } from "axios";
import { Link, useLocation } from "react-router";
import { useAuth } from "../../hooks/useAuth.js";
import { addCartItem } from "../../services/cartService.js";
import { getMarketplaceError } from "../../utils/getMarketplaceError.js";
import {
  MAX_CART_QUANTITY,
  parseCartQuantity,
} from "../../utils/cartQuantity.js";
import { Button, Feedback } from "../marketplace/ui.jsx";
import { QuantityInput } from "./QuantityInput.jsx";

const AddToCartForm = ({ product }) => {
  const [quantity, setQuantity] = useState("1");
  const [quantityError, setQuantityError] = useState("");
  const [feedback, setFeedback] = useState({ message: "", error: false });
  const [busy, setBusy] = useState(false);
  const pending = useRef(null);
  const attempt = useRef(null);
  const mounted = useRef(false);
  const limit = Math.min(product.stock, MAX_CART_QUANTITY);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      pending.current?.abort();
    };
  }, []);
  const submit = async (event) => {
    event.preventDefault();
    if (pending.current) return;
    const parsed = parseCartQuantity(quantity, product.stock);
    if (parsed === null) {
      setQuantityError(`Choose a quantity from 1 to ${limit}.`);
      return;
    }
    const controller = new AbortController();
    pending.current = controller;
    if (!attempt.current || attempt.current.quantity !== parsed) {
      attempt.current = { quantity: parsed, id: crypto.randomUUID() };
    }
    setBusy(true);
    setQuantityError("");
    setFeedback({ message: "", error: false });
    try {
      await addCartItem(product.id, parsed, attempt.current.id, {
        signal: controller.signal,
      });
      if (mounted.current) {
        attempt.current = null;
        setFeedback({
          message: `${product.title} added to your cart.`,
          error: false,
        });
      }
    } catch (error) {
      if (mounted.current && !isCancel(error))
        setFeedback({ message: getMarketplaceError(error), error: true });
    } finally {
      pending.current = null;
      if (mounted.current) setBusy(false);
    }
  };
  return (
    <form
      onSubmit={submit}
      noValidate
      className="mt-7 border-t border-line pt-6"
      aria-busy={busy}
    >
      <div className="flex flex-wrap items-end gap-3">
        <QuantityInput
          id={`add-quantity-${product.id}`}
          label="Quantity"
          value={quantity}
          onChange={(value) => {
            setQuantity(value);
            setQuantityError("");
          }}
          max={limit}
          disabled={busy}
          error={quantityError}
        />
        <Button type="submit" disabled={busy}>
          {busy ? "Adding…" : "Add to cart"}
        </Button>
        <Link
          to="/cart"
          className="inline-flex min-h-11 items-center rounded px-2 text-sm font-semibold text-brand underline underline-offset-4"
        >
          View cart
        </Link>
      </div>
      <Feedback message={feedback.message} error={feedback.error} />
    </form>
  );
};

const AddToCart = ({ product }) => {
  const { user, status } = useAuth();
  const location = useLocation();
  if (product.stock < 1)
    return (
      <p className="mt-7 text-sm font-semibold text-danger">
        This product is currently out of stock.
      </p>
    );
  if (["checking", "signingOut"].includes(status))
    return (
      <Button className="mt-7" disabled>
        Checking account…
      </Button>
    );
  if (!user)
    return (
      <Link
        to="/login"
        state={{
          from: location.pathname,
          catalogSearch: location.state?.catalogSearch,
        }}
        className="mt-7 inline-flex min-h-11 items-center rounded-lg bg-brand px-5 py-3 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        Sign in to add to cart
      </Link>
    );
  return <AddToCartForm key={`${user.id}:${product.id}`} product={product} />;
};

export { AddToCart };
