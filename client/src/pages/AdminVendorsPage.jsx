import { useCallback, useRef, useState } from "react";
import { MarketplaceLayout } from "../components/marketplace/MarketplaceLayout.jsx";
import {
  Button,
  EmptyState,
  Feedback,
  Loading,
  Pagination,
  StatusBadge,
} from "../components/marketplace/ui.jsx";
import { INPUT_CLASSES, LABEL_CLASSES } from "../components/auth/authStyles.js";
import { useResource } from "../hooks/useResource.js";
import {
  listVendorApplications,
  reviewVendorApplication,
} from "../services/marketplaceService.js";
import { getMarketplaceError } from "../utils/getMarketplaceError.js";
import { VendorPaymentAccount } from "../components/marketplace/VendorPaymentAccount.jsx";

const AdminVendorsPage = () => {
  const [status, setStatus] = useState("pending");
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(null);
  const [feedback, setFeedback] = useState({ message: "", error: false });
  const pending = useRef(false);
  const loader = useCallback(
    (signal) => listVendorApplications({ status, page, limit: 10 }, { signal }),
    [status, page],
  );
  const resource = useResource(loader);
  const decide = async (vendor, decision) => {
    if (pending.current) return;
    pending.current = true;
    setBusy(vendor.id);
    setFeedback({ message: "", error: false });
    try {
      await reviewVendorApplication(vendor.id, decision);
      setFeedback({
        message: `${vendor.storeName}: application ${decision}.`,
        error: false,
      });
      setPage(1);
      resource.reload();
    } catch (error) {
      setFeedback({ message: getMarketplaceError(error), error: true });
    } finally {
      pending.current = false;
      setBusy(null);
    }
  };
  return (
    <MarketplaceLayout>
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="text-xs font-semibold tracking-widest text-accent uppercase">
            Administration
          </p>
          <h1 className="mt-3 text-3xl font-bold">Vendor applications</h1>
        </div>
        <div>
          <label className={LABEL_CLASSES} htmlFor="application-filter">
            Application status
          </label>
          <select
            id="application-filter"
            className={INPUT_CLASSES}
            value={status}
            disabled={Boolean(busy)}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
          >
            {["pending", "approved", "rejected"].map((item) => (
              <option key={item} value={item}>
                {item[0].toUpperCase() + item.slice(1)}
              </option>
            ))}
          </select>
        </div>
      </div>
      <Feedback {...feedback} />
      <Feedback message={resource.error} error />
      <Button
        secondary
        className="mt-5"
        disabled={resource.loading || Boolean(busy)}
        onClick={resource.reload}
      >
        Refresh applications
      </Button>
      {resource.loading ? (
        <Loading />
      ) : resource.data?.vendors.length ? (
        <div className="mt-6 space-y-5">
          {resource.data.vendors.map((vendor) => (
            <article
              key={vendor.id}
              className="rounded-2xl border border-line bg-white p-6"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-xl font-semibold">{vendor.storeName}</h2>
                <StatusBadge status={vendor.status} />
              </div>
              <p className="mt-3 max-w-3xl leading-relaxed whitespace-pre-line text-muted">
                {vendor.description}
              </p>
              {vendor.reviewedAt && (
                <p className="mt-4 text-xs text-muted">
                  Reviewed {new Date(vendor.reviewedAt).toLocaleString("en-IN")}
                </p>
              )}
              {vendor.status === "approved" && (
                <VendorPaymentAccount vendorId={vendor.id} />
              )}
              {vendor.status === "pending" && (
                <div className="mt-5 flex flex-wrap gap-3">
                  <Button
                    disabled={Boolean(busy)}
                    onClick={() => decide(vendor, "approved")}
                  >
                    {busy === vendor.id
                      ? "Saving decision…"
                      : `Approve ${vendor.storeName}`}
                  </Button>
                  <Button
                    secondary
                    disabled={Boolean(busy)}
                    onClick={() => decide(vendor, "rejected")}
                  >
                    Reject {vendor.storeName}
                  </Button>
                </div>
              )}
            </article>
          ))}
        </div>
      ) : (
        !resource.error && (
          <div className="mt-6">
            <EmptyState title="No applications here">
              There are no {status} applications on this page.
            </EmptyState>
          </div>
        )
      )}
      <Pagination
        pagination={resource.data?.pagination}
        onPageChange={setPage}
        busy={resource.loading || Boolean(busy)}
      />
    </MarketplaceLayout>
  );
};

export { AdminVendorsPage };
