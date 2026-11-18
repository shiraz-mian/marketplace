import { useCallback } from "react";
import { Link, useLocation, useParams } from "react-router";
import { MarketplaceLayout } from "../components/marketplace/MarketplaceLayout.jsx";
import {
  Button,
  Feedback,
  Loading,
  ProductImage,
} from "../components/marketplace/ui.jsx";
import { getCatalogProduct } from "../services/marketplaceService.js";
import { useResource } from "../hooks/useResource.js";
import { formatPrice } from "../utils/productPrice.js";
import { AddToCart } from "../components/cart/AddToCart.jsx";
import { ProductReviews } from "../components/marketplace/ProductReviews.jsx";

const ProductDetailsPage = () => {
  const { productId } = useParams();
  const { state } = useLocation();
  const catalogSearch =
    typeof state?.catalogSearch === "string" &&
    state.catalogSearch.startsWith("?")
      ? state.catalogSearch
      : "";
  const loader = useCallback(
    (signal) => getCatalogProduct(productId, { signal }),
    [productId],
  );
  const resource = useResource(loader);
  const product = resource.data;
  return (
    <MarketplaceLayout
      title={
        product ? `${product.title} | Marketplace` : "Product | Marketplace"
      }
    >
      <Link
        className="text-sm text-brand underline"
        to={{ pathname: "/", search: catalogSearch }}
      >
        Back to products
      </Link>
      <Feedback message={resource.error} error />
      {resource.error && (
        <Button secondary onClick={resource.reload}>
          Try again
        </Button>
      )}
      {resource.loading ? (
        <Loading />
      ) : (
        product && (
          <article className="mt-7 grid gap-8 md:grid-cols-2">
            <ProductImage src={product.imageUrl} title={product.title} />
            <div>
              <p className="text-sm text-accent capitalize">
                {product.category}
              </p>
              <h1 className="mt-3 text-4xl font-bold tracking-tight">
                {product.title}
              </h1>
              <p className="mt-3 text-sm text-muted">
                Sold by {product.storeName}
              </p>
              <p className="mt-6 text-3xl font-bold text-brand">
                {formatPrice(product.priceInPaise)}
              </p>
              <p className="mt-3 text-sm text-muted">
                {product.stock ? `${product.stock} in stock` : "Out of stock"}
              </p>
              <AddToCart product={product} />
              <h2 className="mt-8 text-lg font-semibold">About this product</h2>
              <p className="mt-3 leading-relaxed whitespace-pre-line text-muted">
                {product.description}
              </p>
            </div>
          </article>
        )
      )}
      {product && <ProductReviews key={productId} productId={productId} />}
    </MarketplaceLayout>
  );
};

export { ProductDetailsPage };
