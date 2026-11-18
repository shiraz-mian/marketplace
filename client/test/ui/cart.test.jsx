import { StrictMode } from "react";
import { AxiosError } from "axios";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { App } from "../../src/App.jsx";
import { AuthContext } from "../../src/context/AuthContext.js";
import { AuthProvider } from "../../src/context/AuthProvider.jsx";
import { apiClient, protectedApiClient } from "../../src/api/apiClient.js";

const USER = {
  id: "507f1f77bcf86cd799439011",
  name: "Buyer",
  email: "buyer@example.test",
  roles: ["customer"],
  status: "active",
};
const ID = "507f1f77bcf86cd799439013";
const PRODUCT = {
  id: ID,
  vendorId: "507f1f77bcf86cd799439012",
  storeName: "Everyday Store",
  title: "Everyday Mug",
  description: "A ceramic mug for your everyday tea and coffee.",
  category: "home",
  priceInPaise: 19999,
  currency: "INR",
  stock: 8,
  status: "active",
  imageUrl: null,
};
const VERSION = "3cc220a1-512a-4c6b-8ce0-8bac48146e5c";
const CART = {
  version: VERSION,
  currency: "INR",
  items: [
    {
      productId: ID,
      quantity: 2,
      product: PRODUCT,
      issue: null,
      lineTotalInPaise: 39998,
    },
  ],
  summary: { itemCount: 2, subtotalInPaise: 39998, hasIssues: false },
};
const EMPTY = {
  version: "0",
  currency: "INR",
  items: [],
  summary: { itemCount: 0, subtotalInPaise: 0, hasIssues: false },
};
const ok = (config, data) => ({
  config,
  status: 200,
  statusText: "OK",
  headers: {},
  data: { success: true, data },
});
const fail = (config, code, status = 409) => {
  throw new AxiosError(
    "PRIVATE_TRANSPORT",
    AxiosError.ERR_BAD_RESPONSE,
    config,
    null,
    {
      config,
      status,
      data: {
        success: false,
        error: { code, message: "PRIVATE_SERVER_DETAIL" },
      },
    },
  );
};
let publicAdapter;
let privateAdapter;
let oldPublic;
let oldPrivate;
beforeEach(() => {
  oldPublic = apiClient.defaults.adapter;
  oldPrivate = protectedApiClient.defaults.adapter;
  publicAdapter = vi.fn(async (config) => ok(config, { product: PRODUCT }));
  privateAdapter = vi.fn(async (config) => ok(config, { cart: CART }));
  apiClient.defaults.adapter = publicAdapter;
  protectedApiClient.defaults.adapter = privateAdapter;
});
afterEach(() => {
  apiClient.defaults.adapter = oldPublic;
  protectedApiClient.defaults.adapter = oldPrivate;
});
const CurrentLocation = () => {
  const location = useLocation();
  return <output data-testid="current-path">{location.pathname}</output>;
};
const renderApp = (path = "/cart", user = USER) =>
  render(
    <StrictMode>
      <MemoryRouter initialEntries={[path]}>
        <AuthContext.Provider
          value={{ user, status: user ? "authenticated" : "guest" }}
        >
          <App />
          <CurrentLocation />
        </AuthContext.Provider>
      </MemoryRouter>
    </StrictMode>,
  );
const fill = (label, value) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
const cartReads = () =>
  privateAdapter.mock.calls.filter(
    ([config]) => config.url === "/cart" && config.method === "get",
  );
const mutations = () =>
  privateAdapter.mock.calls.filter(([config]) => config.method !== "get");

test("the cart shows current prices, quantity controls and a server-calculated subtotal", async () => {
  renderApp();
  await screen.findByText("2 items in your cart");
  const summary = screen.getByRole("complementary", { name: "Cart summary" });
  expect(within(summary).getByText("₹399.98")).toBeTruthy();
  expect(screen.getByLabelText("Quantity for Everyday Mug").value).toBe("2");
  expect(screen.getByText("Sold by Everyday Store")).toBeTruthy();
});

test("updating quantity sends the cart revision and renders the returned totals", async () => {
  privateAdapter.mockImplementation(async (config) =>
    ok(config, {
      cart:
        config.method === "patch"
          ? {
              ...CART,
              items: [
                { ...CART.items[0], quantity: 3, lineTotalInPaise: 59997 },
              ],
              summary: {
                ...CART.summary,
                itemCount: 3,
                subtotalInPaise: 59997,
              },
            }
          : CART,
    }),
  );
  renderApp();
  await screen.findByText("2 items in your cart");
  fill("Quantity for Everyday Mug", "3");
  await userEvent.setup().click(screen.getByRole("button", { name: "Update" }));
  await screen.findByText("3 items in your cart");
  const config = mutations()[0][0];
  expect(config.url).toBe(`/cart/items/${ID}`);
  expect(config.headers.get("If-Match")).toBe(`"${VERSION}"`);
  expect(JSON.parse(config.data)).toEqual({ quantity: 3 });
  expect(
    within(
      screen.getByRole("complementary", { name: "Cart summary" }),
    ).getByText("₹599.97"),
  ).toBeTruthy();
});

test("invalid quantities do not send an update", async () => {
  renderApp();
  await screen.findByText("2 items in your cart");
  fill("Quantity for Everyday Mug", "9");
  await userEvent.setup().click(screen.getByRole("button", { name: "Update" }));
  expect(screen.getByRole("alert").textContent).toContain("1 to 8");
  expect(mutations()).toHaveLength(0);
});

test("removing an item uses the current revision and displays an empty cart", async () => {
  privateAdapter.mockImplementation(async (config) =>
    ok(config, { cart: config.method === "delete" ? EMPTY : CART }),
  );
  renderApp();
  await screen.findByText("2 items in your cart");
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "Remove Everyday Mug" }));
  await screen.findByText("Your cart is empty");
  expect(mutations()[0][0].headers.get("If-Match")).toBe(`"${VERSION}"`);
  expect(screen.getByRole("link", { name: "Explore products" })).toBeTruthy();
});

test("clearing the cart requires its inline confirmation", async () => {
  privateAdapter.mockImplementation(async (config) =>
    ok(config, { cart: config.method === "delete" ? EMPTY : CART }),
  );
  renderApp();
  await screen.findByText("2 items in your cart");
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Clear cart" }));
  expect(mutations()).toHaveLength(0);
  await user.click(screen.getByRole("button", { name: "Keep items" }));
  expect(
    screen.queryByRole("group", { name: "Clear cart confirmation" }),
  ).toBeNull();
  await user.click(screen.getByRole("button", { name: "Clear cart" }));
  await user.click(screen.getByRole("button", { name: "Clear all items" }));
  await screen.findByText("Your cart is empty");
  expect(mutations()[0][0].url).toBe("/cart");
});

test("unavailable and low-stock items are flagged and can still be removed", async () => {
  const badCart = {
    ...CART,
    items: [
      {
        productId: ID,
        quantity: 2,
        product: null,
        issue: "PRODUCT_UNAVAILABLE",
        lineTotalInPaise: null,
      },
      {
        ...CART.items[0],
        productId: "507f1f77bcf86cd799439014",
        product: { ...PRODUCT, stock: 1 },
        issue: "INSUFFICIENT_STOCK",
      },
    ],
    summary: { itemCount: 4, subtotalInPaise: 0, hasIssues: true },
  };
  privateAdapter.mockImplementation(async (config) =>
    ok(config, { cart: badCart }),
  );
  renderApp();
  await screen.findByText("4 items in your cart");
  expect(
    screen.getByText("Only 1 available. Reduce the quantity to continue."),
  ).toBeTruthy();
  expect(
    screen.getByRole("button", { name: "Remove Unavailable item 1" }).disabled,
  ).toBe(false);
  expect(screen.getByText("Available items subtotal")).toBeTruthy();
});

test("a conflict reloads the latest cart without replaying the quantity mutation", async () => {
  let changed = false;
  privateAdapter.mockImplementation(async (config) => {
    if (config.method === "patch") {
      changed = true;
      return fail(config, "CART_CHANGED");
    }
    return ok(config, {
      cart: changed
        ? {
            ...CART,
            items: [{ ...CART.items[0], quantity: 4, lineTotalInPaise: 79996 }],
            summary: { ...CART.summary, itemCount: 4, subtotalInPaise: 79996 },
          }
        : CART,
    });
  });
  renderApp();
  await screen.findByText("2 items in your cart");
  fill("Quantity for Everyday Mug", "3");
  await userEvent.setup().click(screen.getByRole("button", { name: "Update" }));
  await screen.findByText("4 items in your cart");
  expect(screen.getByRole("alert").textContent).toContain("another tab");
  expect(mutations()).toHaveLength(1);
  expect(cartReads().length).toBeGreaterThan(1);
});

test("pending mutations disable controls and block duplicate clicks", async () => {
  let resolveWrite;
  privateAdapter.mockImplementation(async (config) =>
    config.method === "delete"
      ? new Promise((resolve) => {
          resolveWrite = () => resolve(ok(config, { cart: EMPTY }));
        })
      : ok(config, { cart: CART }),
  );
  renderApp();
  await screen.findByText("2 items in your cart");
  const button = screen.getByRole("button", { name: "Remove Everyday Mug" });
  const user = userEvent.setup();
  await user.click(button);
  await user.click(button);
  expect(button.disabled).toBe(true);
  expect(screen.getByRole("button", { name: "Clear cart" }).disabled).toBe(
    true,
  );
  expect(mutations()).toHaveLength(1);
  await act(async () => resolveWrite());
  await screen.findByText("Your cart is empty");
});

test("a cart outage gives a safe retry and does not expose backend details", async () => {
  let offline = true;
  privateAdapter.mockImplementation(async (config) =>
    offline
      ? fail(config, "CART_UNAVAILABLE", 503)
      : ok(config, { cart: EMPTY }),
  );
  renderApp();
  const alert = await screen.findByRole("alert");
  expect(alert.textContent).toContain("temporarily unavailable");
  expect(alert.textContent).not.toContain("PRIVATE");
  offline = false;
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "Try again" }));
  await screen.findByText("Your cart is empty");
});

test("adding from a product sends exact quantity and a retry-safe operation ID", async () => {
  renderApp(`/products/${ID}`);
  await screen.findByRole("heading", { name: "About this product" });
  fill("Quantity", "3");
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "Add to cart" }));
  await screen.findByText("Everyday Mug added to your cart.");
  const call = mutations()[0][0];
  expect(call.url).toBe("/cart/items");
  expect(JSON.parse(call.data)).toEqual({ productId: ID, quantity: 3 });
  expect(call.headers.get("Idempotency-Key")).toMatch(/^[0-9a-f-]{36}$/);
  expect(screen.getByRole("link", { name: "View cart" })).toBeTruthy();
});

test("retrying an uncertain add keeps its operation ID and avoids double adds", async () => {
  let attempts = 0;
  privateAdapter.mockImplementation(async (config) => {
    if (++attempts === 1)
      throw new AxiosError("timeout", "ECONNABORTED", config);
    return ok(config, { cart: CART });
  });
  renderApp(`/products/${ID}`);
  await screen.findByRole("heading", { name: "About this product" });
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Add to cart" }));
  await screen.findByRole("alert");
  await user.click(screen.getByRole("button", { name: "Add to cart" }));
  await screen.findByText("Everyday Mug added to your cart.");
  expect(mutations()[0][0].headers.get("Idempotency-Key")).toBe(
    mutations()[1][0].headers.get("Idempotency-Key"),
  );
});

test("guests are prompted to sign in before adding and out-of-stock items cannot be added", async () => {
  const view = renderApp(`/products/${ID}`, null);
  await screen.findByRole("link", { name: "Sign in to add to cart" });
  expect(screen.queryByRole("button", { name: "Add to cart" })).toBeNull();
  expect(mutations()).toHaveLength(0);
  view.unmount();
  publicAdapter.mockImplementation(async (config) =>
    ok(config, { product: { ...PRODUCT, stock: 0 } }),
  );
  renderApp(`/products/${ID}`);
  await screen.findByText("This product is currently out of stock.");
  expect(screen.queryByRole("button", { name: "Add to cart" })).toBeNull();
});

test("leaving the product page aborts a pending cart addition", async () => {
  let pendingConfig;
  privateAdapter.mockImplementation(async (config) => {
    pendingConfig = config;
    return new Promise(() => {});
  });
  const view = renderApp(`/products/${ID}`);
  await screen.findByRole("heading", { name: "About this product" });
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "Add to cart" }));
  await waitFor(() => expect(pendingConfig).toBeTruthy());
  view.unmount();
  expect(pendingConfig.signal.aborted).toBe(true);
});

test("after sign-in a protected cart visit returns to the cart with a Bearer request", async () => {
  let loggedIn = false;
  publicAdapter.mockImplementation(async (config) => {
    if (config.url === "/auth/refresh" && !loggedIn)
      return fail(config, "INVALID_REFRESH_TOKEN", 401);
    loggedIn = true;
    return ok(config, {
      user: USER,
      accessToken: "test-cart-token",
      tokenType: "Bearer",
      expiresIn: 900,
    });
  });
  privateAdapter.mockImplementation(async (config) =>
    ok(config, { cart: EMPTY }),
  );
  render(
    <StrictMode>
      <MemoryRouter initialEntries={["/cart"]}>
        <AuthProvider>
          <App />
          <CurrentLocation />
        </AuthProvider>
      </MemoryRouter>
    </StrictMode>,
  );
  await screen.findByRole("heading", { name: "Welcome back" });
  fill("Email address", "buyer@example.test");
  fill("Password", "a correct password");
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "Sign in", exact: true }));
  await screen.findByText("Your cart is empty");
  expect(screen.getByTestId("current-path").textContent).toBe("/cart");
  expect(cartReads().at(-1)[0].headers.get("Authorization")).toBe(
    "Bearer test-cart-token",
  );
});

test("switching accounts aborts the previous cart read and never displays the old cart", async () => {
  const pending = [];
  let phase = "old";
  privateAdapter.mockImplementation(async (config) => {
    if (phase === "old")
      return new Promise((resolve) => pending.push({ config, resolve }));
    return ok(config, { cart: EMPTY });
  });
  const Harness = ({ user }) => (
    <MemoryRouter initialEntries={["/cart"]}>
      <AuthContext.Provider value={{ user, status: "authenticated" }}>
        <App />
      </AuthContext.Provider>
    </MemoryRouter>
  );
  const view = render(<Harness user={USER} />);
  await waitFor(() => expect(pending.length).toBeGreaterThan(0));
  phase = "new";
  view.rerender(<Harness user={{ ...USER, id: "507f1f77bcf86cd799439099" }} />);
  await screen.findByText("Your cart is empty");
  expect(pending.every(({ config }) => config.signal.aborted)).toBe(true);
  await act(async () => {
    for (const { config, resolve } of pending)
      resolve(ok(config, { cart: CART }));
  });
  expect(screen.queryByText("2 items in your cart")).toBeNull();
  expect(screen.getByText("Your cart is empty")).toBeTruthy();
});

test("malformed cart data shows a safe error instead of invalid prices", async () => {
  privateAdapter.mockImplementation(async (config) =>
    ok(config, { cart: { ...CART, items: [{}] } }),
  );
  renderApp();
  const alert = await screen.findByRole("alert");
  expect(alert.textContent).toContain("Something went wrong");
  expect(screen.queryByText(/NaN/)).toBeNull();
});
