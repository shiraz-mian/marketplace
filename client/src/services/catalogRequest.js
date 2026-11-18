import { CanceledError, isAxiosError, isCancel } from "axios";
import { apiClient } from "../api/apiClient.js";

const MAX_WAIT_MS = 90000;
const RETRY_DELAY_MS = 5000;
const RETRYABLE_STATUSES = [502, 503, 504];

const waitForRetry = (delay, signal) =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new CanceledError("Product loading was canceled."));
      return;
    }
    const cancel = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", cancel);
      reject(new CanceledError("Product loading was canceled."));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", cancel);
      resolve();
    }, delay);
    signal?.addEventListener("abort", cancel, { once: true });
  });

const getCatalogSearch = async (params, { signal } = {}) => {
  const deadline = Date.now() + MAX_WAIT_MS;
  while (true) {
    try {
      return await apiClient.get("/products/search", {
        params,
        signal,
        timeout: Math.max(1, Math.min(10000, deadline - Date.now())),
      });
    } catch (error) {
      const retryable =
        isAxiosError(error) &&
        !isCancel(error) &&
        (!error.response ||
          (RETRYABLE_STATUSES.includes(error.response.status) &&
            !error.response.data?.error?.code));
      const remaining = deadline - Date.now();
      if (!retryable || remaining <= 0) throw error;
      await waitForRetry(Math.min(RETRY_DELAY_MS, remaining), signal);
      if (Date.now() >= deadline) throw error;
    }
  }
};

export { getCatalogSearch };
