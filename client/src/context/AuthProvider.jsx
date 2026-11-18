import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CanceledError } from "axios";
import { protectedApiClient } from "../api/apiClient.js";
import { attachAuthInterceptors } from "../api/authInterceptors.js";
import {
  getCurrentCustomer,
  loginCustomer,
  logoutCustomer,
  refreshCustomer,
} from "../services/authService.js";
import { getAuthError } from "../utils/getAuthError.js";
import { AuthContext } from "./AuthContext.js";

const GUEST = { status: "guest", user: null, error: "" };

const AuthProvider = ({ children }) => {
  const [auth, setAuth] = useState({
    status: "checking",
    user: null,
    error: "",
  });
  const accessToken = useRef(null);
  const refreshPromise = useRef(null);
  const authVersion = useRef(0);
  const mounted = useRef(false);

  const expireAuth = useCallback(() => {
    authVersion.current += 1;
    accessToken.current = null;
    if (mounted.current) setAuth(GUEST);
  }, []);

  const refreshAuth = useCallback(() => {
    if (refreshPromise.current) return refreshPromise.current;
    const version = authVersion.current;
    const pending = refreshCustomer()
      .then((result) => {
        // Ignore a refresh that finishes after logout or a newer sign-in.
        if (version !== authVersion.current || !mounted.current) {
          throw new CanceledError("Authentication changed while refreshing.");
        }
        accessToken.current = result.accessToken;
        setAuth({ status: "authenticated", user: result.user, error: "" });
        return result.accessToken;
      })
      .catch((error) => {
        if (version === authVersion.current && error.response?.status === 401)
          expireAuth();
        throw error;
      })
      .finally(() => {
        if (refreshPromise.current === pending) refreshPromise.current = null;
      });
    refreshPromise.current = pending;
    return pending;
  }, [expireAuth]);

  const restoreAuth = useCallback(async () => {
    const version = authVersion.current;
    try {
      await refreshAuth();
    } catch (error) {
      // A missing/expired refresh cookie already changed the state to guest.
      if (version !== authVersion.current || !mounted.current) return;
      setAuth({
        status: "error",
        user: null,
        error: getAuthError(error, "restore"),
      });
    }
  }, [refreshAuth]);

  useEffect(() => {
    mounted.current = true;
    const detach = attachAuthInterceptors(protectedApiClient, {
      getAccessToken: () => accessToken.current,
      refreshAuth,
      expireAuth,
    });
    void restoreAuth();
    return () => {
      mounted.current = false;
      detach();
    };
  }, [expireAuth, refreshAuth, restoreAuth]);

  const retryAuth = useCallback(() => {
    setAuth({ status: "checking", user: null, error: "" });
    void restoreAuth();
  }, [restoreAuth]);

  const login = useCallback(async (credentials) => {
    const version = ++authVersion.current;
    const result = await loginCustomer(credentials);
    if (version !== authVersion.current || !mounted.current) {
      throw new CanceledError("Authentication changed while signing in.");
    }
    accessToken.current = result.accessToken;
    setAuth({ status: "authenticated", user: result.user, error: "" });
  }, []);

  const logout = useCallback(async () => {
    const version = ++authVersion.current;
    const previousToken = accessToken.current;
    accessToken.current = null;
    setAuth((current) => ({ ...current, status: "signingOut" }));
    try {
      // Finish an existing refresh before clearing the cookie on the server.
      await Promise.allSettled([refreshPromise.current]);
      await logoutCustomer();
      if (version === authVersion.current && mounted.current) setAuth(GUEST);
    } catch (error) {
      if (version === authVersion.current && mounted.current) {
        accessToken.current = previousToken;
        setAuth((current) => ({ ...current, status: "authenticated" }));
      }
      throw error;
    }
  }, []);

  const reloadUser = useCallback(async () => {
    const version = authVersion.current;
    const user = await getCurrentCustomer();
    if (
      version === authVersion.current &&
      accessToken.current &&
      mounted.current
    ) {
      setAuth((current) => ({ ...current, user }));
    }
  }, []);

  const value = useMemo(
    () => ({ ...auth, login, logout, reloadUser, retryAuth }),
    [auth, login, logout, reloadUser, retryAuth],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export { AuthProvider };
