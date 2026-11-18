import { useCallback, useEffect, useState } from "react";
import { isCancel } from "axios";
import { getMarketplaceError } from "../utils/getMarketplaceError.js";

const useResource = (loader) => {
  const [state, setState] = useState({
    source: loader,
    data: null,
    loading: true,
    error: "",
  });
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    Promise.resolve()
      .then(() => {
        if (!active) return;
        setState({ source: loader, data: null, loading: true, error: "" });
        return loader(controller.signal);
      })
      .then((data) => {
        if (active)
          setState({ source: loader, data, loading: false, error: "" });
      })
      .catch((error) => {
        if (active && !isCancel(error))
          setState({
            source: loader,
            data: null,
            loading: false,
            error: getMarketplaceError(error),
          });
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [loader, revision]);
  const reload = useCallback(() => setRevision((current) => current + 1), []);
  const replaceData = useCallback(
    (data) =>
      setState((current) =>
        current.source === loader
          ? { source: loader, data, loading: false, error: "" }
          : current,
      ),
    [loader],
  );
  const current = state.source === loader;
  return {
    data: current ? state.data : null,
    loading: !current || state.loading,
    error: current ? state.error : "",
    reload,
    replaceData,
  };
};

export { useResource };
