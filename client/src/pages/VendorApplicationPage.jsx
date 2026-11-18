import { useCallback, useRef, useState } from "react";
import { Link } from "react-router";
import { MarketplaceLayout } from "../components/marketplace/MarketplaceLayout.jsx";
import {
  Button,
  Feedback,
  Loading,
  StatusBadge,
} from "../components/marketplace/ui.jsx";
import { INPUT_CLASSES, LABEL_CLASSES } from "../components/auth/authStyles.js";
import { useResource } from "../hooks/useResource.js";
import { useAuth } from "../hooks/useAuth.js";
import {
  applyForVendor,
  getMyApplication,
} from "../services/marketplaceService.js";
import { getMarketplaceError } from "../utils/getMarketplaceError.js";

const VendorApplicationPage = () => {
  const { reloadUser } = useAuth();
  const loader = useCallback((signal) => getMyApplication({ signal }), []);
  const resource = useResource(loader);
  const [values, setValues] = useState({ storeName: "", description: "" });
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState({ message: "", error: false });
  const pending = useRef(false);
  const submit = async (event) => {
    event.preventDefault();
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setFeedback({ message: "", error: false });
    try {
      const application = await applyForVendor(values);
      resource.replaceData(application);
      setFeedback({
        message: "Your application has been sent for review.",
        error: false,
      });
    } catch (error) {
      setFeedback({ message: getMarketplaceError(error), error: true });
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  const refresh = async () => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    try {
      await reloadUser();
      resource.reload();
      setFeedback({ message: "", error: false });
    } catch (error) {
      setFeedback({ message: getMarketplaceError(error), error: true });
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  const change = (event) =>
    setValues((current) => ({
      ...current,
      [event.target.name]: event.target.value,
    }));
  return (
    <MarketplaceLayout title="My store | Marketplace">
      <div className="max-w-2xl">
        <p className="text-xs font-semibold tracking-widest text-accent uppercase">
          Grow with Marketplace
        </p>
        <h1 className="mt-3 text-3xl font-bold">Your store starts here</h1>
        <p className="mt-3 leading-relaxed text-muted">
          Tell us about your store. You can manage products once your
          application is approved.
        </p>
        <Feedback {...feedback} />
        <Feedback message={resource.error} error />
        {resource.loading ? (
          <Loading />
        ) : resource.data ? (
          <section className="mt-7 rounded-2xl border border-line bg-white p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-semibold">
                {resource.data.storeName}
              </h2>
              <StatusBadge status={resource.data.status} />
            </div>
            <p className="mt-4 leading-relaxed whitespace-pre-line text-muted">
              {resource.data.description}
            </p>
            <p className="mt-5 text-sm text-muted">
              {resource.data.status === "pending"
                ? "Your application is awaiting review."
                : resource.data.status === "approved"
                  ? "Your store is approved. You can start adding products."
                  : "Your application was not approved."}
            </p>
            {resource.data.status === "approved" && (
              <Link
                className="mt-5 inline-block rounded-lg bg-brand px-4 py-3 text-sm font-semibold text-white"
                to="/vendor/products"
              >
                Manage products
              </Link>
            )}
          </section>
        ) : (
          !resource.error && (
            <form
              onSubmit={submit}
              className="mt-7 rounded-2xl border border-line bg-white p-6"
            >
              <fieldset disabled={busy} className="space-y-5">
                <legend className="sr-only">Store application</legend>
                <div>
                  <label htmlFor="store-name" className={LABEL_CLASSES}>
                    Store name
                  </label>
                  <input
                    className={INPUT_CLASSES}
                    id="store-name"
                    name="storeName"
                    value={values.storeName}
                    onChange={change}
                    required
                    minLength={2}
                    maxLength={100}
                    autoComplete="organization"
                  />
                </div>
                <div>
                  <label htmlFor="store-description" className={LABEL_CLASSES}>
                    About your store
                  </label>
                  <textarea
                    className={INPUT_CLASSES}
                    id="store-description"
                    name="description"
                    value={values.description}
                    onChange={change}
                    required
                    minLength={20}
                    maxLength={1000}
                    rows={5}
                  />
                  <p className="mt-2 text-xs text-muted">
                    20–1000 characters. Describe what you plan to sell.
                  </p>
                </div>
                <Button type="submit" disabled={busy}>
                  {busy ? "Submitting…" : "Submit application"}
                </Button>
              </fieldset>
            </form>
          )
        )}
        <Button
          secondary
          className="mt-5"
          disabled={busy || resource.loading}
          onClick={refresh}
        >
          Check application status
        </Button>
      </div>
    </MarketplaceLayout>
  );
};

export { VendorApplicationPage };
