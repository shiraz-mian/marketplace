const formatPrice = (paise) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(
    paise / 100,
  );

const parsePriceInPaise = (value, { allowZero = false } = {}) => {
  if (!/^\d{1,7}(?:\.\d{1,2})?$/.test(value.trim())) return null;
  const [whole, fraction = ""] = value.trim().split(".");
  const paise = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return paise >= (allowZero ? 0 : 1) && paise <= 100000000 ? paise : null;
};

export { formatPrice, parsePriceInPaise };
