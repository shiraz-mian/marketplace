import { useCallback, useState } from "react";
import { Link } from "react-router";
import { Button, Feedback, Loading, Pagination } from "./ui.jsx";
import { INPUT_CLASSES, LABEL_CLASSES } from "../auth/authStyles.js";
import { useAuth } from "../../hooks/useAuth.js";
import { useResource } from "../../hooks/useResource.js";
import { useAction } from "../../hooks/useAction.js";
import { getReviews, saveReview } from "../../services/commerceService.js";
const ReviewForm = ({ productId, onSaved }) => {
  const [rating, setRating] = useState(5);
  const [body, setBody] = useState("");
  const action = useAction();
  const submit = async (e) => {
    e.preventDefault();
    if (
      await action.run(
        (options) => saveReview(productId, { rating, body }, options),
        "Your review was saved.",
      )
    )
      onSaved();
  };
  return (
    <form
      onSubmit={submit}
      className="mt-6 max-w-xl rounded-xl border border-line p-5"
    >
      <h3 className="font-semibold">Write or update your review</h3>
      <p className="mt-2 text-xs text-muted">
        Reviews are available after delivery of a verified purchase.
      </p>
      <Feedback {...action.feedback} />
      <fieldset disabled={action.busy}>
        <label htmlFor="review-rating" className={`${LABEL_CLASSES} mt-4`}>
          Rating
        </label>
        <select
          id="review-rating"
          className={INPUT_CLASSES}
          value={rating}
          onChange={(e) => setRating(Number(e.target.value))}
        >
          {[5, 4, 3, 2, 1].map((n) => (
            <option key={n} value={n}>
              {n} stars
            </option>
          ))}
        </select>
        <label htmlFor="review-body" className={`${LABEL_CLASSES} mt-4`}>
          Your review
        </label>
        <textarea
          id="review-body"
          className={INPUT_CLASSES}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          minLength={5}
          maxLength={1000}
          rows={3}
          required
        />
        <Button className="mt-4" type="submit" disabled={action.busy}>
          {action.busy ? "Saving…" : "Save review"}
        </Button>
      </fieldset>
    </form>
  );
};
const ProductReviews = ({ productId }) => {
  const { user } = useAuth();
  const [page, setPage] = useState(1);
  const loader = useCallback(
    (signal) => getReviews(productId, page, { signal }),
    [productId, page],
  );
  const resource = useResource(loader);
  return (
    <section className="mt-12 border-t border-line pt-8">
      <h2 className="text-2xl font-bold">Customer reviews</h2>
      <Feedback message={resource.error} error />
      {resource.error && (
        <Button secondary onClick={resource.reload}>
          Refresh reviews
        </Button>
      )}
      {resource.loading ? (
        <Loading />
      ) : (
        resource.data?.reviews && (
          <>
            <p className="mt-3 text-sm text-muted">
              {resource.data.pagination.total
                ? `${resource.data.average.toFixed(1)} / 5 · ${resource.data.pagination.total} verified reviews`
                : "Be the first to review after your purchase arrives."}
            </p>
            <div className="mt-5 space-y-4">
              {resource.data.reviews.map((r) => (
                <article
                  key={r.id}
                  className="rounded-xl border border-line bg-white p-5"
                >
                  <p className="font-semibold">
                    {r.authorName} · {r.rating} / 5
                  </p>
                  <p className="mt-1 text-xs text-brand">Verified purchase</p>
                  <p className="mt-3 text-sm leading-relaxed whitespace-pre-line">
                    {r.body}
                  </p>
                </article>
              ))}
            </div>
            <Pagination
              pagination={resource.data.pagination}
              onPageChange={setPage}
              busy={resource.loading}
            />
          </>
        )
      )}
      {user ? (
        <ReviewForm
          key={`${user.id}:${productId}`}
          productId={productId}
          onSaved={resource.reload}
        />
      ) : (
        <Link
          to="/login"
          className="mt-5 inline-block text-sm text-brand underline"
        >
          Sign in to review a purchase
        </Link>
      )}
    </section>
  );
};
export { ProductReviews };
