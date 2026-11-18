import { Link, Route, Routes } from "react-router";
import { GuestOnly, RequireAuth } from "./components/auth/AuthRoutes.jsx";
import { LoginPage } from "./pages/LoginPage.jsx";
import { AccountPage } from "./pages/AccountPage.jsx";
import { RegisterPage } from "./pages/RegisterPage.jsx";
import { RequireRole } from "./components/auth/RequireRole.jsx";
import { CatalogPage } from "./pages/CatalogPage.jsx";
import { ProductDetailsPage } from "./pages/ProductDetailsPage.jsx";
import { VendorApplicationPage } from "./pages/VendorApplicationPage.jsx";
import { AdminVendorsPage } from "./pages/AdminVendorsPage.jsx";
import { VendorProductsPage } from "./pages/VendorProductsPage.jsx";
import { ProductEditorPage } from "./pages/ProductEditorPage.jsx";
import { CartPage } from "./pages/CartPage.jsx";
import { CheckoutPage } from "./pages/CheckoutPage.jsx";
import { OrderDetailsPage } from "./pages/OrderDetailsPage.jsx";
import { OrdersPage } from "./pages/OrdersPage.jsx";
import { AdminAnalyticsPage } from "./pages/AdminAnalyticsPage.jsx";
import { AdminCouponsPage } from "./pages/AdminCouponsPage.jsx";

const App = () => {
  return (
    <Routes>
      <Route path="/" element={<CatalogPage />} />
      <Route path="/products/:productId" element={<ProductDetailsPage />} />
      <Route element={<GuestOnly />}>
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/login" element={<LoginPage />} />
      </Route>
      <Route element={<RequireAuth />}>
        <Route path="/cart" element={<CartPage />} />
        <Route path="/checkout" element={<CheckoutPage />} />
        <Route path="/orders" element={<OrdersPage />} />
        <Route path="/orders/:orderId" element={<OrderDetailsPage />} />
        <Route path="/account" element={<AccountPage />} />
        <Route path="/vendor/apply" element={<VendorApplicationPage />} />
        <Route element={<RequireRole role="vendor" />}>
          <Route path="/vendor/orders" element={<OrdersPage mode="vendor" />} />
          <Route path="/vendor/products" element={<VendorProductsPage />} />
          <Route path="/vendor/products/new" element={<ProductEditorPage />} />
          <Route
            path="/vendor/products/:productId/edit"
            element={<ProductEditorPage />}
          />
        </Route>
        <Route element={<RequireRole role="admin" />}>
          <Route path="/admin/analytics" element={<AdminAnalyticsPage />} />
          <Route path="/admin/coupons" element={<AdminCouponsPage />} />
          <Route path="/admin/orders" element={<OrdersPage mode="admin" />} />
          <Route path="/admin/vendors" element={<AdminVendorsPage />} />
        </Route>
      </Route>
      <Route
        path="*"
        element={
          <main className="mx-auto max-w-lg px-5 py-16">
            <h1 className="text-3xl font-bold">Page not found</h1>
            <Link to="/" className="mt-5 inline-block text-brand underline">
              Go to Marketplace
            </Link>
          </main>
        }
      />
    </Routes>
  );
};

export { App };
