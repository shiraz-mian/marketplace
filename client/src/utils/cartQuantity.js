const MAX_CART_QUANTITY = 99;
const parseCartQuantity = (value, stock) => {
  if (!/^\d{1,2}$/.test(value)) return null;
  const quantity = Number(value);
  return quantity >= 1 && quantity <= Math.min(stock, MAX_CART_QUANTITY)
    ? quantity
    : null;
};

export { MAX_CART_QUANTITY, parseCartQuantity };
