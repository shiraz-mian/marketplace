import { AxiosError, isCancel } from "axios";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiClient } from "../src/api/apiClient.js";
import { getCatalogSearch } from "../src/services/catalogRequest.js";

const responseError = (status) =>
  new AxiosError("Request failed", "ERR_BAD_RESPONSE", undefined, undefined, {
    status,
  });

describe("catalog startup retry", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("retries a temporary gateway error and returns the products", async () => {
    const response = { status: 200, data: { success: true } };
    const get = vi
      .spyOn(apiClient, "get")
      .mockRejectedValueOnce(responseError(502))
      .mockResolvedValueOnce(response);
    const request = getCatalogSearch({ q: "shirt" });
    await vi.advanceTimersByTimeAsync(5000);
    await expect(request).resolves.toBe(response);
    expect(get).toHaveBeenCalledTimes(2);
    expect(get).toHaveBeenLastCalledWith(
      "/products/search",
      expect.objectContaining({ params: { q: "shirt" } }),
    );
  });

  it("does not retry an invalid request", async () => {
    const error = responseError(422);
    const get = vi.spyOn(apiClient, "get").mockRejectedValue(error);
    await expect(getCatalogSearch({})).rejects.toBe(error);
    expect(get).toHaveBeenCalledTimes(1);
  });

  it("stops waiting when the request is canceled", async () => {
    const get = vi
      .spyOn(apiClient, "get")
      .mockRejectedValue(responseError(502));
    const controller = new AbortController();
    const request = getCatalogSearch({}, { signal: controller.signal });
    const result = request.catch((error) => error);
    await vi.advanceTimersByTimeAsync(0);
    controller.abort();
    expect(isCancel(await result)).toBe(true);
    await vi.advanceTimersByTimeAsync(10000);
    expect(get).toHaveBeenCalledTimes(1);
  });

  it("stops retrying after the wait limit", async () => {
    const error = responseError(502);
    const get = vi.spyOn(apiClient, "get").mockRejectedValue(error);
    const result = getCatalogSearch({}).catch((failure) => failure);
    await vi.advanceTimersByTimeAsync(90000);
    expect(await result).toBe(error);
    expect(get).toHaveBeenCalledTimes(18);
  });
});
