import { Navigate, Outlet, useLocation } from "react-router";
import { useAuth } from "../../hooks/useAuth.js";
import { AuthStatus } from "./AuthStatus.jsx";
import { getLoginRedirect } from "../../utils/loginRedirect.js";

const RequireAuth = () => {
  const { status } = useAuth();
  const location = useLocation();
  if (["checking", "error"].includes(status)) return <AuthStatus />;
  if (status === "guest")
    return (
      <Navigate
        to="/login"
        state={{ from: location.pathname + location.search }}
        replace
      />
    );
  return <Outlet />;
};

const GuestOnly = () => {
  const { status } = useAuth();
  const location = useLocation();
  if (["checking", "error"].includes(status)) return <AuthStatus />;
  if (status !== "guest")
    return (
      <Navigate
        to={getLoginRedirect(location.state?.from)}
        state={{ catalogSearch: location.state?.catalogSearch }}
        replace
      />
    );
  return <Outlet />;
};

export { RequireAuth, GuestOnly };
