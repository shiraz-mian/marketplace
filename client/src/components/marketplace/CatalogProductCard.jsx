import { Link } from "react-router";
import { ProductImage } from "./ui.jsx";
import { formatPrice } from "../../utils/productPrice.js";

const CatalogProductCard = ({ product, catalogSearch }) => (
  <article className="rounded-2xl border border-line bg-white p-4">
    <Link
      to={`/products/${product.id}`}
      state={{ catalogSearch }}
      className="block rounded-xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand"
    >
      <ProductImage src={product.imageUrl} title={product.title} />
      <p className="mt-4 text-xs text-muted capitalize">{product.category}</p>
      <h3 className="mt-2 text-lg font-semibold">{product.title}</h3>
    </Link>
    <p className="mt-1 text-xs text-muted">{product.storeName}</p>
    <p className="mt-4 text-xl font-bold text-brand">
      {formatPrice(product.priceInPaise)}
    </p>
    <p className="mt-2 text-xs text-muted">
      {product.stock ? "In stock" : "Out of stock"}
    </p>
  </article>
);

export { CatalogProductCard };
