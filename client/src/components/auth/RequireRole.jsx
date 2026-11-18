import { Link, Outlet } from "react-router";
import { useAuth } from "../../hooks/useAuth.js";
import { MarketplaceLayout } from "../marketplace/MarketplaceLayout.jsx";

const RequireRole = ({ role }) => {
  const { user } = useAuth();
  if (!user?.roles.includes(role))
    return (
      <MarketplaceLayout>
        <h1 className="text-3xl font-bold">Permission required</h1>
        <p className="mt-4 text-muted">
          Your account does not have access to this page.
        </p>
        <Link className="mt-5 inline-block text-brand underline" to="/account">
          View account and refresh permissions
        </Link>
      </MarketplaceLayout>
    );
  return <Outlet />;
};

export { RequireRole };
