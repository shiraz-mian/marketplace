import { apiClient } from "../api/apiClient.js";

const getBackendHealth = async ({ signal } = {}) => {
  const { data } = await apiClient.get("/health", { signal });

  return data;
};

export { getBackendHealth };
