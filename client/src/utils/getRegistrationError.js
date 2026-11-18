import { isAxiosError } from "axios";

const FIELD_MESSAGES = {
  name: "Enter a name between 2 and 100 characters.",
  email: "Enter a valid email address.",
  password: "Use between 15 and 128 characters.",
};

const getRegistrationError = (error) => {
  const fallback = {
    message: "We couldn't create your account. Please try again.",
    fieldErrors: {},
  };

  if (!isAxiosError(error)) return fallback;

  if (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT") {
    return {
      ...fallback,
      message: "The request took too long. Please try again.",
    };
  }

  if (!error.response) {
    return {
      ...fallback,
      message: "We couldn't reach the server. Please try again in a moment.",
    };
  }

  const apiError = error.response.data?.error;

  if (apiError?.code === "EMAIL_ALREADY_EXISTS") {
    return {
      message: "An account with this email already exists.",
      fieldErrors: { email: "Please use a different email address." },
    };
  }

  if (error.response.status === 429) {
    return {
      ...fallback,
      message: "Too many attempts. Please wait a while before trying again.",
    };
  }

  if (apiError?.code === "VALIDATION_FAILED") {
    const fieldErrors = {};
    for (const issue of Array.isArray(apiError.details)
      ? apiError.details
      : []) {
      if (Object.hasOwn(FIELD_MESSAGES, issue?.field)) {
        fieldErrors[issue.field] = FIELD_MESSAGES[issue.field];
      }
    }
    return { message: "Please check your details and try again.", fieldErrors };
  }

  return fallback;
};

export { getRegistrationError };
