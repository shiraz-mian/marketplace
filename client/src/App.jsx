import { Link, Navigate, Route, Routes } from "react-router";
import { GuestOnly, RequireAuth } from "./components/auth/AuthRoutes.jsx";
import { LoginPage } from "./pages/LoginPage.jsx";
import { AccountPage } from "./pages/AccountPage.jsx";
import { RegisterPage } from "./pages/RegisterPage.jsx";

const App = () => {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/account" replace />} />
      <Route element={<GuestOnly />}>
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/login" element={<LoginPage />} />
      </Route>
      <Route element={<RequireAuth />}>
        <Route path="/account" element={<AccountPage />} />
      </Route>
      <Route path="*" element={<main className="mx-auto max-w-lg px-5 py-16"><h1 className="text-3xl font-bold">Page not found</h1><Link to="/" className="mt-5 inline-block text-brand underline">Go to Marketplace</Link></main>} />
    </Routes>
  );
};

export { App };
