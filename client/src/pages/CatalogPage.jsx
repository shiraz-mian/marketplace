import { useCallback, useMemo } from "react";
import { useLocation, useSearchParams } from "react-router";
import { MarketplaceLayout } from "../components/marketplace/MarketplaceLayout.jsx";
import { Feedback } from "../components/marketplace/ui.jsx";
import { CatalogSearchForm } from "../components/marketplace/CatalogSearchForm.jsx";
import { CatalogResults } from "../components/marketplace/CatalogResults.jsx";
import { searchCatalog } from "../services/marketplaceService.js";
import { useResource } from "../hooks/useResource.js";
import {
  readCatalogSearch,
  createCatalogSearchParams,
} from "../utils/catalogSearch.js";

const CatalogPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { search } = useLocation();
  const applied = useMemo(
    () => readCatalogSearch(searchParams),
    [searchParams],
  );
  const loader = useCallback(
    (signal) => searchCatalog(applied.request, { signal }),
    [applied.request],
  );
  const resource = useResource(loader);
  const applySearch = (params) => {
    if (params.toString() === searchParams.toString()) resource.reload();
    else setSearchParams(params);
  };
  const clearSearch = () => applySearch(new URLSearchParams());
  const changePage = (page) =>
    setSearchParams(createCatalogSearchParams(applied.values, page));
  return (
    <MarketplaceLayout
      title={
        applied.values.q ? `${applied.values.q} | Marketplace` : "Marketplace"
      }
    >
      <p className="text-[10px] font-semibold tracking-wider text-accent uppercase sm:text-xs">
        Independent stores. Everyday finds.
      </p>
      <h1 className="mt-2 max-w-2xl text-2xl leading-tight font-bold tracking-tight sm:text-3xl">
        Discover your next great find.
      </h1>
      <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">
        Explore products from our community of sellers.
      </p>
      <CatalogSearchForm
        key={search}
        initialValues={applied.values}
        onSearch={applySearch}
        onClear={clearSearch}
      />
      <Feedback
        message={
          applied.invalid
            ? "Some saved search options were invalid and have been reset. Review the filters above."
            : ""
        }
      />
      <CatalogResults
        resource={resource}
        hasFilters={applied.hasFilters}
        catalogSearch={search}
        onPageChange={changePage}
        onClear={clearSearch}
      />
    </MarketplaceLayout>
  );
};

export { CatalogPage };
