const getLoginRedirect = (requested) => {
  if (typeof requested !== "string" || !requested.startsWith("/")) return "/";
  try {
    const url = new URL(requested, window.location.origin);
    if (
      url.origin !== window.location.origin ||
      ["/login", "/register", "/account"].includes(
        url.pathname.toLowerCase().replace(/\/+$/, ""),
      )
    )
      return "/";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/";
  }
};

export { getLoginRedirect };
