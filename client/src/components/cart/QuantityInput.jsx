const QuantityInput = ({
  id,
  label,
  value,
  onChange,
  max,
  disabled,
  error,
}) => (
  <div>
    <label htmlFor={id} className="mb-2 block text-xs font-semibold">
      {label}
    </label>
    <input
      id={id}
      type="number"
      inputMode="numeric"
      min="1"
      max={max}
      step="1"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      disabled={disabled}
      aria-invalid={Boolean(error)}
      aria-describedby={error ? `${id}-error` : undefined}
      className="min-h-11 w-24 rounded-lg border border-input-border bg-white px-3 py-2 text-base text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 disabled:bg-canvas"
    />
    {error && (
      <p id={`${id}-error`} role="alert" className="mt-2 text-xs text-danger">
        {error}
      </p>
    )}
  </div>
);

export { QuantityInput };
