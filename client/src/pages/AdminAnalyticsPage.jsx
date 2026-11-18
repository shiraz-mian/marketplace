import { useCallback } from "react";
import { Link } from "react-router";
import { MarketplaceLayout } from "../components/marketplace/MarketplaceLayout.jsx";
import { Button, Feedback, Loading } from "../components/marketplace/ui.jsx";
import { useResource } from "../hooks/useResource.js";
import { getAnalytics } from "../services/commerceService.js";
import { formatPrice } from "../utils/productPrice.js";
const AdminAnalyticsPage = () => {
  const loader = useCallback((signal) => getAnalytics({ signal }), []);
  const resource = useResource(loader);
  const a = resource.data;
  return (
    <MarketplaceLayout title="Admin analytics | Marketplace">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-bold">Marketplace analytics</h1>
        <Button secondary disabled={resource.loading} onClick={resource.reload}>
          Refresh analytics
        </Button>
      </div>
      <nav
        aria-label="Administration"
        className="mt-5 flex flex-wrap gap-5 text-sm font-semibold text-brand underline"
      >
        <Link to="/admin/vendors">Vendor applications & payment accounts</Link>
        <Link to="/admin/coupons">Coupons</Link>
        <Link to="/admin/orders">Orders & payments</Link>
      </nav>
      <p className="mt-5 text-sm text-muted">
        Razorpay test transactions. Revenue and commission include confirmed
        orders; provider fees are not deducted from commission.
      </p>
      <Feedback message={resource.error} error />
      {resource.loading ? (
        <Loading />
      ) : (
        a && (
          <>
            <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[
                ["Sales", formatPrice(a.totals.revenueInPaise)],
                [
                  "Platform commission",
                  formatPrice(a.totals.commissionInPaise),
                ],
                ["Paid orders", a.totals.orders],
                ["Discounts", formatPrice(a.totals.discountInPaise)],
                ["Customers & sellers", a.users],
                ["Approved stores", a.vendors],
                ["Active products", a.products],
                ["Pending applications", a.pendingApplications],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="rounded-xl border border-line bg-white p-5"
                >
                  <p className="text-sm text-muted">{label}</p>
                  <p className="mt-3 text-2xl font-bold break-words">{value}</p>
                </div>
              ))}
            </div>
            <p className="mt-5 text-sm text-muted">
              Pending payments: {a.pendingPayments} · Refunds requiring
              reconciliation: {a.refundPending}
            </p>
            <section className="mt-10">
              <h2 className="text-xl font-bold">Sales in the last 30 days</h2>
              {a.dailySales.length ? (
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-line">
                        <th className="p-3">Date (India)</th>
                        <th className="p-3">Orders</th>
                        <th className="p-3">Sales</th>
                      </tr>
                    </thead>
                    <tbody>
                      {a.dailySales.map((d) => (
                        <tr key={d.date} className="border-b border-line">
                          <td className="p-3">{d.date}</td>
                          <td className="p-3">{d.orders}</td>
                          <td className="p-3">
                            {formatPrice(d.revenueInPaise)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="mt-4 text-sm text-muted">
                  Sales will appear after your first successful test payment.
                </p>
              )}
            </section>
            <section className="mt-10">
              <h2 className="text-xl font-bold">Top stores</h2>
              <div className="mt-4 space-y-3">
                {a.topStores.map((v) => (
                  <div
                    key={v.vendorId}
                    className="flex flex-wrap justify-between gap-3 rounded-xl border border-line bg-white p-4"
                  >
                    <span className="font-semibold">{v.storeName}</span>
                    <span className="text-sm">
                      Sales {formatPrice(v.revenueInPaise)} · Vendor share{" "}
                      {formatPrice(v.vendorAmountInPaise)}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          </>
        )
      )}
    </MarketplaceLayout>
  );
};
export { AdminAnalyticsPage };
