import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { getProductSuggestions } from "../../services/marketplaceService.js";

const ProductSearchInput = ({ fieldProps, inputClass }) => {
  const [focused, setFocused] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [result, setResult] = useState({ query: "", items: [] });
  const navigate = useNavigate();
  const { search } = useLocation();
  const query = fieldProps.value.trim();
  const items =
    focused && query.length >= 2 && result.query === query ? result.items : [];
  const showError = focused && result.query === query && result.error;

  useEffect(() => {
    if (!focused || query.length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      getProductSuggestions(query, { signal: controller.signal })
        .then((suggestions) => {
          if (!controller.signal.aborted)
            setResult({ query, items: suggestions });
        })
        .catch(() => {
          if (!controller.signal.aborted)
            setResult({ query, items: [], error: true });
        });
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, focused]);

  const choose = (product) => {
    setFocused(false);
    navigate(`/products/${product.id}`, { state: { catalogSearch: search } });
  };
  const keyDown = (event) => {
    if (event.key === "Escape") {
      setFocused(false);
      setSelectedIndex(-1);
    }
    if (!items.length) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSelectedIndex((current) => (current + 1) % items.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setSelectedIndex((current) =>
        current <= 0 ? items.length - 1 : current - 1,
      );
    } else if (
      event.key === "Enter" &&
      selectedIndex >= 0 &&
      selectedIndex < items.length
    ) {
      event.preventDefault();
      choose(items[selectedIndex]);
    }
  };

  return (
    <div className="relative">
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        className="pointer-events-none absolute top-3 left-3 h-5 w-5 text-muted"
      >
        <circle cx="10.5" cy="10.5" r="6.5" />
        <path d="m16 16 4.5 4.5" />
      </svg>
      <input
        {...fieldProps}
        type="search"
        maxLength={100}
        placeholder="Search products or stores"
        className={`${inputClass} pl-10`}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={items.length > 0}
        aria-controls={items.length > 0 ? "product-suggestions" : undefined}
        aria-activedescendant={
          selectedIndex >= 0 && items[selectedIndex]
            ? `product-suggestion-${selectedIndex}`
            : undefined
        }
        autoComplete="off"
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          setSelectedIndex(-1);
        }}
        onKeyDown={keyDown}
        onChange={(event) => {
          setSelectedIndex(-1);
          setFocused(true);
          fieldProps.onChange(event);
        }}
      />
      {showError && (
        <p
          role="status"
          className="absolute z-20 mt-1 w-full rounded-lg border border-line bg-white px-4 py-3 text-sm text-muted shadow-lg"
        >
          Suggestions are temporarily unavailable. You can still search.
        </p>
      )}
      {items.length > 0 && (
        <ul
          id="product-suggestions"
          role="listbox"
          aria-label="Product suggestions"
          className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-line bg-white shadow-lg"
        >
          {items.map((product, index) => (
            <li
              key={product.id}
              id={`product-suggestion-${index}`}
              role="option"
              aria-selected={selectedIndex === index}
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => choose(product)}
              className={`w-full cursor-pointer px-4 py-3 text-left text-sm hover:bg-canvas ${selectedIndex === index ? "bg-canvas" : ""}`}
            >
              <span className="block font-semibold text-ink">
                {product.title}
              </span>
              <span className="mt-0.5 block text-xs text-muted">
                {product.storeName}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
export { ProductSearchInput };
