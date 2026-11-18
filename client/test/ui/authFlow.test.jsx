import { StrictMode } from "react";
import { AxiosError } from "axios";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router";
import { beforeEach, expect, test, vi } from "vitest";
import { App } from "../../src/App.jsx";
import { apiClient, protectedApiClient } from "../../src/api/apiClient.js";
import { AuthProvider } from "../../src/context/AuthProvider.jsx";
import { getCurrentCustomer } from "../../src/services/authService.js";

const USER = {
  id: "507f1f77bcf86cd799439011",
  name: "Demo Customer",
  email: "customer@example.com",
  roles: ["customer"],
  status: "active",
};
const AUTH = {
  user: USER,
  accessToken: "test-access-one",
  tokenType: "Bearer",
  expiresIn: 900,
};

const response = (config, data, status = 200) => {
  const result = {
    config,
    data,
    status,
    statusText: String(status),
    headers: {},
  };
  if (status >= 400)
    throw new AxiosError(
      "Request rejected",
      AxiosError.ERR_BAD_REQUEST,
      config,
      null,
      result,
    );
  return result;
};
const success = (config, data = AUTH, status = 200) =>
  response(config, { success: true, data }, status);
const catalogSuccess = (config) =>
  success(config, {
    products: [],
    pagination: { page: 1, limit: 12, total: 0, totalPages: 0 },
  });
const failure = (config, status = 401, code = "INVALID_REFRESH_TOKEN") =>
  response(
    config,
    { success: false, error: { code, message: "private backend detail" } },
    status,
  );
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

let publicAdapter;
let protectedAdapter;

beforeEach(() => {
  publicAdapter = vi.fn(async (config) => failure(config));
  protectedAdapter = vi.fn(async (config) => success(config, { user: USER }));
  apiClient.defaults.adapter = publicAdapter;
  protectedApiClient.defaults.adapter = protectedAdapter;
});

const Location = () => {
  const { pathname } = useLocation();
  return <span aria-label="Current path">{pathname}</span>;
};

const renderApp = (path = "/login") =>
  render(
    <StrictMode>
      <MemoryRouter initialEntries={[path]}>
        <AuthProvider>
          <App />
          <Location />
        </AuthProvider>
      </MemoryRouter>
    </StrictMode>,
  );

const expectLogin = async () => {
  await screen.findByRole("heading", { name: "Welcome back" });
  expect(screen.getByLabelText("Current path").textContent).toBe("/login");
};

const fillLogin = async (password = "  a correct password with spaces  ") => {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Email address"), USER.email);
  await user.type(screen.getByLabelText("Password"), password);
  return user;
};

test("restores sign-in once under StrictMode and keeps account content hidden while checking", async () => {
  const pending = deferred();
  publicAdapter.mockImplementation((config) =>
    pending.promise.then(() => success(config)),
  );
  renderApp("/account");
  expect(screen.getByRole("status").textContent).toContain("Checking");
  expect(screen.queryByRole("heading", { name: /Welcome,/ })).toBeNull();
  await act(async () => pending.resolve());
  await screen.findByRole("heading", { name: "Welcome, Demo Customer" });
  expect(publicAdapter).toHaveBeenCalledTimes(1);
  const config = publicAdapter.mock.calls[0][0];
  expect(config.url).toBe("/auth/refresh");
  expect(config.withCredentials).toBe(true);
  expect(config.headers.get("X-Requested-With")).toBe("XMLHttpRequest");
  expect(config.headers.get("Authorization")).toBeUndefined();
  expect(localStorage.length).toBe(0);
  expect(sessionStorage.length).toBe(0);
});

test("redirects a guest away from the account and navigates between both auth pages", async () => {
  renderApp("/account");
  await expectLogin();
  const user = userEvent.setup();
  await user.click(screen.getByRole("link", { name: "Create an account" }));
  await screen.findByRole("heading", { name: "Create your account" });
  await user.click(screen.getByRole("link", { name: "Sign in" }));
  await expectLogin();
});

test("registration still creates a customer and offers sign-in through the shared layout", async () => {
  publicAdapter.mockImplementation(async (config) =>
    config.url === "/auth/register"
      ? success(config, { user: USER }, 201)
      : failure(config),
  );
  renderApp("/register");
  await screen.findByRole("heading", { name: "Create your account" });
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Full name"), USER.name);
  await user.type(screen.getByLabelText("Email address"), USER.email);
  await user.type(
    screen.getByLabelText("Password"),
    "a valid registration password",
  );
  await user.click(screen.getByRole("button", { name: /Create account/ }));
  expect((await screen.findByRole("status")).textContent).toContain(
    "Your account is ready",
  );
  expect(screen.getByLabelText("Full name").value).toBe("");
  expect(screen.getByLabelText("Current path").textContent).toBe("/register");
  await user.click(screen.getByRole("link", { name: "Sign in" }));
  await expectLogin();
});

test("required and invalid email inputs prevent a login request", async () => {
  renderApp();
  await expectLogin();
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: /Sign in/ }));
  await user.type(screen.getByLabelText("Email address"), "not-an-email");
  await user.type(screen.getByLabelText("Password"), "password");
  await user.click(screen.getByRole("button", { name: /Sign in/ }));
  expect(
    publicAdapter.mock.calls.filter(([c]) => c.url === "/auth/login"),
  ).toHaveLength(0);
  expect(screen.getByLabelText("Email address").validity.valid).toBe(false);
});

test("signs in once, supports password visibility, disables pending controls and attaches the access token", async () => {
  const pending = deferred();
  publicAdapter.mockImplementation((config) =>
    config.url === "/auth/login"
      ? pending.promise.then(() => success(config))
      : Promise.resolve().then(() =>
          config.url === "/products/search"
            ? catalogSuccess(config)
            : failure(config),
        ),
  );
  renderApp();
  await expectLogin();
  const user = await fillLogin();
  await user.click(screen.getByRole("button", { name: "Show password" }));
  expect(screen.getByLabelText("Password").type).toBe("text");
  await user.click(screen.getByRole("button", { name: "Hide password" }));
  const form = screen.getByRole("button", { name: /Sign in/ }).closest("form");
  fireEvent.submit(form);
  fireEvent.submit(form);
  await waitFor(() =>
    expect(
      publicAdapter.mock.calls.filter(([c]) => c.url === "/auth/login"),
    ).toHaveLength(1),
  );
  expect(screen.getByRole("button", { name: /Signing in/ }).disabled).toBe(
    true,
  );
  expect(screen.getByLabelText("Email address").matches(":disabled")).toBe(
    true,
  );
  expect(
    screen.getByRole("button", { name: "Show password" }).matches(":disabled"),
  ).toBe(true);
  const config = publicAdapter.mock.calls.find(
    ([c]) => c.url === "/auth/login",
  )[0];
  expect(JSON.parse(config.data)).toEqual({
    email: USER.email,
    password: "  a correct password with spaces  ",
  });
  await act(async () => pending.resolve());
  await screen.findByRole("heading", {
    name: "Discover your next great find.",
  });
  expect(screen.getByLabelText("Current path").textContent).toBe("/");
  await user.click(screen.getByRole("link", { name: "Account" }));
  await screen.findByRole("heading", { name: "Welcome, Demo Customer" });
  await user.click(screen.getByRole("button", { name: "Refresh details" }));
  await screen.findByText("Your account details are up to date.");
  expect(protectedAdapter.mock.calls[0][0].headers.get("Authorization")).toBe(
    "Bearer test-access-one",
  );
  expect(document.body.textContent).not.toContain("test-access-one");
  expect(localStorage.length + sessionStorage.length).toBe(0);
});

test("wrong credentials show a generic error without refreshing and allow another attempt", async () => {
  publicAdapter.mockImplementation(async (config) =>
    config.url === "/auth/login"
      ? failure(config, 401, "INVALID_CREDENTIALS")
      : failure(config),
  );
  renderApp("/account");
  await expectLogin();
  const user = await fillLogin("wrong password");
  await user.click(screen.getByRole("button", { name: /Sign in/ }));
  expect((await screen.findByRole("alert")).textContent).toBe(
    "Email or password is incorrect.",
  );
  expect(screen.getByLabelText("Password").value).toBe("wrong password");
  expect(
    publicAdapter.mock.calls.filter(([c]) => c.url === "/auth/refresh"),
  ).toHaveLength(1);
  publicAdapter.mockImplementation(async (config) =>
    config.url === "/products/search"
      ? catalogSuccess(config)
      : success(config),
  );
  await user.click(screen.getByRole("button", { name: /Sign in/ }));
  await screen.findByRole("heading", {
    name: "Discover your next great find.",
  });
  expect(screen.getByLabelText("Current path").textContent).toBe("/");
});

test("a startup network failure has an explicit retry instead of assuming the user signed out", async () => {
  publicAdapter.mockRejectedValueOnce(
    new AxiosError("private transport detail", "ERR_NETWORK"),
  );
  renderApp("/account");
  expect((await screen.findByRole("alert")).textContent).toContain(
    "couldn't reach the server",
  );
  expect(screen.queryByRole("heading", { name: "Welcome back" })).toBeNull();
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "Retry connection" }));
  await expectLogin();
});

test("malformed auth responses are rejected and do not reveal protected content", async () => {
  publicAdapter.mockImplementation(async (config) =>
    success(config, { user: USER, accessToken: "" }),
  );
  renderApp("/account");
  await screen.findByRole("alert");
  expect(screen.queryByRole("heading", { name: /Welcome,/ })).toBeNull();
});

test("an expired access token refreshes and replays the account request once", async () => {
  publicAdapter.mockImplementationOnce(async (config) => success(config));
  renderApp("/account");
  await screen.findByRole("heading", { name: "Welcome, Demo Customer" });
  publicAdapter.mockImplementation(async (config) =>
    success(config, { ...AUTH, accessToken: "test-access-two" }),
  );
  protectedAdapter.mockImplementation(async (config) =>
    config.headers.get("Authorization") === "Bearer test-access-one"
      ? failure(config, 401, "TOKEN_EXPIRED")
      : success(config, { user: { ...USER, name: "Updated Customer" } }),
  );
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "Refresh details" }));
  await screen.findByRole("heading", { name: "Welcome, Updated Customer" });
  expect(publicAdapter).toHaveBeenCalledTimes(2);
  expect(protectedAdapter).toHaveBeenCalledTimes(2);
});

test("concurrent expired requests share one refresh and a late old-token response uses the new token", async () => {
  publicAdapter.mockImplementationOnce(async (config) => success(config));
  renderApp("/account");
  await screen.findByRole("heading", { name: "Welcome, Demo Customer" });
  const refreshPending = deferred();
  const lateResponse = deferred();
  publicAdapter.mockImplementation((config) =>
    refreshPending.promise.then(() =>
      success(config, { ...AUTH, accessToken: "test-access-two" }),
    ),
  );
  let oldRequests = 0;
  protectedAdapter.mockImplementation(async (config) => {
    if (config.headers.get("Authorization") === "Bearer test-access-two")
      return success(config, { user: USER });
    oldRequests += 1;
    if (oldRequests === 3) await lateResponse.promise;
    return failure(config, 401, "TOKEN_EXPIRED");
  });
  const requests = Promise.all([
    getCurrentCustomer(),
    getCurrentCustomer(),
    getCurrentCustomer(),
  ]);
  await waitFor(() => expect(publicAdapter).toHaveBeenCalledTimes(2));
  await act(async () => refreshPending.resolve());
  await waitFor(() => expect(protectedAdapter).toHaveBeenCalledTimes(5));
  await act(async () => {
    lateResponse.resolve();
    await requests;
  });
  expect(publicAdapter).toHaveBeenCalledTimes(2);
  expect(protectedAdapter).toHaveBeenCalledTimes(6);
});

test("an expired refresh token redirects to login without an infinite retry loop", async () => {
  publicAdapter.mockImplementationOnce(async (config) => success(config));
  renderApp("/account");
  await screen.findByRole("heading", { name: "Welcome, Demo Customer" });
  protectedAdapter.mockImplementation(async (config) =>
    failure(config, 401, "TOKEN_EXPIRED"),
  );
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "Refresh details" }));
  await expectLogin();
  expect(publicAdapter).toHaveBeenCalledTimes(2);
  expect(protectedAdapter).toHaveBeenCalledTimes(1);
});

test("a second protected 401 after refresh signs out and stops retrying", async () => {
  publicAdapter.mockImplementation(async (config) =>
    success(config, {
      ...AUTH,
      accessToken:
        config.url === "/auth/refresh"
          ? `test-access-${publicAdapter.mock.calls.length}`
          : AUTH.accessToken,
    }),
  );
  protectedAdapter.mockImplementation(async (config) =>
    failure(config, 401, "INVALID_TOKEN"),
  );
  renderApp("/account");
  await screen.findByRole("heading", { name: "Welcome, Demo Customer" });
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "Refresh details" }));
  await expectLogin();
  expect(protectedAdapter).toHaveBeenCalledTimes(2);
  expect(publicAdapter).toHaveBeenCalledTimes(2);
});

test("a forbidden response does not refresh or sign the user out", async () => {
  publicAdapter.mockImplementation(async (config) => success(config));
  protectedAdapter.mockImplementation(async (config) =>
    failure(config, 403, "FORBIDDEN"),
  );
  renderApp("/account");
  await screen.findByRole("heading", { name: "Welcome, Demo Customer" });
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "Refresh details" }));
  await screen.findByRole("alert");
  expect(
    screen.getByRole("heading", { name: "Welcome, Demo Customer" }),
  ).toBeDefined();
  expect(publicAdapter).toHaveBeenCalledTimes(1);
});

test("a refresh server failure keeps the user on the account page and permits retry", async () => {
  publicAdapter.mockImplementationOnce(async (config) => success(config));
  publicAdapter.mockImplementation(async (config) =>
    failure(config, 500, "INTERNAL_ERROR"),
  );
  protectedAdapter.mockImplementation(async (config) =>
    failure(config, 401, "TOKEN_EXPIRED"),
  );
  renderApp("/account");
  await screen.findByRole("heading", { name: "Welcome, Demo Customer" });
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Refresh details" }));
  expect((await screen.findByRole("alert")).textContent).not.toContain(
    "private",
  );
  expect(
    screen.getByRole("heading", { name: "Welcome, Demo Customer" }),
  ).toBeDefined();
  publicAdapter.mockImplementation(async (config) =>
    success(config, { ...AUTH, accessToken: "test-access-two" }),
  );
  protectedAdapter.mockImplementation(async (config) =>
    config.headers.get("Authorization") === "Bearer test-access-one"
      ? failure(config, 401, "TOKEN_EXPIRED")
      : success(config, { user: USER }),
  );
  await user.click(screen.getByRole("button", { name: "Refresh details" }));
  await screen.findByText("Your account details are up to date.");
});

test("logout sends the CSRF header, clears local auth and protects the account route", async () => {
  publicAdapter.mockImplementation(async (config) =>
    config.url === "/auth/logout" ? success(config, null) : success(config),
  );
  renderApp("/account");
  await screen.findByRole("heading", { name: "Welcome, Demo Customer" });
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "Sign out" }));
  await expectLogin();
  const config = publicAdapter.mock.calls.find(
    ([c]) => c.url === "/auth/logout",
  )[0];
  expect(config.headers.get("X-Requested-With")).toBe("XMLHttpRequest");
  expect(config.withCredentials).toBe(true);
  expect(config.headers.get("Authorization")).toBeUndefined();
});

test("failed logout stays visible as an error and allows an explicit retry", async () => {
  publicAdapter.mockImplementation(async (config) => {
    if (config.url === "/auth/logout")
      throw new AxiosError("private detail", "ERR_NETWORK", config);
    return success(config);
  });
  renderApp("/account");
  await screen.findByRole("heading", { name: "Welcome, Demo Customer" });
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Sign out" }));
  await screen.findByRole("alert");
  expect(
    screen.getByRole("heading", { name: "Welcome, Demo Customer" }),
  ).toBeDefined();
  publicAdapter.mockImplementation(async (config) => success(config, null));
  await user.click(screen.getByRole("button", { name: "Sign out" }));
  await expectLogin();
});

test("logout during a pending refresh cannot restore the signed-out user", async () => {
  publicAdapter.mockImplementationOnce(async (config) => success(config));
  renderApp("/account");
  await screen.findByRole("heading", { name: "Welcome, Demo Customer" });
  const pending = deferred();
  publicAdapter.mockImplementation((config) =>
    config.url === "/auth/logout"
      ? Promise.resolve(success(config, null))
      : pending.promise.then(() =>
          success(config, { ...AUTH, accessToken: "late-token" }),
        ),
  );
  protectedAdapter.mockImplementation(async (config) =>
    failure(config, 401, "TOKEN_EXPIRED"),
  );
  const request = getCurrentCustomer().catch((error) => error.code);
  await waitFor(() => expect(publicAdapter).toHaveBeenCalledTimes(2));
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "Sign out" }));
  expect(screen.getByRole("button", { name: "Signing out…" }).disabled).toBe(
    true,
  );
  expect(publicAdapter.mock.calls.some(([c]) => c.url === "/auth/logout")).toBe(
    false,
  );
  await act(async () => {
    pending.resolve();
    await request;
  });
  await expectLogin();
  expect(screen.queryByRole("heading", { name: /Welcome,/ })).toBeNull();
});
