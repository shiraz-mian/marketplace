import { useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { AuthLayout } from "../components/auth/AuthLayout.jsx";
import {
  INPUT_CLASSES,
  LABEL_CLASSES,
  LINK_CLASSES,
  PASSWORD_TOGGLE_CLASSES,
  SPINNER_CLASSES,
  SUBMIT_CLASSES,
} from "../components/auth/authStyles.js";
import { useAuth } from "../hooks/useAuth.js";
import { getAuthError } from "../utils/getAuthError.js";
import { getLoginRedirect } from "../utils/loginRedirect.js";

const LoginPage = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [values, setValues] = useState({ email: "", password: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [feedback, setFeedback] = useState({ status: "idle", message: "" });
  const requestPending = useRef(false);
  const isSubmitting = feedback.status === "submitting";

  const handleChange = (event) => {
    const { name, value } = event.target;
    setValues((current) => ({ ...current, [name]: value }));
    setFeedback({ status: "idle", message: "" });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (requestPending.current) return;
    requestPending.current = true;
    setFeedback({ status: "submitting", message: "" });
    try {
      await login({ email: values.email.trim(), password: values.password });
      navigate(getLoginRedirect(location.state?.from), {
        replace: true,
        state: { catalogSearch: location.state?.catalogSearch },
      });
    } catch (error) {
      setFeedback({ status: "error", message: getAuthError(error) });
    } finally {
      requestPending.current = false;
    }
  };

  return (
    <AuthLayout
      title="Welcome back"
      eyebrow="Your next discovery awaits"
      description="Sign in to your Marketplace account."
    >
      {feedback.message && (
        <p
          role="alert"
          className="mt-[22px] rounded-[7px] border border-[#edc5bf] bg-[#fff3ef] px-3.5 py-3 text-[13px] leading-relaxed text-danger"
        >
          {feedback.message}
        </p>
      )}
      <form onSubmit={handleSubmit} aria-busy={isSubmitting}>
        <fieldset className="mt-7 min-w-0" disabled={isSubmitting}>
          <legend className="sr-only">Sign-in details</legend>
          <div>
            <label className={LABEL_CLASSES} htmlFor="login-email">
              Email address
            </label>
            <input
              className={INPUT_CLASSES}
              id="login-email"
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
            />
          </div>
          <div className="mt-[21px]">
            <label className={LABEL_CLASSES} htmlFor="login-password">
              Password
            </label>
            <div className="relative">
              <input
                className={`${INPUT_CLASSES} pr-[65px]`}
                id="login-password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                placeholder="Your password"
                value={values.password}
                onChange={handleChange}
                required
                maxLength={128}
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
          </div>
          <button
            className={SUBMIT_CLASSES}
            type="submit"
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <span className={SPINNER_CLASSES} aria-hidden="true" />
                Signing in…
              </>
            ) : (
              <>
                Sign in
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
        New to Marketplace?{" "}
        <Link className={LINK_CLASSES} to="/register">
          Create an account
        </Link>
      </p>
    </AuthLayout>
  );
};

export { LoginPage };
