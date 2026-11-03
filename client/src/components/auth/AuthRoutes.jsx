import { Navigate, Outlet } from "react-router";
import { useAuth } from "../../hooks/useAuth.js";
import { AuthStatus } from "./AuthStatus.jsx";

const RequireAuth = () => {
  const { status } = useAuth();
  if (["checking", "error"].includes(status)) return <AuthStatus />;
  if (status === "guest") return <Navigate to="/login" replace />;
  return <Outlet />;
};

const GuestOnly = () => {
  const { status } = useAuth();
  if (["checking", "error"].includes(status)) return <AuthStatus />;
  if (status !== "guest") return <Navigate to="/account" replace />;
  return <Outlet />;
};

export { RequireAuth, GuestOnly };
