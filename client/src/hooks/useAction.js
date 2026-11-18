import { useEffect, useRef, useState } from "react";
import { isCancel } from "axios";
import { getMarketplaceError } from "../utils/getMarketplaceError.js";
const useAction = () => {
  const pending = useRef(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState({ message: "", error: false });
  useEffect(
    () => () => {
      pending.current?.abort();
      pending.current = null;
    },
    [],
  );
  const run = async (operation, message = "") => {
    if (pending.current) return null;
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    setFeedback({ message: "", error: false });
    try {
      const result = await operation({ signal: controller.signal });
      if (controller.signal.aborted) return null;
      setFeedback({ message, error: false });
      return result ?? true;
    } catch (error) {
      if (!controller.signal.aborted && !isCancel(error))
        setFeedback({ message: getMarketplaceError(error), error: true });
      return null;
    } finally {
      if (pending.current === controller) {
        pending.current = null;
        setBusy(false);
      }
    }
  };
  return { busy, feedback, run };
};
export { useAction };
