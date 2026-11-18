import { Button, EmptyState, Feedback, Pagination } from "./ui.jsx";
import { CatalogProductCard } from "./CatalogProductCard.jsx";
import { MAX_SEARCH_PAGE } from "../../utils/catalogSearch.js";

const CatalogResults = ({
  resource,
  hasFilters,
  catalogSearch,
  onPageChange,
  onClear,
}) => {
  const { data, loading, error, reload } = resource;
  return (
    <section
      aria-labelledby="catalog-results-title"
      aria-busy={loading}
      className="mt-9"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="catalog-results-title" className="text-xl font-semibold">
          {hasFilters ? "Search results" : "All products"}
        </h2>
        <p aria-live="polite" aria-atomic="true" className="text-sm text-muted">
          {loading
            ? "Searching products…"
            : data
              ? `${data.pagination.total} ${data.pagination.total === 1 ? "product" : "products"} found`
              : ""}
        </p>
      </div>
      <Feedback message={error} error />
      {error && (
        <Button secondary onClick={reload}>
          Try again
        </Button>
      )}
      {loading ? (
        <p role="status" className="py-10 text-sm text-muted">
          Loading products. This may take a moment.
        </p>
      ) : (
        data && (
          <>
            {data.products.length ? (
              <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {data.products.map((product) => (
                  <CatalogProductCard
                    key={product.id}
                    product={product}
                    catalogSearch={catalogSearch}
                  />
                ))}
              </div>
            ) : (
              <div className="mt-6">
                <EmptyState
                  title={
                    hasFilters
                      ? "No products match your search"
                      : data.pagination.page > 1
                        ? "No products on this page"
                        : "New finds are on the way"
                  }
                >
                  <p>
                    {hasFilters
                      ? "Try different keywords, a wider price range, or fewer filters."
                      : "Check back soon for products from our sellers."}
                  </p>
                  {hasFilters && (
                    <Button secondary className="mt-5" onClick={onClear}>
                      Clear search
                    </Button>
                  )}
                </EmptyState>
              </div>
            )}
            {(data.pagination.total > 0 || data.pagination.page > 1) && (
              <Pagination
                pagination={data.pagination}
                onPageChange={onPageChange}
                busy={loading}
                maxPage={MAX_SEARCH_PAGE}
              />
            )}
            {data.pagination.totalPages > MAX_SEARCH_PAGE && (
              <p className="mt-3 text-sm text-muted">
                Narrow your search to explore more matches.
              </p>
            )}
          </>
        )
      )}
    </section>
  );
};

export { CatalogResults };
