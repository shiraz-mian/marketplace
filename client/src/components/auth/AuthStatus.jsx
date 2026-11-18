import { useAuth } from "../../hooks/useAuth.js";
import { SUBMIT_CLASSES } from "./authStyles.js";

const AuthStatus = () => {
  const { status, error, retryAuth } = useAuth();
  return (
    <main className="grid min-h-svh place-items-center px-5">
      <section className="w-full max-w-sm rounded-2xl border border-line bg-white p-8 text-center">
        {status === "checking" ? (
          <p role="status" className="text-sm text-muted">
            Checking your sign-in…
          </p>
        ) : (
          <>
            <h1 className="text-xl font-bold">Let's try that again</h1>
            <p
              role="alert"
              className="mt-3 text-sm leading-relaxed text-danger"
            >
              {error}
            </p>
            <button
              type="button"
              className={SUBMIT_CLASSES}
              onClick={retryAuth}
            >
              Retry connection
            </button>
          </>
        )}
      </section>
    </main>
  );
};

export { AuthStatus };
