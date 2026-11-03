import { useEffect, useState } from "react";
import { getBackendHealth } from "../services/healthService.js";

const useBackendHealth = () => {
  const [result, setResult] = useState({
    status: "loading",
    message: "Connecting to backend...",
  });

  useEffect(() => {
    const controller = new AbortController();

    const loadHealth = async () => {
      try {
        const data = await getBackendHealth({
          signal: controller.signal,
        });

        if (controller.signal.aborted) {
          return;
        }

        setResult({
          status: "success",
          message: data.message,
        });
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }

        setResult({
          status: "error",
          message: error.response
            ? `Backend returned an error (${error.response.status}).`
            : "Cannot reach the backend. Check that it is running.",
        });
      }
    };

    loadHealth();

    return () => {
      controller.abort();
    };
  }, []);

  return result;
};

export { useBackendHealth };
