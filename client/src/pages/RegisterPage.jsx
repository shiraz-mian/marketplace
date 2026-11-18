import { useRef, useState } from "react";
import { Link } from "react-router";
import { AuthLayout } from "../components/auth/AuthLayout.jsx";
import {
  INPUT_CLASSES,
  LABEL_CLASSES,
  FIELD_ERROR_CLASSES,
  SUBMIT_CLASSES,
  PASSWORD_TOGGLE_CLASSES,
  LINK_CLASSES,
  SPINNER_CLASSES,
} from "../components/auth/authStyles.js";
import { registerCustomer } from "../services/authService.js";
import { getRegistrationError } from "../utils/getRegistrationError.js";

const INITIAL_VALUES = { name: "", email: "", password: "" };
const INITIAL_FEEDBACK = { status: "idle", message: "", fieldErrors: {} };

const RegisterPage = () => {
  const [values, setValues] = useState(INITIAL_VALUES);
  const [feedback, setFeedback] = useState(INITIAL_FEEDBACK);
  const [showPassword, setShowPassword] = useState(false);
  const requestPending = useRef(false);
  const isSubmitting = feedback.status === "submitting";

  const handleChange = (event) => {
    const { name, value } = event.target;
    setValues((current) => ({ ...current, [name]: value }));
    setFeedback((current) => ({
      ...current,
      status: "idle",
      message: "",
      fieldErrors: { ...current.fieldErrors, [name]: undefined },
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (requestPending.current) return;

    requestPending.current = true;
    setFeedback({ status: "submitting", message: "", fieldErrors: {} });

    try {
      await registerCustomer({
        name: values.name.trim(),
        email: values.email.trim(),
        password: values.password,
      });
      setValues(INITIAL_VALUES);
      setShowPassword(false);
      setFeedback({
        status: "success",
        message: "Your account is ready. Welcome to Marketplace!",
        fieldErrors: {},
      });
    } catch (error) {
      setFeedback({ status: "error", ...getRegistrationError(error) });
    } finally {
      requestPending.current = false;
    }
  };

  return (
    <AuthLayout
      title="Create your account"
      eyebrow="A fresh start"
      description="Your next great find starts here."
    >
      {feedback.message && (
        <p
          className={`mt-[22px] rounded-[7px] border px-3.5 py-3 text-[13px] leading-[1.6] [overflow-wrap:anywhere] ${
            feedback.status === "error"
              ? "border-[#edc5bf] bg-[#fff3ef] text-[#8e2c27]"
              : "border-[#b5d6bc] bg-[#eff8ee] text-[#23553c]"
          }`}
          role={feedback.status === "error" ? "alert" : "status"}
        >
          {feedback.message}
        </p>
      )}

      <form onSubmit={handleSubmit} aria-busy={isSubmitting}>
        <fieldset className="mt-7 min-w-0" disabled={isSubmitting}>
          <legend className="sr-only">Account details</legend>

          <div>
            <label className={LABEL_CLASSES} htmlFor="register-name">
              Full name
            </label>
            <input
              className={INPUT_CLASSES}
              id="register-name"
              name="name"
              type="text"
              autoComplete="name"
              placeholder="Your full name"
              value={values.name}
              onChange={handleChange}
              required
              minLength={2}
              maxLength={100}
              aria-invalid={Boolean(feedback.fieldErrors.name)}
              aria-describedby={
                feedback.fieldErrors.name ? "register-name-error" : undefined
              }
            />
            {feedback.fieldErrors.name && (
              <p className={FIELD_ERROR_CLASSES} id="register-name-error">
                {feedback.fieldErrors.name}
              </p>
            )}
          </div>

          <div className="mt-[21px]">
            <label className={LABEL_CLASSES} htmlFor="register-email">
              Email address
            </label>
            <input
              className={INPUT_CLASSES}
              id="register-email"
              name="email"
              type="email"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="you@example.com"
              value={values.email}
              onChange={handleChange}
              required
              maxLength={254}
              aria-invalid={Boolean(feedback.fieldErrors.email)}
              aria-describedby={
                feedback.fieldErrors.email ? "register-email-error" : undefined
              }
            />
            {feedback.fieldErrors.email && (
              <p className={FIELD_ERROR_CLASSES} id="register-email-error">
                {feedback.fieldErrors.email}
              </p>
            )}
          </div>

          <div className="mt-[21px]">
            <label className={LABEL_CLASSES} htmlFor="register-password">
              Password
            </label>
            <div className="relative">
              <input
                className={`${INPUT_CLASSES} pr-[65px]`}
                id="register-password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                placeholder="Create a password"
                value={values.password}
                onChange={handleChange}
                required
                minLength={15}
                maxLength={128}
                aria-invalid={Boolean(feedback.fieldErrors.password)}
                aria-describedby={`register-password-hint${feedback.fieldErrors.password ? " register-password-error" : ""}`}
              />
              <button
                className={PASSWORD_TOGGLE_CLASSES}
                type="button"
                onClick={() => setShowPassword((current) => !current)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
            <p
              className="mt-2 text-[11px] leading-[1.55] text-muted"
              id="register-password-hint"
            >
              Use 15–128 characters. A longer phrase works well.
            </p>
            {feedback.fieldErrors.password && (
              <p className={FIELD_ERROR_CLASSES} id="register-password-error">
                {feedback.fieldErrors.password}
              </p>
            )}
          </div>

          <button
            className={SUBMIT_CLASSES}
            type="submit"
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <span className={SPINNER_CLASSES} aria-hidden="true" />
                Creating account…
              </>
            ) : (
              <>
                Create account
                <span
                  className="ml-auto text-[21px] leading-none"
                  aria-hidden="true"
                >
                  ↗
                </span>
              </>
            )}
          </button>
        </fieldset>
      </form>
      <p className="mt-5 text-center text-sm text-muted">
        Already have an account?{" "}
        <Link className={LINK_CLASSES} to="/login">
          Sign in
        </Link>
      </p>
    </AuthLayout>
  );
};

export { RegisterPage };
