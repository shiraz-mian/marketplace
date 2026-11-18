import { useCallback, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { MarketplaceLayout } from "../components/marketplace/MarketplaceLayout.jsx";
import { Button, Feedback, Loading } from "../components/marketplace/ui.jsx";
import { INPUT_CLASSES, LABEL_CLASSES } from "../components/auth/authStyles.js";
import { useResource } from "../hooks/useResource.js";
import { useAction } from "../hooks/useAction.js";
import { useAuth } from "../hooks/useAuth.js";
import { getCart } from "../services/cartService.js";
import { createCheckout } from "../services/commerceService.js";
import { CheckoutPricePreview } from "../components/cart/CheckoutPricePreview.jsx";
const fields = [
  ["name", "Full name", "name"],
  ["phone", "Mobile number", "tel"],
  ["line1", "Address line 1", "address-line1"],
  ["line2", "Address line 2 (optional)", "address-line2"],
  ["city", "City", "address-level2"],
  ["state", "State", "address-level1"],
  ["postalCode", "PIN code", "postal-code"],
];
const CheckoutForm = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const loader = useCallback((signal) => getCart({ signal }), []);
  const resource = useResource(loader);
  const action = useAction();
  const request = useRef(null);
  const [values, setValues] = useState({
    name: user.name,
    phone: "",
    line1: "",
    line2: "",
    city: "",
    state: "",
    postalCode: "",
  });
  const [couponCode, setCouponCode] = useState("");
  const submit = async (event) => {
    event.preventDefault();
    if (!resource.data || resource.data.summary.hasIssues) return;
    const input = {
      address: { ...values, country: "IN" },
      couponCode: couponCode.trim().toUpperCase(),
      cartVersion: resource.data.version,
    };
    const fingerprint = JSON.stringify(input);
    if (request.current?.fingerprint !== fingerprint)
      request.current = { fingerprint, id: crypto.randomUUID() };
    const order = await action.run((options) =>
      createCheckout(input, request.current.id, options),
    );
    if (order) navigate(`/orders/${order.id}`);
  };
  return (
    <MarketplaceLayout title="Checkout | Marketplace">
      <Link to="/cart" className="text-sm text-brand underline">
        Back to cart
      </Link>
      <h1 className="mt-5 text-3xl font-bold">Checkout</h1>
      <p className="mt-3 text-sm text-muted">
        Razorpay test mode. No real money is charged. Stock is checked when
        payment is confirmed.
      </p>
      <Feedback message={resource.error} error />
      <Feedback {...action.feedback} />
      {resource.error && (
        <Button onClick={resource.reload} secondary>
          Refresh cart
        </Button>
      )}
      {resource.loading ? (
        <Loading />
      ) : (
        resource.data && (
          <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
            <form
              onSubmit={submit}
              className="rounded-2xl border border-line bg-white p-5 sm:p-7"
            >
              <fieldset
                disabled={
                  action.busy ||
                  !resource.data.items.length ||
                  resource.data.summary.hasIssues
                }
              >
                <legend className="text-xl font-semibold">
                  Delivery address
                </legend>
                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  {fields.map(([name, label, autoComplete]) => (
                    <div
                      key={name}
                      className={name.startsWith("line") ? "sm:col-span-2" : ""}
                    >
                      <label
                        htmlFor={`checkout-${name}`}
                        className={LABEL_CLASSES}
                      >
                        {label}
                      </label>
                      <input
                        id={`checkout-${name}`}
                        name={name}
                        value={values[name]}
                        onChange={(e) =>
                          setValues((v) => ({ ...v, [name]: e.target.value }))
                        }
                        className={INPUT_CLASSES}
                        required={name !== "line2"}
                        autoComplete={autoComplete}
                        maxLength={
                          name === "phone"
                            ? 10
                            : name === "postalCode"
                              ? 6
                              : 180
                        }
                        pattern={
                          name === "phone"
                            ? "[6-9][0-9]{9}"
                            : name === "postalCode"
                              ? "[1-9][0-9]{5}"
                              : undefined
                        }
                      />
                    </div>
                  ))}
                </div>
                <label
                  htmlFor="coupon-code"
                  className={`${LABEL_CLASSES} mt-5`}
                >
                  Coupon code (optional)
                </label>
                <input
                  id="coupon-code"
                  value={couponCode}
                  onChange={(e) => setCouponCode(e.target.value)}
                  maxLength={30}
                  className={INPUT_CLASSES}
                />
                <p className="mt-2 text-xs text-muted">
                  Use Check total to verify your coupon and discount before
                  creating an order.
                </p>
                <Button type="submit" className="mt-6" disabled={action.busy}>
                  {action.busy ? "Preparing…" : "Review order"}
                </Button>
              </fieldset>
            </form>
            <aside className="h-fit rounded-2xl border border-line bg-white p-6">
              <h2 className="text-xl font-semibold">Your items</h2>
              {resource.data.items.map((item) => (
                <p key={item.productId} className="mt-4 text-sm">
                  {item.quantity} × {item.product?.title || "Unavailable item"}
                </p>
              ))}
              {resource.data.items.length > 0 &&
                !resource.data.summary.hasIssues && (
                  <CheckoutPricePreview
                    cartVersion={resource.data.version}
                    couponCode={couponCode}
                  />
                )}
              {(!resource.data.items.length ||
                resource.data.summary.hasIssues) && (
                <Feedback
                  message="Review your cart items before checkout."
                  error
                />
              )}
            </aside>
          </div>
        )
      )}
    </MarketplaceLayout>
  );
};
const CheckoutPage = () => {
  const { user } = useAuth();
  return <CheckoutForm key={user.id} />;
};
export { CheckoutPage };
