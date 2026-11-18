import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { MarketplaceBrand } from "../components/MarketplaceBrand.jsx";
import { SUBMIT_CLASSES } from "../components/auth/authStyles.js";
import { useAuth } from "../hooks/useAuth.js";
import { getAuthError } from "../utils/getAuthError.js";

const AccountPage = () => {
  const { user, logout, reloadUser } = useAuth();
  const [pending, setPending] = useState(null);
  const [feedback, setFeedback] = useState({ message: "", error: false });
  const requestPending = useRef(false);

  useEffect(() => {
    document.title = "My account | Marketplace";
  }, []);

  const runAction = async (action) => {
    if (requestPending.current) return;
    requestPending.current = true;
    setPending(action);
    setFeedback({ message: "", error: false });
    try {
      if (action === "logout") await logout();
      else {
        await reloadUser();
        setFeedback({
          message: "Your account details are up to date.",
          error: false,
        });
      }
    } catch (error) {
      setFeedback({
        message: getAuthError(
          error,
          action === "logout" ? "logout" : "account",
        ),
        error: true,
      });
    } finally {
      requestPending.current = false;
      setPending(null);
    }
  };

  return (
    <div className="min-h-svh px-5">
      <header className="mx-auto flex max-w-[1120px] items-center justify-between border-b border-line py-6">
        <MarketplaceBrand />
        <span className="text-xs text-muted">My account</span>
      </header>
      <main className="mx-auto my-10 max-w-xl rounded-2xl border border-line bg-white p-6 shadow-sm sm:p-9">
        <p className="text-xs font-semibold tracking-widest text-accent uppercase">
          You're signed in
        </p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight">
          Welcome, {user.name}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          View your account details and manage your sign-in.
        </p>
        <nav
          aria-label="Account actions"
          className="mt-5 flex flex-wrap gap-4 text-sm font-semibold text-brand underline underline-offset-4"
        >
          <Link to="/">Browse products</Link>
          <Link to="/cart">View cart</Link>
          <Link to="/orders">My orders</Link>
          <Link to="/vendor/apply">My store application</Link>
          {user.roles.includes("vendor") && (
            <Link to="/vendor/orders">Store orders</Link>
          )}
          {user.roles.includes("vendor") && (
            <Link to="/vendor/products">Manage products</Link>
          )}
          {user.roles.includes("admin") && (
            <Link to="/admin/analytics">Admin analytics</Link>
          )}
          {user.roles.includes("admin") && (
            <Link to="/admin/coupons">Manage coupons</Link>
          )}
          {user.roles.includes("admin") && (
            <Link to="/admin/vendors">Review vendor applications</Link>
          )}
        </nav>
        <dl className="mt-7 space-y-5 border-y border-line py-6 text-sm">
          <div>
            <dt className="text-muted">Full name</dt>
            <dd className="mt-1 font-semibold">{user.name}</dd>
          </div>
          <div>
            <dt className="text-muted">Email address</dt>
            <dd className="mt-1 font-semibold [overflow-wrap:anywhere]">
              {user.email}
            </dd>
          </div>
          <div>
            <dt className="text-muted">Account roles</dt>
            <dd className="mt-1 font-semibold capitalize">
              {user.roles.join(", ")}
            </dd>
          </div>
        </dl>
        {feedback.message && (
          <p
            className={`mt-5 text-sm leading-relaxed ${feedback.error ? "text-danger" : "text-brand"}`}
            role={feedback.error ? "alert" : "status"}
          >
            {feedback.message}
          </p>
        )}
        <div aria-busy={Boolean(pending)}>
          <button
            className={SUBMIT_CLASSES}
            type="button"
            disabled={Boolean(pending)}
            onClick={() => runAction("account")}
          >
            {pending === "account" ? "Refreshing details…" : "Refresh details"}
          </button>
          <button
            className="mt-3 min-h-12 w-full rounded-[7px] border border-input-border px-4 py-3 text-sm font-semibold text-brand enabled:hover:bg-canvas disabled:cursor-wait disabled:opacity-70"
            type="button"
            disabled={Boolean(pending)}
            onClick={() => runAction("logout")}
          >
            {pending === "logout" ? "Signing out…" : "Sign out"}
          </button>
        </div>
      </main>
    </div>
  );
};

export { AccountPage };
