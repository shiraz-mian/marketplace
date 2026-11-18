import { useCallback, useRef, useState } from "react";
import { Link } from "react-router";
import { MarketplaceLayout } from "../components/marketplace/MarketplaceLayout.jsx";
import {
  Button,
  EmptyState,
  Feedback,
  Loading,
  Pagination,
  ProductImage,
  StatusBadge,
} from "../components/marketplace/ui.jsx";
import { useResource } from "../hooks/useResource.js";
import {
  listMyProducts,
  archiveProduct,
} from "../services/marketplaceService.js";
import { formatPrice } from "../utils/productPrice.js";
import { getMarketplaceError } from "../utils/getMarketplaceError.js";

const VendorProductsPage = () => {
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(null);
  const [feedback, setFeedback] = useState({ message: "", error: false });
  const pending = useRef(false);
  const loader = useCallback(
    (signal) => listMyProducts({ page, limit: 12 }, { signal }),
    [page],
  );
  const resource = useResource(loader);
  const archive = async (product) => {
    if (pending.current) return;
    pending.current = true;
    setBusy(product.id);
    try {
      await archiveProduct(product.id);
      setFeedback({ message: `${product.title} was archived.`, error: false });
      setPage(1);
      resource.reload();
    } catch (error) {
      setFeedback({ message: getMarketplaceError(error), error: true });
    } finally {
      pending.current = false;
      setBusy(null);
    }
  };
  return (
    <MarketplaceLayout>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold tracking-widest text-accent uppercase">
            Seller workspace
          </p>
          <h1 className="mt-3 text-3xl font-bold">Your products</h1>
        </div>
        <Link
          className="rounded-lg bg-brand px-4 py-3 text-sm font-semibold text-white"
          to="/vendor/products/new"
        >
          Add product
        </Link>
      </div>
      <Feedback {...feedback} />
      <Feedback message={resource.error} error />
      {resource.error && (
        <Button secondary onClick={resource.reload}>
          Try again
        </Button>
      )}
      {resource.loading ? (
        <Loading />
      ) : resource.data?.products.length ? (
        <div className="mt-7 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {resource.data.products.map((product) => (
            <article
              key={product.id}
              className="rounded-2xl border border-line bg-white p-4"
            >
              <ProductImage src={product.imageUrl} title={product.title} />
              <div className="mt-4">
                <StatusBadge status={product.status} />
                <h2 className="mt-3 text-lg font-semibold">{product.title}</h2>
                <p className="mt-2 font-bold text-brand">
                  {formatPrice(product.priceInPaise)}
                </p>
                <p className="mt-2 text-xs text-muted">
                  Stock: {product.stock}
                </p>
                <div className="mt-5 flex items-center justify-between gap-3">
                  <Link
                    to={`/vendor/products/${product.id}/edit`}
                    className="rounded text-sm font-semibold text-brand underline underline-offset-4"
                  >
                    Edit {product.title}
                  </Link>
                  <Button
                    secondary
                    disabled={Boolean(busy)}
                    onClick={() => archive(product)}
                  >
                    {busy === product.id
                      ? "Archiving…"
                      : `Archive ${product.title}`}
                  </Button>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        !resource.error && (
          <div className="mt-7">
            <EmptyState title="Make your first listing">
              Add a product, then upload its cover image.
            </EmptyState>
          </div>
        )
      )}
      <Pagination
        pagination={resource.data?.pagination}
        onPageChange={setPage}
        busy={resource.loading || Boolean(busy)}
      />
    </MarketplaceLayout>
  );
};

export { VendorProductsPage };
