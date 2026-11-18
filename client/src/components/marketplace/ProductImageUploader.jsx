import { useRef, useState } from "react";
import { Button, Feedback, ProductImage } from "./ui.jsx";
import { uploadProductImage } from "../../services/marketplaceService.js";
import { getMarketplaceError } from "../../utils/getMarketplaceError.js";

const ProductImageUploader = ({ product, onUploaded }) => {
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState({ message: "", error: false });
  const pending = useRef(false);
  const input = useRef(null);
  const submit = async (event) => {
    event.preventDefault();
    if (pending.current) return;
    if (
      !file ||
      !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
      file.size > 5 * 1024 * 1024
    ) {
      setFeedback({
        message: "Choose one JPEG, PNG or WebP image smaller than 5 MB.",
        error: true,
      });
      return;
    }
    pending.current = true;
    setBusy(true);
    setFeedback({ message: "", error: false });
    try {
      onUploaded(await uploadProductImage(product.id, file));
      setFeedback({
        message: "Your product image was uploaded.",
        error: false,
      });
      setFile(null);
      if (input.current) input.current.value = "";
    } catch (error) {
      setFeedback({ message: getMarketplaceError(error), error: true });
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  return (
    <section className="rounded-2xl border border-line bg-white p-6">
      <h2 className="text-xl font-semibold">Product image</h2>
      <div className="mt-4">
        <ProductImage src={product.imageUrl} title={product.title} />
      </div>
      <Feedback {...feedback} />
      <form onSubmit={submit} className="mt-5">
        <label htmlFor="product-image" className="block text-sm font-semibold">
          Choose cover image
        </label>
        <input
          ref={input}
          className="mt-3 block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-canvas file:px-3 file:py-2 file:text-brand"
          id="product-image"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={busy}
          onChange={(event) => setFile(event.target.files?.[0] || null)}
        />
        <p className="mt-2 text-xs leading-relaxed text-muted">
          JPEG, PNG or WebP · up to 5 MB and 20 megapixels.
        </p>
        <Button className="mt-4" disabled={busy || !file} type="submit">
          {busy ? "Uploading image…" : "Upload image"}
        </Button>
      </form>
    </section>
  );
};

export { ProductImageUploader };
