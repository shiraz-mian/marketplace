import { useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router";
import { beforeEach, expect, test, vi } from "vitest";
import { ProductSearchInput } from "../../src/components/marketplace/ProductSearchInput.jsx";
import { getProductSuggestions } from "../../src/services/marketplaceService.js";

vi.mock("../../src/services/marketplaceService.js", () => ({
  getProductSuggestions: vi.fn(),
}));
const product = {
  id: "507f1f77bcf86cd799439011",
  title: "Ceramic Mug",
  storeName: "Everyday Store",
};
const Example = () => {
  const [value, setValue] = useState("");
  const location = useLocation();
  return (
    <>
      <label htmlFor="catalog-q">Search products</label>
      <ProductSearchInput
        inputClass=""
        fieldProps={{
          id: "catalog-q",
          value,
          onChange: (event) => setValue(event.target.value),
        }}
      />
      <output data-testid="location">{location.pathname}</output>
    </>
  );
};
beforeEach(() => {
  vi.clearAllMocks();
  getProductSuggestions.mockResolvedValue([product]);
});

test("shows suggestions while typing and navigates on keyboard selection", async () => {
  const user = userEvent.setup();
  render(
    <MemoryRouter>
      <Example />
    </MemoryRouter>,
  );
  const input = screen.getByRole("combobox", { name: "Search products" });
  await user.type(input, "ce");
  expect(
    await screen.findByRole("option", { name: /Ceramic Mug/ }),
  ).toBeTruthy();
  expect(getProductSuggestions).toHaveBeenCalledWith(
    "ce",
    expect.objectContaining({ signal: expect.any(AbortSignal) }),
  );
  await user.keyboard("{ArrowDown}{Enter}");
  expect(screen.getByTestId("location").textContent).toBe(
    `/products/${product.id}`,
  );
});
test("does not show stale suggestions after a query changes", async () => {
  const user = userEvent.setup();
  let finishFirst;
  getProductSuggestions.mockImplementation((q) =>
    q === "ce"
      ? new Promise((resolve) => {
          finishFirst = resolve;
        })
      : Promise.resolve([]),
  );
  render(
    <MemoryRouter>
      <Example />
    </MemoryRouter>,
  );
  const input = screen.getByRole("combobox", { name: "Search products" });
  await user.type(input, "ce");
  await waitFor(() => expect(finishFirst).toBeTypeOf("function"));
  await user.type(input, "r");
  finishFirst([product]);
  await waitFor(() => expect(getProductSuggestions).toHaveBeenCalledTimes(2));
  expect(screen.queryByRole("option")).toBeNull();
});

test("mouse selection opens the suggested product", async () => {
  const user = userEvent.setup();
  render(
    <MemoryRouter>
      <Example />
    </MemoryRouter>,
  );
  await user.type(
    screen.getByRole("combobox", { name: "Search products" }),
    "ce",
  );
  await user.click(await screen.findByRole("option", { name: /Ceramic Mug/ }));
  expect(screen.getByTestId("location").textContent).toBe(
    `/products/${product.id}`,
  );
});

test("escape dismisses suggestions and typing opens them again", async () => {
  const user = userEvent.setup();
  render(
    <MemoryRouter>
      <Example />
    </MemoryRouter>,
  );
  const input = screen.getByRole("combobox", { name: "Search products" });
  await user.type(input, "ce");
  await screen.findByRole("option", { name: /Ceramic Mug/ });
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("option")).toBeNull();
  await user.type(input, "r");
  expect(
    await screen.findByRole("option", { name: /Ceramic Mug/ }),
  ).toBeTruthy();
});

test("shows a clear message when suggestions are unavailable", async () => {
  const user = userEvent.setup();
  getProductSuggestions.mockRejectedValue(new Error("Search unavailable"));
  render(
    <MemoryRouter>
      <Example />
    </MemoryRouter>,
  );
  await user.type(
    screen.getByRole("combobox", { name: "Search products" }),
    "ce",
  );
  expect(
    await screen.findByText(
      "Suggestions are temporarily unavailable. You can still search.",
    ),
  ).toBeTruthy();
});
