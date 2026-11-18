import { useCallback, useEffect, useRef, useState } from "react";
import { isCancel } from "axios";
import { getCart } from "../services/cartService.js";
import { useResource } from "./useResource.js";
import { getMarketplaceError } from "../utils/getMarketplaceError.js";

const useCart = () => {
  const loader = useCallback((signal) => getCart({ signal }), []);
  const resource = useResource(loader);
  const [busy, setBusy] = useState("");
  const [feedback, setFeedback] = useState({ message: "", error: false });
  const pending = useRef(null);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      pending.current?.abort();
    };
  }, []);
  const mutate = async (key, operation, message) => {
    if (pending.current || resource.loading || !resource.data) return false;
    const controller = new AbortController();
    pending.current = controller;
    setBusy(key);
    setFeedback({ message: "", error: false });
    try {
      const cart = await operation(resource.data.version, {
        signal: controller.signal,
      });
      if (!mounted.current) return false;
      resource.replaceData(cart);
      setFeedback({ message, error: false });
      return true;
    } catch (error) {
      if (mounted.current && !isCancel(error)) {
        setFeedback({ message: getMarketplaceError(error), error: true });
        // A failed/uncertain mutation is reconciled with a read, never blindly replayed.
        resource.reload();
      }
      return false;
    } finally {
      pending.current = null;
      if (mounted.current) setBusy("");
    }
  };
  return { ...resource, busy, feedback, mutate };
};

export { useCart };
