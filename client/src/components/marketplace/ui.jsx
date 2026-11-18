import { useState } from "react";

const Button = ({ secondary = false, className = "", children, ...props }) => (
  <button
    {...props}
    className={`inline-flex min-h-11 items-center justify-center rounded-lg border px-4 py-2.5 text-sm font-semibold transition-colors disabled:cursor-wait disabled:opacity-60 motion-reduce:transition-none ${secondary ? "border-input-border bg-white text-brand enabled:hover:bg-canvas" : "border-brand bg-brand text-white enabled:hover:bg-brand-hover"} ${className}`}
  >
    {children}
  </button>
);
const Feedback = ({ message, error = false }) =>
  message ? (
    <p
      role={error ? "alert" : "status"}
      className={`my-5 rounded-lg border px-4 py-3 text-sm leading-relaxed ${error ? "border-red-200 bg-red-50 text-danger" : "border-green-200 bg-green-50 text-brand"}`}
    >
      {message}
    </p>
  ) : null;
const Loading = () => (
  <p role="status" className="py-10 text-sm text-muted">
    Loading…
  </p>
);
const EmptyState = ({ title, children }) => (
  <div className="rounded-2xl border border-dashed border-input-border bg-white p-10 text-center">
    <h2 className="text-xl font-semibold">{title}</h2>
    <div className="mt-3 text-sm leading-relaxed text-muted">{children}</div>
  </div>
);
const StatusBadge = ({ status }) => (
  <span
    className={`inline-flex items-center justify-center self-center rounded-full px-3 py-1 text-xs font-semibold capitalize ${["approved", "active"].includes(status) ? "bg-green-100 text-green-900" : status === "rejected" ? "bg-red-100 text-red-900" : "bg-amber-100 text-amber-900"}`}
  >
    {status}
  </span>
);
const Pagination = ({ pagination, onPageChange, busy, maxPage = Infinity }) =>
  pagination ? (
    <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-line pt-5 text-sm text-muted">
      <p>
        {pagination.total} results · Page {pagination.page}
        {pagination.page <= Math.max(1, pagination.totalPages) && (
          <> of {Math.max(1, pagination.totalPages)}</>
        )}
      </p>
      <div className="flex gap-2">
        <Button
          secondary
          disabled={busy || pagination.page <= 1}
          onClick={() => onPageChange(pagination.page - 1)}
        >
          Previous
        </Button>
        <Button
          secondary
          disabled={
            busy || pagination.page >= Math.min(pagination.totalPages, maxPage)
          }
          onClick={() => onPageChange(pagination.page + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  ) : null;
const ProductImage = ({ src, title, className = "" }) => {
  const [failedUrl, setFailedUrl] = useState(null);
  return (
    <div
      className={`grid aspect-[4/3] place-items-center overflow-hidden rounded-xl bg-[#edf0e8] ${className}`}
    >
      {src && src !== failedUrl ? (
        <img
          src={src}
          alt={title}
          loading="lazy"
          onError={() => setFailedUrl(src)}
          className="h-full w-full object-contain p-4"
        />
      ) : (
        <span className="text-sm text-muted">No image available</span>
      )}
    </div>
  );
};

export {
  Button,
  Feedback,
  Loading,
  EmptyState,
  StatusBadge,
  Pagination,
  ProductImage,
};
