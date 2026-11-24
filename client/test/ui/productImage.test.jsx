import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { ProductImage } from "../../src/components/marketplace/ui.jsx";
import {
  getCatalogProduct,
  getMyProduct,
} from "../../src/services/marketplaceService.js";

vi.mock("../../src/services/marketplaceService.js", () => ({
  getCatalogProduct: vi.fn(),
  getMyProduct: vi.fn(),
}));

describe("product images", () => {
  test.each([
    [false, getCatalogProduct],
    [true, getMyProduct],
  ])(
    "refreshes an expired image URL (vendor: %s)",
    async (vendor, loadProduct) => {
      loadProduct.mockResolvedValueOnce({
        imageUrl: "https://example.test/new",
      });
      render(
        <ProductImage
          src="https://example.test/old"
          title="Lamp"
          productId="123"
          vendor={vendor}
        />,
      );
      fireEvent.error(screen.getByRole("img"));
      await waitFor(() =>
        expect(screen.getByRole("img").getAttribute("src")).toBe(
          "https://example.test/new",
        ),
      );
      expect(loadProduct).toHaveBeenCalledWith("123");
      fireEvent.error(screen.getByRole("img"));
      expect(screen.getByText("No image available")).toBeTruthy();
    },
  );
});
