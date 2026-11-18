import { isAxiosError } from "axios";

const FALLBACK_MESSAGES = {
  login: "We couldn't sign you in. Please try again.",
  logout: "We couldn't sign you out. Please try again.",
  restore:
    "We couldn't check your sign-in status. Check your connection and retry.",
  account: "We couldn't refresh your account details. Please try again.",
};

const getAuthError = (error, action = "login") => {
  const fallback = FALLBACK_MESSAGES[action] || FALLBACK_MESSAGES.login;
  if (!isAxiosError(error)) return fallback;
  if (["ECONNABORTED", "ETIMEDOUT"].includes(error.code)) {
    return "The request took too long. Please try again.";
  }
  if (!error.response)
    return "We couldn't reach the server. Check your connection and try again.";
  if (error.response.status === 429)
    return "Too many attempts. Please wait a while and try again.";
  if (action === "login" && error.response.status === 401)
    return "Email or password is incorrect.";
  if (action === "login" && error.response.status === 422)
    return "Enter a valid email address and password.";
  if (error.response.status === 403)
    return "This request was blocked. Check the app URL and try again.";
  return fallback;
};

export { getAuthError };
