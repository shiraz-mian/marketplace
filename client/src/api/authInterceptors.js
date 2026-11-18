const REFRESHABLE_ERRORS = new Set([
  "TOKEN_EXPIRED",
  "INVALID_TOKEN",
  "AUTH_REQUIRED",
]);

const attachAuthInterceptors = (
  client,
  { getAccessToken, refreshAuth, expireAuth },
) => {
  const requestId = client.interceptors.request.use((config) => {
    const token = getAccessToken();
    if (token) config.headers.set("Authorization", `Bearer ${token}`);
    else config.headers.delete("Authorization");
    return config;
  });

  const responseId = client.interceptors.response.use(
    (response) => response,
    async (error) => {
      const config = error.config;
      const currentToken = getAccessToken();
      const sentToken = config?.headers?.get("Authorization");

      if (
        !config ||
        !currentToken ||
        !sentToken ||
        error.response?.status !== 401 ||
        !REFRESHABLE_ERRORS.has(error.response?.data?.error?.code)
      ) {
        throw error;
      }

      if (config._authRetry) {
        if (sentToken === `Bearer ${currentToken}`) expireAuth();
        throw error;
      }

      config._authRetry = true;
      // A late response may belong to the old token after another request refreshed it.
      if (sentToken === `Bearer ${currentToken}`) await refreshAuth();

      if (!getAccessToken()) throw error;
      return client(config);
    },
  );

  return () => {
    client.interceptors.request.eject(requestId);
    client.interceptors.response.eject(responseId);
  };
};

export { attachAuthInterceptors };
