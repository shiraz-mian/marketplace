import { useCallback, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { MarketplaceLayout } from "../components/marketplace/MarketplaceLayout.jsx";
import { Button, Feedback, Loading } from "../components/marketplace/ui.jsx";
import { ProductImageUploader } from "../components/marketplace/ProductImageUploader.jsx";
import { INPUT_CLASSES, LABEL_CLASSES } from "../components/auth/authStyles.js";
import { getMyProduct, saveProduct } from "../services/marketplaceService.js";
import { useResource } from "../hooks/useResource.js";
import { getMarketplaceError } from "../utils/getMarketplaceError.js";
import { parsePriceInPaise } from "../utils/productPrice.js";

const toValues = (product) =>
  product
    ? {
        title: product.title,
        description: product.description,
        category: product.category,
        price: (product.priceInPaise / 100).toFixed(2),
        stock: String(product.stock),
        status: product.status,
      }
    : {
        title: "",
        description: "",
        category: "",
        price: "",
        stock: "0",
        status: "draft",
      };

const ProductEditor = ({ product, onSaved }) => {
  const navigate = useNavigate();
  const [values, setValues] = useState(() => toValues(product));
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState({ message: "", error: false });
  const pending = useRef(false);
  const change = (event) =>
    setValues((current) => ({
      ...current,
      [event.target.name]: event.target.value,
    }));
  const submit = async (event) => {
    event.preventDefault();
    if (pending.current) return;
    const priceInPaise = parsePriceInPaise(values.price);
    if (priceInPaise === null) {
      setFeedback({
        message:
          "Enter a price from ₹0.01 to ₹10,00,000 with up to two decimal places.",
        error: true,
      });
      return;
    }
    pending.current = true;
    setBusy(true);
    setFeedback({ message: "", error: false });
    try {
      const saved = await saveProduct(product?.id, {
        ...values,
        priceInPaise,
        stock: Number(values.stock),
      });
      if (!product)
        navigate(`/vendor/products/${saved.id}/edit`, { replace: true });
      else {
        onSaved(saved);
        setValues(toValues(saved));
        setFeedback({
          message: "Your product details were saved.",
          error: false,
        });
      }
    } catch (error) {
      setFeedback({ message: getMarketplaceError(error), error: true });
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  return (
    <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <form
        onSubmit={submit}
        className="rounded-2xl border border-line bg-white p-6"
      >
        <Feedback {...feedback} />
        <fieldset disabled={busy} className="space-y-5">
          <legend className="sr-only">Product details</legend>
          <div>
            <label className={LABEL_CLASSES} htmlFor="product-title">
              Product title
            </label>
            <input
              className={INPUT_CLASSES}
              id="product-title"
              name="title"
              value={values.title}
              onChange={change}
              required
              minLength={2}
              maxLength={150}
            />
          </div>
          <div>
            <label className={LABEL_CLASSES} htmlFor="product-description">
              Description
            </label>
            <textarea
              className={INPUT_CLASSES}
              id="product-description"
              name="description"
              value={values.description}
              onChange={change}
              required
              minLength={20}
              maxLength={5000}
              rows={6}
            />
          </div>
          <div>
            <label className={LABEL_CLASSES} htmlFor="product-category">
              Category
            </label>
            <input
              className={INPUT_CLASSES}
              id="product-category"
              name="category"
              value={values.category}
              onChange={change}
              required
              minLength={2}
              maxLength={50}
              placeholder="For example, home"
            />
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label className={LABEL_CLASSES} htmlFor="product-price">
                Price (INR)
              </label>
              <input
                className={INPUT_CLASSES}
                id="product-price"
                name="price"
                inputMode="decimal"
                value={values.price}
                onChange={change}
                required
                placeholder="499.00"
              />
            </div>
            <div>
              <label className={LABEL_CLASSES} htmlFor="product-stock">
                Stock quantity
              </label>
              <input
                className={INPUT_CLASSES}
                id="product-stock"
                name="stock"
                type="number"
                min="0"
                max="1000000"
                step="1"
                value={values.stock}
                onChange={change}
                required
              />
            </div>
          </div>
          <div>
            <label className={LABEL_CLASSES} htmlFor="product-status">
              Visibility
            </label>
            <select
              className={INPUT_CLASSES}
              id="product-status"
              name="status"
              value={values.status}
              onChange={change}
            >
              <option value="draft">Draft — only visible to you</option>
              <option value="active">Active — visible in the shop</option>
            </select>
          </div>
          <Button type="submit" disabled={busy}>
            {busy
              ? "Saving product…"
              : product
                ? "Save changes"
                : "Create product"}
          </Button>
        </fieldset>
      </form>
      {product ? (
        <ProductImageUploader product={product} onUploaded={onSaved} />
      ) : (
        <aside className="rounded-2xl border border-line bg-white p-6">
          <h2 className="text-lg font-semibold">Add a cover image</h2>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            Save your product details first, then choose its cover image.
          </p>
        </aside>
      )}
    </div>
  );
};

const ProductEditorPage = () => {
  const { productId } = useParams();
  const loader = useCallback(
    (signal) =>
      productId ? getMyProduct(productId, { signal }) : Promise.resolve(null),
    [productId],
  );
  const resource = useResource(loader);
  return (
    <MarketplaceLayout>
      <Link className="text-sm text-brand underline" to="/vendor/products">
        Back to your products
      </Link>
      <h1 className="mt-4 text-3xl font-bold">
        {productId ? "Edit product" : "Add a product"}
      </h1>
      <Feedback message={resource.error} error />
      {resource.error && (
        <Button secondary onClick={resource.reload}>
          Try again
        </Button>
      )}
      {resource.loading ? (
        <Loading />
      ) : (
        !resource.error && (
          <ProductEditor
            key={productId || "new"}
            product={resource.data}
            onSaved={resource.replaceData}
          />
        )
      )}
    </MarketplaceLayout>
  );
};

export { ProductEditorPage };
