import { useEffect } from "react";
import { Link, NavLink } from "react-router";
import { MarketplaceBrand } from "../MarketplaceBrand.jsx";
import { useAuth } from "../../hooks/useAuth.js";

const MarketplaceLayout = ({ children, title = "Marketplace" }) => {
  const { user } = useAuth();
  useEffect(() => {
    document.title = title;
  }, [title]);
  const navClass = ({ isActive }) =>
    `rounded px-2 py-2 text-sm focus-visible:outline-2 focus-visible:outline-brand ${isActive ? "font-semibold text-brand underline underline-offset-4" : "text-muted hover:text-brand"}`;
  return (
    <div className="min-h-svh px-5 sm:px-6">
      <header className="mx-auto flex max-w-[1120px] flex-wrap items-center justify-between gap-4 border-b border-line py-6">
        <MarketplaceBrand />
        <nav
          aria-label="Main navigation"
          className="flex flex-wrap items-center gap-1"
        >
          <NavLink end to="/" className={navClass}>
            Shop
          </NavLink>
          <NavLink to="/cart" className={navClass}>
            Cart
          </NavLink>
          {user ? (
            <>
              <NavLink to="/orders" className={navClass}>
                Orders
              </NavLink>
              <NavLink to="/vendor/apply" className={navClass}>
                My store
              </NavLink>
              {user.roles.includes("vendor") && (
                <NavLink to="/vendor/orders" className={navClass}>
                  Store orders
                </NavLink>
              )}
              {user.roles.includes("vendor") && (
                <NavLink to="/vendor/products" className={navClass}>
                  Products
                </NavLink>
              )}
              {user.roles.includes("admin") && (
                <NavLink to="/admin/analytics" className={navClass}>
                  Analytics
                </NavLink>
              )}
              {user.roles.includes("admin") && (
                <NavLink to="/admin/vendors" className={navClass}>
                  Vendor reviews
                </NavLink>
              )}
              <NavLink to="/account" className={navClass}>
                Account
              </NavLink>
            </>
          ) : (
            <Link
              to="/login"
              className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              Sign in
            </Link>
          )}
        </nav>
      </header>
      <main className="mx-auto max-w-[1120px] py-8 sm:py-12">{children}</main>
    </div>
  );
};

export { MarketplaceLayout };
