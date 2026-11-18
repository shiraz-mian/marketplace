let scriptPromise;
const loadRazorpay = () => {
  if (window.Razorpay) return Promise.resolve();
  if (!scriptPromise)
    scriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.async = true;
      const timeout = setTimeout(() => {
        script.remove();
        scriptPromise = null;
        reject(new Error("Checkout script timed out"));
      }, 15000);
      script.onload = () => {
        clearTimeout(timeout);
        if (window.Razorpay) resolve();
        else {
          scriptPromise = null;
          reject(new Error("Checkout unavailable"));
        }
      };
      script.onerror = () => {
        clearTimeout(timeout);
        script.remove();
        scriptPromise = null;
        reject(new Error("Checkout unavailable"));
      };
      document.head.append(script);
    });
  return scriptPromise;
};
const openTestCheckout = async (payment, name, signal) => {
  if (!/^rzp_test_[A-Za-z0-9]+$/.test(payment.keyId))
    throw new Error("Only test payments are supported");
  await loadRazorpay();
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  return new Promise((resolve, reject) => {
    let checkout;
    const finish = (value) => {
      signal?.removeEventListener("abort", abort);
      resolve(value);
    };
    const abort = () => {
      checkout?.close();
      reject(new DOMException("Aborted", "AbortError"));
    };
    checkout = new window.Razorpay({
      key: payment.keyId,
      order_id: payment.orderId,
      amount: payment.amount,
      currency: payment.currency,
      name: "Marketplace",
      description: "Test payment",
      prefill: { name },
      handler: (response) => finish(response),
      modal: { ondismiss: () => finish(null) },
      theme: { color: "#234c3f" },
    });
    signal?.addEventListener("abort", abort, { once: true });
    checkout.open();
  });
};
export { openTestCheckout };
