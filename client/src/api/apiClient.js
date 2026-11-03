import axios from "axios";

const apiClient = axios.create({
  baseURL: "/api",
  timeout: 10000,
  withCredentials: true,
});

// Public auth requests must not trigger the protected client's refresh logic.
const protectedApiClient = axios.create({
  baseURL: "/api",
  timeout: 10000,
  withCredentials: true,
});

export { apiClient, protectedApiClient };
