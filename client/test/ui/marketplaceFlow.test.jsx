import { StrictMode } from "react";
import { AxiosError } from "axios";
import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, expect, test, vi } from "vitest";
import { App } from "../../src/App.jsx";
import { AuthProvider } from "../../src/context/AuthProvider.jsx";
import { apiClient, protectedApiClient } from "../../src/api/apiClient.js";
import { useResource } from "../../src/hooks/useResource.js";

const USER = {
  id: "507f1f77bcf86cd799439011",
  name: "Demo Customer",
  email: "customer@example.com",
  roles: ["customer"],
  status: "active",
};
const VENDOR = {
  id: "507f1f77bcf86cd799439012",
  storeName: "Everyday Store",
  description: "Thoughtful essentials for your home and everyday life.",
  status: "pending",
};
const PRODUCT = {
  id: "507f1f77bcf86cd799439013",
  vendorId: VENDOR.id,
  storeName: VENDOR.storeName,
  title: "Everyday Mug",
  description: "A durable ceramic mug for your everyday tea and coffee.",
  category: "home",
  priceInPaise: 49999,
  currency: "INR",
  stock: 12,
  status: "draft",
  imageUrl: null,
};
const pagination = (total) => ({
  page: 1,
  limit: 12,
  total,
  totalPages: total ? 1 : 0,
});
const respond = (config, data, status = 200) => {
  const response = {
    config,
    data,
    status,
    statusText: String(status),
    headers: {},
  };
  if (status >= 400)
    throw new AxiosError(
      "Private transport detail",
      AxiosError.ERR_BAD_REQUEST,
      config,
      null,
      response,
    );
  return response;
};
const ok = (config, data, status) =>
  respond(config, { success: true, data }, status);
const fail = (config, status, code) =>
  respond(
    config,
    {
      success: false,
      error: { code, message: "DO_NOT_EXPOSE_INTERNAL_DETAILS" },
    },
    status,
  );
let currentUser;
let publicAdapter;
let protectedAdapter;

beforeEach(() => {
  currentUser = { ...USER, roles: ["customer"] };
  publicAdapter = vi.fn(async (config) => {
    if (config.url === "/auth/refresh")
      return ok(config, {
        user: currentUser,
        accessToken: "test-access",
        tokenType: "Bearer",
        expiresIn: 900,
      });
    return ok(config, { products: [], pagination: pagination(0) });
  });
  protectedAdapter = vi.fn(async (config) => {
    if (config.url === "/auth/me") return ok(config, { user: currentUser });
    if (config.url === "/vendors/me")
      return fail(config, 404, "VENDOR_APPLICATION_NOT_FOUND");
    return ok(config, {});
  });
  apiClient.defaults.adapter = publicAdapter;
  protectedApiClient.defaults.adapter = protectedAdapter;
});

const renderApp = (path) =>
  render(
    <StrictMode>
      <MemoryRouter initialEntries={[path]}>
        <AuthProvider>
          <App />
        </AuthProvider>
      </MemoryRouter>
    </StrictMode>,
  );
const fill = (label, value) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

test("changing a resource hides old product data and ignores updates from the previous loader", async () => {
  let previousSignal;
  const first = (signal) => {
    previousSignal = signal;
    return Promise.resolve("first product");
  };
  let resolveSecond;
  const waiting = new Promise((resolve) => {
    resolveSecond = resolve;
  });
  const second = () => waiting;
  const { result, rerender } = renderHook(({ loader }) => useResource(loader), {
    initialProps: { loader: first },
  });
  await waitFor(() => expect(result.current.data).toBe("first product"));
  const staleUpdate = result.current.replaceData;
  rerender({ loader: second });
  expect(result.current.loading).toBe(true);
  expect(result.current.data).toBeNull();
  expect(previousSignal.aborted).toBe(true);
  await act(async () => resolveSecond("second product"));
  act(() => staleUpdate("late first product update"));
  expect(result.current.data).toBe("second product");
});

test("a customer submits an application and sees pending status without seller controls", async () => {
  protectedAdapter.mockImplementation(async (config) =>
    config.url === "/vendors/apply"
      ? ok(config, { vendor: VENDOR }, 201)
      : fail(config, 404, "VENDOR_APPLICATION_NOT_FOUND"),
  );
  renderApp("/vendor/apply");
  await screen.findByLabelText("Store name");
  fill("Store name", VENDOR.storeName);
  fill("About your store", VENDOR.description);
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "Submit application" }));
  await screen.findByText("Your application is awaiting review.");
  expect(screen.queryByRole("link", { name: "Manage products" })).toBeNull();
  const call = protectedAdapter.mock.calls.find(
    ([config]) => config.url === "/vendors/apply",
  )[0];
  expect(JSON.parse(call.data)).toEqual({
    storeName: VENDOR.storeName,
    description: VENDOR.description,
  });
  expect(call.headers.get("Authorization")).toBe("Bearer test-access");
});

test("checking an approved application refreshes the user's permissions before opening seller tools", async () => {
  let approved = false;
  protectedAdapter.mockImplementation(async (config) => {
    if (config.url === "/auth/me") {
      currentUser = { ...currentUser, roles: ["customer", "vendor"] };
      return ok(config, { user: currentUser });
    }
    if (config.url === "/vendors/me")
      return ok(config, {
        vendor: { ...VENDOR, status: approved ? "approved" : "pending" },
      });
    return ok(config, { products: [], pagination: pagination(0) });
  });
  renderApp("/vendor/apply");
  await screen.findByText("Your application is awaiting review.");
  approved = true;
  const user = userEvent.setup();
  await user.click(
    screen.getByRole("button", { name: "Check application status" }),
  );
  await user.click(
    await screen.findByRole("link", { name: "Manage products" }),
  );
  await screen.findByRole("heading", { name: "Your products" });
  await screen.findByText("Make your first listing");
});

test("non-admin navigation is blocked before the admin API is called", async () => {
  renderApp("/admin/vendors");
  await screen.findByRole("heading", { name: "Permission required" });
  expect(
    protectedAdapter.mock.calls.some(
      ([config]) => config.url === "/admin/vendors",
    ),
  ).toBe(false);
});

test("an admin approves an application once and the list reloads", async () => {
  currentUser.roles = ["customer", "admin"];
  let decided = false;
  let resolveReview;
  const waiting = new Promise((resolve) => {
    resolveReview = resolve;
  });
  protectedAdapter.mockImplementation(async (config) => {
    if (config.method === "patch") {
      await waiting;
      decided = true;
      return ok(config, { vendor: { ...VENDOR, status: "approved" } });
    }
    return ok(config, {
      vendors: decided ? [] : [VENDOR],
      pagination: pagination(decided ? 0 : 1),
    });
  });
  renderApp("/admin/vendors");
  const button = await screen.findByRole("button", {
    name: "Approve Everyday Store",
  });
  const user = userEvent.setup();
  await user.click(button);
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Saving decision…" }).disabled,
    ).toBe(true),
  );
  expect(
    screen.getByRole("button", { name: "Reject Everyday Store" }).disabled,
  ).toBe(true);
  await act(async () => resolveReview());
  await screen.findByText("Everyday Store: application approved.");
  await screen.findByText("No applications here");
  const patch = protectedAdapter.mock.calls.find(
    ([config]) => config.method === "patch",
  )[0];
  expect(JSON.parse(patch.data)).toEqual({ status: "approved" });
  expect(
    protectedAdapter.mock.calls.filter(([config]) => config.method === "patch"),
  ).toHaveLength(1);
});

test("an approved vendor creates a product using exact paise and continues to image editing", async () => {
  currentUser.roles = ["customer", "vendor"];
  protectedAdapter.mockImplementation(async (config) =>
    config.method === "post"
      ? ok(config, { product: PRODUCT }, 201)
      : ok(config, { product: PRODUCT }),
  );
  renderApp("/vendor/products/new");
  await screen.findByLabelText("Product title");
  fill("Product title", PRODUCT.title);
  fill("Description", PRODUCT.description);
  fill("Category", "Home");
  fill("Price (INR)", "499.99");
  fill("Stock quantity", "12");
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "Create product" }));
  await screen.findByRole("heading", { name: "Edit product" });
  await screen.findByLabelText("Choose cover image");
  const call = protectedAdapter.mock.calls.find(
    ([config]) => config.method === "post",
  )[0];
  expect(JSON.parse(call.data)).toEqual({
    title: PRODUCT.title,
    description: PRODUCT.description,
    category: "Home",
    priceInPaise: 49999,
    stock: 12,
    status: "draft",
  });
});

test("unavailable image storage keeps the product usable and exposes no backend details", async () => {
  currentUser.roles = ["customer", "vendor"];
  protectedAdapter.mockImplementation(async (config) =>
    config.url.endsWith("/image")
      ? fail(config, 503, "IMAGE_STORAGE_UNAVAILABLE")
      : ok(config, { product: PRODUCT }),
  );
  renderApp(`/vendor/products/${PRODUCT.id}/edit`);
  await screen.findByLabelText("Choose cover image");
  const user = userEvent.setup();
  await user.upload(
    screen.getByLabelText("Choose cover image"),
    new File(["fake bytes for the HTTP adapter"], "mug.png", {
      type: "image/png",
    }),
  );
  await user.click(screen.getByRole("button", { name: "Upload image" }));
  const alert = await screen.findByRole("alert");
  expect(alert.textContent).toContain(
    "Image uploads are currently unavailable",
  );
  expect(alert.textContent).not.toContain("DO_NOT_EXPOSE");
  expect(screen.getByRole("button", { name: "Save changes" }).disabled).toBe(
    false,
  );
  expect(screen.getByLabelText("Product title").value).toBe(PRODUCT.title);
  const call = protectedAdapter.mock.calls.find(([config]) =>
    config.url.endsWith("/image"),
  )[0];
  expect(call.data.get("image").name).toBe("mug.png");
});

test("a vendor archives a listing and the visible list updates", async () => {
  currentUser.roles = ["customer", "vendor"];
  let archived = false;
  protectedAdapter.mockImplementation(async (config) => {
    if (config.method === "delete") {
      archived = true;
      return respond(config, null, 204);
    }
    return ok(config, {
      products: archived ? [] : [PRODUCT],
      pagination: pagination(archived ? 0 : 1),
    });
  });
  renderApp("/vendor/products");
  await userEvent
    .setup()
    .click(await screen.findByRole("button", { name: "Archive Everyday Mug" }));
  await screen.findByText("Everyday Mug was archived.");
  await screen.findByText("Make your first listing");
});

test("the public catalog and detail page display product data without signing in", async () => {
  publicAdapter.mockImplementation(async (config) => {
    if (config.url === "/auth/refresh")
      return fail(config, 401, "INVALID_REFRESH_TOKEN");
    return config.url === "/products/search"
      ? ok(config, {
          products: [{ ...PRODUCT, status: "active" }],
          pagination: pagination(1),
        })
      : ok(config, { product: { ...PRODUCT, status: "active" } });
  });
  renderApp("/");
  await screen.findByText("₹499.99");
  await userEvent
    .setup()
    .click(screen.getByRole("link", { name: /Everyday Mug/ }));
  await screen.findByRole("heading", { name: "About this product" });
  expect(screen.getByText(PRODUCT.description)).toBeDefined();
  expect(screen.getByText("Sold by Everyday Store")).toBeDefined();
});
