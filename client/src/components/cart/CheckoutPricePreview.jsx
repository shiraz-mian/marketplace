import { useCallback, useState } from "react";
import { Button, Feedback, Loading } from "../marketplace/ui.jsx";
import { useResource } from "../../hooks/useResource.js";
import { previewCheckout } from "../../services/commerceService.js";
import { formatPrice } from "../../utils/productPrice.js";

const CheckoutPricePreview = ({ cartVersion, couponCode }) => {
  const normalizedCode = couponCode.trim().toUpperCase();
  const [appliedCode, setAppliedCode] = useState("");
  const loader = useCallback(
    (signal) =>
      previewCheckout({ cartVersion, couponCode: appliedCode }, { signal }),
    [cartVersion, appliedCode],
  );
  const resource = useResource(loader);
  const current = normalizedCode === appliedCode;
  const quote = current ? resource.data : null;
  const checkTotal = () => {
    if (current) resource.reload();
    else setAppliedCode(normalizedCode);
  };
  return (
    <section
      aria-label="Checkout price preview"
      className="mt-6 border-t border-line pt-5"
    >
      <h3 className="font-semibold">Price preview</h3>
      {current && resource.loading ? (
        <Loading />
      ) : (
        quote && (
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between gap-3">
              <dt>Subtotal</dt>
              <dd>{formatPrice(quote.subtotalInPaise)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt>
                Discount{quote.couponCode ? ` (${quote.couponCode})` : ""}
              </dt>
              <dd>−{formatPrice(quote.discountInPaise)}</dd>
            </div>
            <div className="flex justify-between gap-3 border-t border-line pt-3 text-xl font-bold">
              <dt>Total</dt>
              <dd>{formatPrice(quote.totalInPaise)}</dd>
            </div>
          </dl>
        )
      )}
      {current && <Feedback message={resource.error} error />}
      {!current && (
        <p className="mt-3 text-sm text-muted">
          Check the total to apply your latest coupon code.
        </p>
      )}
      <Button
        type="button"
        secondary
        className="mt-4 w-full"
        disabled={current && resource.loading}
        onClick={checkTotal}
      >
        Check total
      </Button>
      <p className="mt-3 text-xs leading-relaxed text-muted">
        Previewing creates no order and reserves no stock. Prices and coupons
        are checked again when you create the order.
      </p>
    </section>
  );
};
export { CheckoutPricePreview };
