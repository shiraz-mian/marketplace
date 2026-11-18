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
import { MemoryRouter, useLocation, useNavigate } from "react-router";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { App } from "../../src/App.jsx";
import { AuthContext } from "../../src/context/AuthContext.js";
import { apiClient } from "../../src/api/apiClient.js";

const PRODUCT = {
  id: "507f1f77bcf86cd799439013",
  vendorId: "507f1f77bcf86cd799439012",
  storeName: "Everyday Store",
  title: "Everyday Mug",
  description: "A ceramic mug for your everyday tea and coffee.",
  category: "home",
  priceInPaise: 49999,
  currency: "INR",
  stock: 12,
  status: "active",
  imageUrl: null,
};
const response = (config, data) => ({
  config,
  data: { success: true, data },
  status: 200,
  statusText: "OK",
  headers: {},
});
const result = (config, products = [], total = products.length) =>
  response(config, {
    products,
    pagination: {
      page: config.params.page,
      limit: 12,
      total,
      totalPages: Math.ceil(total / 12),
    },
  });
let adapter;
let originalAdapter;
beforeEach(() => {
  originalAdapter = apiClient.defaults.adapter;
  adapter = vi.fn(async (config) => result(config));
  apiClient.defaults.adapter = adapter;
});
afterEach(() => {
  apiClient.defaults.adapter = originalAdapter;
});

const HistoryControls = () => {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <>
      <output data-testid="search-url">{location.search}</output>
      <button onClick={() => navigate(-1)}>History back</button>
      <button onClick={() => navigate(1)}>History forward</button>
    </>
  );
};
const renderCatalog = (path = "/") =>
  render(
    <StrictMode>
      <MemoryRouter initialEntries={[path]}>
        <AuthContext.Provider value={{ user: null, status: "guest" }}>
          <App />
          <HistoryControls />
        </AuthContext.Provider>
      </MemoryRouter>
    </StrictMode>,
  );
const fill = (label, value) => {
  if (label !== "Search products") {
    const toggle = screen.getByRole("button", { name: /^Filters/ });
    if (toggle.getAttribute("aria-expanded") === "false")
      fireEvent.click(toggle);
  }
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
};
const searchCalls = () =>
  adapter.mock.calls.filter(([config]) => config.url === "/products/search");
const lastSearch = () => searchCalls().at(-1)?.[0];
const submit = () =>
  userEvent
    .setup()
    .click(screen.getByRole("button", { name: "Search", exact: true }));

test("guests can search through the public Axios client without an authorization header", async () => {
  adapter.mockImplementation(async (config) => result(config, [PRODUCT]));
  renderCatalog();
  await screen.findByRole("heading", { name: PRODUCT.title });
  expect(lastSearch().params).toEqual({ page: 1, limit: 12 });
  expect(lastSearch().headers.get("Authorization")).toBeUndefined();
  expect(screen.getByText("1 product found")).toBeTruthy();
});

test("submitting filters converts rupees and saves normalized search choices in the URL", async () => {
  renderCatalog();
  await screen.findByText("New finds are on the way");
  fill("Search products", " mug ");
  fill("Category", " Home ");
  fill("Min price (₹)", "0");
  fill("Max price (₹)", "499.99");
  fireEvent.change(screen.getByLabelText("Availability"), {
    target: { value: "in" },
  });
  fireEvent.change(screen.getByLabelText("Sort by"), {
    target: { value: "price_asc" },
  });
  await submit();
  await waitFor(() =>
    expect(lastSearch().params.maxPriceInPaise).toBe("49999"),
  );
  expect(lastSearch().params).toEqual({
    q: "mug",
    category: "home",
    minPriceInPaise: "0",
    maxPriceInPaise: "49999",
    inStock: "true",
    sort: "price_asc",
    page: 1,
    limit: 12,
  });
  expect(screen.getByTestId("search-url").textContent).toContain("q=mug");
  expect(screen.getByLabelText("Max price (₹)").value).toBe("499.99");
});

test("invalid prices stop submission, identify the field and focus it", async () => {
  renderCatalog();
  await screen.findByText("New finds are on the way");
  const count = searchCalls().length;
  fill("Min price (₹)", "500");
  fill("Max price (₹)", "100");
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: /^Filters/ }));
  await submit();
  expect(
    screen.getByText("Maximum price must be at least the minimum price."),
  ).toBeTruthy();
  expect(
    screen.getByLabelText("Max price (₹)").getAttribute("aria-invalid"),
  ).toBe("true");
  await waitFor(() =>
    expect(document.activeElement).toBe(screen.getByLabelText("Max price (₹)")),
  );
  expect(searchCalls().length).toBe(count);
});

test("advanced filters stay collapsed until requested and retain edits when reopened", async () => {
  renderCatalog();
  await screen.findByText("New finds are on the way");
  const user = userEvent.setup();
  expect(screen.queryByRole("textbox", { name: "Category" })).toBeNull();
  await user.click(screen.getByRole("button", { name: /^Filters/ }));
  fill("Category", "home");
  await user.click(screen.getByRole("button", { name: /^Filters/ }));
  expect(screen.queryByRole("textbox", { name: "Category" })).toBeNull();
  await user.click(screen.getByRole("button", { name: /^Filters/ }));
  expect(screen.getByRole("textbox", { name: "Category" }).value).toBe("home");
});

test("URL state initializes inputs and Back/Forward restore submitted searches", async () => {
  renderCatalog("/?q=mug&maxPriceInPaise=50000&sort=newest");
  await screen.findByText("No products match your search");
  expect(screen.getByLabelText("Search products").value).toBe("mug");
  expect(screen.getByLabelText("Max price (₹)").value).toBe("500.00");
  fill("Search products", "shirt");
  await submit();
  await waitFor(() => expect(lastSearch().params.q).toBe("shirt"));
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "History back" }));
  await waitFor(() =>
    expect(screen.getByLabelText("Search products").value).toBe("mug"),
  );
  await waitFor(() => expect(lastSearch().params.q).toBe("mug"));
  await user.click(screen.getByRole("button", { name: "History forward" }));
  await waitFor(() =>
    expect(screen.getByLabelText("Search products").value).toBe("shirt"),
  );
});

test("pagination preserves filters and a newly submitted search resets to page one", async () => {
  adapter.mockImplementation(async (config) => result(config, [PRODUCT], 25));
  renderCatalog("/?q=mug&category=home&sort=price_desc");
  await screen.findByRole("heading", { name: PRODUCT.title });
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Next" }));
  await waitFor(() => expect(lastSearch().params.page).toBe(2));
  expect(lastSearch().params.q).toBe("mug");
  expect(lastSearch().params.category).toBe("home");
  expect(lastSearch().params.sort).toBe("price_desc");
  fill("Search products", "shirt");
  await submit();
  await waitFor(() => expect(lastSearch().params.q).toBe("shirt"));
  expect(lastSearch().params.page).toBe(1);
});

test("clearing a search resets the URL and both applied and unsubmitted inputs", async () => {
  renderCatalog("/?q=mug&minPriceInPaise=100&inStock=true&sort=newest&page=2");
  await screen.findByText("No products match your search");
  fill("Category", "unsaved draft");
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "Clear all" }));
  await screen.findByText("New finds are on the way");
  expect(screen.getByTestId("search-url").textContent).toBe("");
  expect(screen.getByLabelText("Search products").value).toBe("");
  expect(screen.getByLabelText("Category").value).toBe("");
  expect(screen.getByLabelText("Availability").value).toBe("all");
  expect(lastSearch().params).toEqual({ page: 1, limit: 12 });
});

test("editing an unsubmitted form can be cleared even when the URL is already empty", async () => {
  renderCatalog();
  await screen.findByText("New finds are on the way");
  fill("Search products", "not submitted");
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "Clear all" }));
  expect(screen.getByLabelText("Search products").value).toBe("");
});

test("search outages show a safe message and retry preserves all filters", async () => {
  let unavailable = true;
  adapter.mockImplementation(async (config) => {
    if (unavailable)
      throw new AxiosError(
        "DO_NOT_EXPOSE_PRIVATE_TRANSPORT",
        AxiosError.ERR_BAD_RESPONSE,
        config,
        null,
        {
          config,
          status: 503,
          data: {
            success: false,
            error: {
              code: "SEARCH_UNAVAILABLE",
              message: "DO_NOT_EXPOSE_PRIVATE_SERVER",
            },
          },
        },
      );
    return result(config, [PRODUCT]);
  });
  renderCatalog("/?q=mug&sort=price_asc");
  const alert = await screen.findByRole("alert");
  expect(alert.textContent).toContain(
    "Product search is temporarily unavailable",
  );
  expect(alert.textContent).not.toContain("DO_NOT_EXPOSE");
  unavailable = false;
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "Try again" }));
  await screen.findByRole("heading", { name: PRODUCT.title });
  expect(lastSearch().params.q).toBe("mug");
  expect(lastSearch().params.sort).toBe("price_asc");
});

test("a slow previous request is canceled and cannot replace newer results", async () => {
  let resolveOld;
  let oldConfig;
  adapter.mockImplementation(async (config) => {
    if (config.params.q === "old") {
      oldConfig = config;
      return new Promise((resolve) => {
        resolveOld = () =>
          resolve(result(config, [{ ...PRODUCT, title: "Old Mug" }]));
      });
    }
    return result(config, [{ ...PRODUCT, title: "New Mug" }]);
  });
  renderCatalog("/?q=old");
  await waitFor(() => expect(oldConfig).toBeTruthy());
  fill("Search products", "new");
  await submit();
  await screen.findByRole("heading", { name: "New Mug" });
  expect(oldConfig.signal.aborted).toBe(true);
  await act(async () => resolveOld());
  expect(screen.queryByRole("heading", { name: "Old Mug" })).toBeNull();
  expect(screen.getByRole("heading", { name: "New Mug" })).toBeTruthy();
});

test("opening a product and using Back to products preserves the catalog search", async () => {
  adapter.mockImplementation(async (config) =>
    config.url.startsWith("/products/") && config.url !== "/products/search"
      ? response(config, { product: PRODUCT })
      : result(config, [PRODUCT], 25),
  );
  renderCatalog("/?q=mug&category=home&page=2");
  const user = userEvent.setup();
  await user.click(await screen.findByRole("link", { name: /Everyday Mug/ }));
  await screen.findByRole("heading", { name: "About this product" });
  await user.click(screen.getByRole("link", { name: "Back to products" }));
  await screen.findByRole("heading", { name: "Search results" });
  expect(screen.getByTestId("search-url").textContent).toBe(
    "?q=mug&category=home&page=2",
  );
  expect(screen.getByLabelText("Search products").value).toBe("mug");
  await waitFor(() => expect(lastSearch().params.page).toBe(2));
});

test("invalid saved options are reset before requesting results", async () => {
  renderCatalog("/?page=999999&sort=script&minPriceInPaise=-1&status=draft");
  await screen.findByText("New finds are on the way");
  expect(
    screen.getByText(/Some saved search options were invalid/),
  ).toBeTruthy();
  expect(lastSearch().params).toEqual({ page: 1, limit: 12 });
});

test("an empty page still offers Previous and the search window disables Next", async () => {
  renderCatalog("/?page=2");
  await screen.findByText("No products on this page");
  expect(screen.getByRole("button", { name: "Previous" }).disabled).toBe(false);
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "Previous" }));
  await screen.findByText("New finds are on the way");
});

test("pagination cannot request a page beyond the backend search window", async () => {
  adapter.mockImplementation(async (config) =>
    result(config, [PRODUCT], 12000),
  );
  renderCatalog("/?page=833");
  await screen.findByRole("heading", { name: PRODUCT.title });
  const results = screen.getByRole("region", { name: "All products" });
  expect(within(results).getByRole("button", { name: "Next" }).disabled).toBe(
    true,
  );
  expect(
    within(results).getByText("Narrow your search to explore more matches."),
  ).toBeTruthy();
});
