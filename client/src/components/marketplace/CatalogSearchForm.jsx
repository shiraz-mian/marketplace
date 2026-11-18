import { useState } from "react";
import { Button, Feedback } from "./ui.jsx";
import {
  CATALOG_SORTS,
  EMPTY_CATALOG_FILTERS,
  validateCatalogFilters,
  createCatalogSearchParams,
} from "../../utils/catalogSearch.js";

const inputClass =
  "min-h-11 w-full min-w-0 rounded-lg border border-input-border bg-white px-3 py-2.5 text-sm text-ink outline-none placeholder:text-muted focus:border-brand focus:ring-2 focus:ring-brand/20";

const CatalogSearchForm = ({ initialValues, onSearch, onClear }) => {
  const [values, setValues] = useState(initialValues);
  const [errors, setErrors] = useState({});
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filterCount = [
    values.category.trim(),
    values.minPrice.trim(),
    values.maxPrice.trim(),
    values.availability !== "all",
    values.sort !== "relevance",
  ].filter(Boolean).length;
  const update = (event) => {
    const { name, value } = event.target;
    setValues((current) => ({ ...current, [name]: value }));
    setErrors((current) => ({ ...current, [name]: "" }));
  };
  const fieldProps = (name) => ({
    id: `catalog-${name}`,
    name,
    value: values[name],
    onChange: update,
    "aria-invalid": Boolean(errors[name]),
    "aria-describedby": errors[name] ? `catalog-${name}-error` : undefined,
  });
  const fieldError = (name) =>
    errors[name] ? (
      <p
        id={`catalog-${name}-error`}
        className="mt-2 text-xs leading-relaxed text-danger"
      >
        {errors[name]}
      </p>
    ) : null;
  const submit = (event) => {
    event.preventDefault();
    const nextErrors = validateCatalogFilters(values);
    setErrors(nextErrors);
    const firstError = Object.keys(nextErrors)[0];
    if (firstError) {
      const form = event.currentTarget;
      if (firstError !== "q" && !filtersOpen) {
        setFiltersOpen(true);
        requestAnimationFrame(() => {
          if (form.isConnected) form.elements.namedItem(firstError)?.focus();
        });
      } else form.elements.namedItem(firstError)?.focus();
      return;
    }
    onSearch(createCatalogSearchParams(values));
  };
  const clear = () => {
    setValues({ ...EMPTY_CATALOG_FILTERS });
    setErrors({});
    setFiltersOpen(false);
    onClear();
  };

  return (
    <form
      role="search"
      aria-label="Product search"
      noValidate
      onSubmit={submit}
      className="mt-6 rounded-xl border border-line bg-white p-3 shadow-sm"
    >
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2 sm:flex">
        <div className="min-w-0 flex-1">
          <label htmlFor="catalog-q" className="sr-only">
            Search products
          </label>
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
              {...fieldProps("q")}
              type="search"
              maxLength={100}
              placeholder="Search products or stores"
              className={`${inputClass} pl-10`}
            />
          </div>
          {fieldError("q")}
        </div>
        <Button type="submit" className="shrink-0">
          Search
        </Button>
        <div className="col-span-2 flex items-center justify-between gap-2 sm:contents">
          <button
            type="button"
            aria-expanded={filtersOpen}
            aria-controls="catalog-filters"
            onClick={() => setFiltersOpen((open) => !open)}
            className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg border border-input-border px-3 text-sm font-semibold text-brand hover:bg-canvas"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              className="h-4 w-4"
            >
              <path d="M3 5h14M5 10h10M8 15h4" />
            </svg>
            Filters
            {filterCount > 0 && (
              <span className="rounded-full bg-brand/10 px-1.5 text-xs">
                {filterCount}
              </span>
            )}
            <svg
              aria-hidden="true"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              className={`h-3 w-3 ${filtersOpen ? "rotate-180" : ""}`}
            >
              <path d="m4 6 4 4 4-4" />
            </svg>
          </button>
          <button
            type="button"
            onClick={clear}
            className="min-h-11 shrink-0 rounded px-2 text-sm font-semibold text-brand underline underline-offset-4"
          >
            Clear all
          </button>
        </div>
      </div>
      <div
        id="catalog-filters"
        hidden={!filtersOpen}
        className="mt-3 border-t border-line pt-3"
      >
        <fieldset className="min-w-0">
          <legend className="sr-only">Product filters</legend>
          <div className="grid min-w-0 grid-cols-2 gap-3 lg:grid-cols-5">
            <div className="col-span-2 min-w-0 lg:col-span-1">
              <label
                htmlFor="catalog-category"
                className="mb-1 block text-xs font-semibold"
              >
                Category
              </label>
              <input
                {...fieldProps("category")}
                type="text"
                maxLength={50}
                placeholder="e.g. home"
                className={inputClass}
              />
              {fieldError("category")}
            </div>
            <div className="min-w-0">
              <label
                htmlFor="catalog-minPrice"
                className="mb-1 block text-xs font-semibold"
              >
                Min price (₹)
              </label>
              <input
                {...fieldProps("minPrice")}
                type="text"
                inputMode="decimal"
                maxLength={10}
                placeholder="0.00"
                className={inputClass}
              />
              {fieldError("minPrice")}
            </div>
            <div className="min-w-0">
              <label
                htmlFor="catalog-maxPrice"
                className="mb-1 block text-xs font-semibold"
              >
                Max price (₹)
              </label>
              <input
                {...fieldProps("maxPrice")}
                type="text"
                inputMode="decimal"
                maxLength={10}
                placeholder="Any price"
                className={inputClass}
              />
              {fieldError("maxPrice")}
            </div>
            <div className="min-w-0">
              <label
                htmlFor="catalog-availability"
                className="mb-1 block text-xs font-semibold"
              >
                Availability
              </label>
              <select {...fieldProps("availability")} className={inputClass}>
                <option value="all">Any stock</option>
                <option value="in">In stock</option>
                <option value="out">Out of stock</option>
              </select>
            </div>
            <div className="min-w-0">
              <label
                htmlFor="catalog-sort"
                className="mb-1 block text-xs font-semibold"
              >
                Sort by
              </label>
              <select {...fieldProps("sort")} className={inputClass}>
                {CATALOG_SORTS.map(({ value, label }) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </fieldset>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs leading-relaxed text-muted">
            Category names must match the product category.
          </p>
          <Button type="submit">Apply filters</Button>
        </div>
      </div>
      <Feedback
        error
        message={
          Object.values(errors).some(Boolean)
            ? "Check the highlighted filters."
            : ""
        }
      />
    </form>
  );
};

export { CatalogSearchForm };
