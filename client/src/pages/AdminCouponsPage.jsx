import { useCallback, useState } from "react";
import { MarketplaceLayout } from "../components/marketplace/MarketplaceLayout.jsx";
import {
  Button,
  Feedback,
  Loading,
  Pagination,
} from "../components/marketplace/ui.jsx";
import { INPUT_CLASSES, LABEL_CLASSES } from "../components/auth/authStyles.js";
import { useResource } from "../hooks/useResource.js";
import { useAction } from "../hooks/useAction.js";
import {
  listCoupons,
  createCoupon,
  toggleCoupon,
} from "../services/commerceService.js";
import { formatPrice } from "../utils/productPrice.js";
const CouponForm = ({ onSaved }) => {
  const action = useAction();
  const [kind, setKind] = useState("percent");
  const submit = async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const input = {
      code: values.get("code"),
      kind,
      value: Number(values.get("value")),
      minSubtotalInPaise: Number(values.get("minimum")),
      maxUses: Number(values.get("maxUses")),
      expiresAt: new Date(values.get("expiresAt")).toISOString(),
    };
    if (
      await action.run(
        (options) => createCoupon(input, options),
        "Coupon created.",
      )
    ) {
      form.reset();
      onSaved();
    }
  };
  return (
    <form
      onSubmit={submit}
      className="mt-6 rounded-xl border border-line bg-white p-5"
    >
      <h2 className="text-xl font-semibold">Create coupon</h2>
      <Feedback {...action.feedback} />
      <fieldset
        disabled={action.busy}
        className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
      >
        <div>
          <label className={LABEL_CLASSES} htmlFor="new-code">
            Code
          </label>
          <input
            id="new-code"
            name="code"
            pattern="[A-Za-z0-9_-]{3,30}"
            maxLength={30}
            required
            className={INPUT_CLASSES}
          />
        </div>
        <div>
          <label className={LABEL_CLASSES} htmlFor="coupon-kind">
            Type
          </label>
          <select
            id="coupon-kind"
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            className={INPUT_CLASSES}
          >
            <option value="percent">Percentage</option>
            <option value="fixed">Fixed amount</option>
          </select>
        </div>
        <div>
          <label className={LABEL_CLASSES} htmlFor="coupon-value">
            {kind === "percent"
              ? "Percentage (1–80)"
              : "Discount in paise (100 = ₹1)"}
          </label>
          <input
            id="coupon-value"
            name="value"
            type="number"
            min="1"
            max={kind === "percent" ? 80 : 100000000}
            step="1"
            required
            className={INPUT_CLASSES}
          />
        </div>
        <div>
          <label className={LABEL_CLASSES} htmlFor="coupon-minimum">
            Minimum spend in paise
          </label>
          <input
            id="coupon-minimum"
            name="minimum"
            type="number"
            min="0"
            max="100000000"
            step="1"
            defaultValue="0"
            required
            className={INPUT_CLASSES}
          />
        </div>
        <div>
          <label className={LABEL_CLASSES} htmlFor="coupon-uses">
            Maximum uses
          </label>
          <input
            id="coupon-uses"
            name="maxUses"
            type="number"
            min="1"
            max="1000000"
            defaultValue="100"
            required
            className={INPUT_CLASSES}
          />
        </div>
        <div>
          <label className={LABEL_CLASSES} htmlFor="coupon-expiry">
            Expiry (your local time)
          </label>
          <input
            id="coupon-expiry"
            name="expiresAt"
            type="datetime-local"
            required
            className={INPUT_CLASSES}
          />
        </div>
        <Button type="submit" disabled={action.busy}>
          {action.busy ? "Saving…" : "Create coupon"}
        </Button>
      </fieldset>
    </form>
  );
};
const AdminCouponsPage = () => {
  const [page, setPage] = useState(1);
  const loader = useCallback((signal) => listCoupons(page, { signal }), [page]);
  const resource = useResource(loader);
  const action = useAction();
  const toggle = async (c) => {
    if (
      await action.run(
        (options) => toggleCoupon(c.id, !c.active, options),
        "Coupon updated.",
      )
    )
      resource.reload();
  };
  return (
    <MarketplaceLayout title="Coupons | Marketplace">
      <h1 className="text-3xl font-bold">Coupons</h1>
      <CouponForm onSaved={resource.reload} />
      <Feedback {...action.feedback} />
      <Feedback message={resource.error} error />
      {resource.error && (
        <Button secondary onClick={resource.reload}>
          Refresh coupons
        </Button>
      )}
      {resource.loading ? (
        <Loading />
      ) : (
        <div className="mt-7 space-y-4">
          {resource.data?.coupons.map((c) => (
            <article
              key={c.id}
              className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-line bg-white p-5"
            >
              <div>
                <h2 className="font-bold">{c.code}</h2>
                <p className="mt-2 text-sm text-muted">
                  {c.kind === "percent"
                    ? `${c.value}% off`
                    : `${formatPrice(c.value)} off`}{" "}
                  · Minimum {formatPrice(c.minSubtotalInPaise)}
                </p>
                <p className="mt-1 text-xs text-muted">
                  Used {c.used} / {c.maxUses} · Expires{" "}
                  {new Date(c.expiresAt).toLocaleString("en-IN")} ·{" "}
                  {c.active ? "Enabled" : "Disabled"}
                </p>
              </div>
              <Button
                secondary
                disabled={action.busy}
                onClick={() => toggle(c)}
              >
                {c.active ? "Disable" : "Enable"} {c.code}
              </Button>
            </article>
          ))}
        </div>
      )}
      <Pagination
        pagination={resource.data?.pagination}
        onPageChange={setPage}
        busy={resource.loading || action.busy}
      />
    </MarketplaceLayout>
  );
};
export { AdminCouponsPage };
