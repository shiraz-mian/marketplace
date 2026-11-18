import { apiClient, protectedApiClient } from "../api/apiClient.js";

const CSRF_HEADERS = { "X-Requested-With": "XMLHttpRequest" };

const isPublicUser = (user) =>
  typeof user?.id === "string" &&
  user.id.length > 0 &&
  typeof user.name === "string" &&
  typeof user.email === "string" &&
  Array.isArray(user.roles) &&
  user.roles.every((role) => typeof role === "string");

const readAuthResponse = ({ data, status }) => {
  const auth = data?.data;
  if (
    status !== 200 ||
    data?.success !== true ||
    !isPublicUser(auth?.user) ||
    typeof auth.accessToken !== "string" ||
    !auth.accessToken ||
    auth.tokenType !== "Bearer" ||
    !Number.isInteger(auth.expiresIn) ||
    auth.expiresIn <= 0
  ) {
    throw new Error("Unexpected authentication response.");
  }
  return auth;
};

const registerCustomer = async ({ name, email, password }) => {
  const { data, status } = await apiClient.post("/auth/register", {
    name,
    email,
    password,
  });

  if (status !== 201 || data?.success !== true || !data.data?.user?.id) {
    throw new Error("Unexpected registration response.");
  }

  return data;
};

const loginCustomer = async ({ email, password }) => {
  const response = await apiClient.post("/auth/login", { email, password });
  return readAuthResponse(response);
};

const refreshCustomer = async () => {
  const response = await apiClient.post(
    "/auth/refresh",
    {},
    { headers: CSRF_HEADERS },
  );
  return readAuthResponse(response);
};

const logoutCustomer = async () => {
  const { data, status } = await apiClient.post(
    "/auth/logout",
    {},
    { headers: CSRF_HEADERS },
  );
  if (status !== 200 || data?.success !== true) {
    throw new Error("Unexpected logout response.");
  }
};

const getCurrentCustomer = async () => {
  const { data, status } = await protectedApiClient.get("/auth/me");
  if (
    status !== 200 ||
    data?.success !== true ||
    !isPublicUser(data.data?.user)
  ) {
    throw new Error("Unexpected account response.");
  }
  return data.data.user;
};

export {
  registerCustomer,
  loginCustomer,
  refreshCustomer,
  logoutCustomer,
  getCurrentCustomer,
};
