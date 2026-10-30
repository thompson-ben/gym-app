"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { IconCheck } from "@/components/icons";
import { Button, ErrorNote, Field, Input } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client";
import { DEMO_COOKIE } from "@/lib/demo";
import { IN_APP_NAME, PROVIDER_LABEL, signupErrorMessage, signupErrorReason, type InApp, type OAuthProvider, type SignupErrorReason } from "@/lib/auth-providers";
import { isNativeApp } from "@/lib/native";
import { nativeAppleSignIn } from "@/lib/native-apple";
import { pixelEvent, pixelStep } from "@/lib/pixel";
import { trackSignupStep, trackSignupView } from "@/lib/track";

type Mode = "sign-in" | "sign-up";

const ERRORS: Record<string, string> = {
  confirm_failed: "That confirmation link is invalid or has expired. Try signing in; if your email is not confirmed yet, create the account again to get a new link.",
  missing_code: "The sign-in link was incomplete. Please try again.",
  oauth_cancelled: signupErrorMessage("oauth_cancelled"),
  oauth_failed: signupErrorMessage("oauth_failed"),
};

export function AuthForm({
  initialMode,
  next,
  error,
  initialEmail = "",
  providers = [],
  inApp = null,
  paidPlans = false,
}: {
  initialMode: Mode;
  next: string;
  error: string | null;
  initialEmail?: string;
  /** Apple / Google, once switched on (AUTH_PROVIDERS). */
  providers?: OAuthProvider[];
  /** Open inside the Facebook / Instagram app's browser, where Google sign-in is refused. */
  inApp?: InApp | null;
  /** Paid plans are live, so new accounts start a 14-day trial (otherwise early access is free). */
  paidPlans?: boolean;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(initialMode);
  useEffect(() => {
    if (mode === "sign-up") trackSignupView();
  }, [mode]);
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(error ? (ERRORS[error] ?? "Something went wrong. Please try again.") : null);
  const [checkEmail, setCheckEmail] = useState(false);
  const [unconfirmed, setUnconfirmed] = useState(false);
  const [resend, setResend] = useState<"idle" | "sending" | "sent" | "error">("idle");

  async function resendConfirmation() {
    if (!email || resend === "sending") return;
    setResend("sending");
    const { error } = await supabaseBrowser().auth.resend({
      type: "signup",
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/confirm` },
    });
    setResend(error ? "error" : "sent");
  }

  // Where to continue afterwards (e.g. a shared split). Kept in a short-lived cookie because the
  // email link, and the return from Apple or Google, carry only a one-time code.
  function rememberNext() {
    document.cookie = `sm_next=${encodeURIComponent(next)}; path=/; max-age=3600; samesite=lax`;
  }

  function failSignup(reason: SignupErrorReason) {
    trackSignupStep("signup_error", reason);
    setMessage(signupErrorMessage(reason));
  }

  async function continueWith(provider: OAuthProvider) {
    setMessage(null);
    if (mode === "sign-up") trackSignupStep("oauth_start", provider);
    // In the iOS app: Apple's own sheet, signed in on the spot (no redirect to come back from).
    if (provider === "apple" && isNativeApp()) {
      const result = await nativeAppleSignIn(supabaseBrowser());
      if (!result.ok) return failSignup(result.reason === "cancelled" ? "oauth_cancelled" : "oauth_failed");
      router.replace(next);
      router.refresh();
      return;
    }
    rememberNext();
    try {
      const { error } = await supabaseBrowser().auth.signInWithOAuth({
        provider,
        options: { redirectTo: `${window.location.origin}/auth/confirm` },
      });
      if (error) failSignup("oauth_failed");
    } catch {
      failSignup("network");
    }
  }

  /** The browser stopped the form before it was sent (e.g. a mistyped email). */
  function invalidField(reason: SignupErrorReason) {
    if (mode === "sign-up") trackSignupStep("signup_error", reason);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    const supabase = supabaseBrowser();
    try {
      if (mode === "sign-in") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          const notConfirmed = error.message === "Email not confirmed";
          setUnconfirmed(notConfirmed);
          setResend("idle");
          // Only a rejected password counts as "incorrect"; anything else (a bad key, an outage, a
          // rate limit) says so, with its code, rather than sending people to reset a good password.
          const wrongPassword = error.code === "invalid_credentials" || error.message === "Invalid login credentials";
          setMessage(
            notConfirmed
              ? "Please confirm your email first. Check your inbox for the link."
              : wrongPassword
                ? "Incorrect email or password."
                : error.status === 429
                  ? signupErrorMessage("rate_limited")
                  : `Couldn’t sign in just now (${error.code ?? error.status ?? "error"}). Please try again in a moment.`,
          );
          return;
        }
        router.replace(next);
        router.refresh();
      } else {
        trackSignupStep("signup_submit");
        rememberNext();
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/confirm`,
            // Came from the "Try a workout" demo: the account starts with the same split (see Train).
            ...(document.cookie.includes(`${DEMO_COOKIE}=`) ? { data: { via: "demo" } } : {}),
          },
        });
        if (error) {
          failSignup(signupErrorReason(error));
          return;
        }
        pixelEvent("CompleteRegistration");
        if (data.session) {
          router.replace(next);
          router.refresh();
        } else {
          setCheckEmail(true);
        }
      }
    } catch {
      if (mode === "sign-up") failSignup("network");
      else setMessage(signupErrorMessage("network"));
    } finally {
      setBusy(false);
    }
  }

  if (checkEmail) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Check your email</h1>
        <p className="text-muted">
          We sent a confirmation link to <span className="text-fg">{email}</span>. Open it to finish creating your account. It can take a minute.
        </p>
        <p className="rounded-2xl border border-accent-text/50 bg-accent-soft px-4 py-3 text-sm">
          <span className="font-medium">Not in your inbox?</span>{" "}
          <span className="text-muted">Check your Junk or Spam folder for “Confirm your Setmodo account”, and mark it “Not junk” so your workout reminders arrive too.</span>
        </p>
        <ResendLine state={resend} onResend={resendConfirmation} />
        <Button variant="secondary" onClick={() => { setCheckEmail(false); setMode("sign-in"); }}>
          Back to sign in
        </Button>
      </div>
    );
  }

  return (
    <form
      onSubmit={submit}
      // First tap into the create-account form (nothing typed is recorded).
      onFocusCapture={() => {
        if (mode !== "sign-up") return;
        trackSignupStep("signup_started");
        pixelStep("signup_started");
      }}
      className="space-y-5"
      noValidate={false}
    >
      <h1 className="text-2xl font-semibold">{mode === "sign-in" ? "Sign in" : "Create your account"}</h1>
      {mode === "sign-up" ? <Reassurance paidPlans={paidPlans} /> : null}
      {/* With Apple / Google above the form, the terms come first so they're seen before either. */}
      {mode === "sign-up" && providers.length ? <TermsLine /> : null}
      {providers.length ? <ProviderButtons providers={providers} inApp={inApp} onChoose={continueWith} /> : null}
      <Field label="Email">
        {(id) => (
          <Input
            id={id}
            type="email"
            autoComplete="email"
            inputMode="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onInvalid={() => invalidField("invalid_email")}
          />
        )}
      </Field>
      <Field
        label="Password"
        hint={
          mode === "sign-up" ? (
            "At least 8 characters."
          ) : (
            <Link href={`/forgot-password${email ? `?email=${encodeURIComponent(email)}` : ""}`} className="font-medium text-accent-text underline-offset-4 hover:underline">
              Forgot password?
            </Link>
          )
        }
      >
        {(id, describedBy) => (
          <Input
            id={id}
            type="password"
            aria-describedby={describedBy}
            autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
            minLength={mode === "sign-up" ? 8 : undefined}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onInvalid={() => invalidField("short_password")}
          />
        )}
      </Field>
      <ErrorNote>{message}</ErrorNote>
      {unconfirmed && mode === "sign-in" ? <ResendLine state={resend} onResend={resendConfirmation} /> : null}
      {mode === "sign-up" && !providers.length ? <TermsLine /> : null}
      <Button type="submit" variant="primary" size="lg" className="w-full" busy={busy}>
        {mode === "sign-in" ? "Sign in" : "Create account"}
      </Button>
      <p className="text-center text-sm text-muted">
        {mode === "sign-in" ? "New to Setmodo?" : "Already have an account?"}{" "}
        <button
          type="button"
          className="font-medium text-accent-text underline-offset-4 hover:underline"
          onClick={() => { setMode(mode === "sign-in" ? "sign-up" : "sign-in"); setMessage(null); }}
        >
          {mode === "sign-in" ? "Create an account" : "Sign in"}
        </button>
      </p>
    </form>
  );
}

/** What people get, at the moment they decide whether to finish signing up. */
function Reassurance({ paidPlans }: { paidPlans: boolean }) {
  const points = paidPlans ? ["14 days free", "No card needed", "Takes 30 seconds"] : ["Free during early access", "No card needed", "Takes 30 seconds"];
  return (
    <ul aria-label="What you get" className="-mt-2 flex flex-wrap gap-x-4 gap-y-1.5 text-sm text-muted">
      {points.map((p) => (
        <li key={p} className="flex items-center gap-1.5">
          <IconCheck size={16} className="text-accent-text" />
          {p}
        </li>
      ))}
    </ul>
  );
}

function TermsLine() {
  return (
    <p className="text-sm text-faint">
      By creating an account you agree to the{" "}
      <Link href="/terms" className="text-muted underline underline-offset-4">Terms</Link> and{" "}
      <Link href="/privacy" className="text-muted underline underline-offset-4">Privacy</Link> notice.
    </p>
  );
}

function ResendLine({ state, onResend }: { state: "idle" | "sending" | "sent" | "error"; onResend: () => void }) {
  if (state === "sent") {
    return <p role="status" className="text-sm text-muted">A new confirmation email is on its way. Use the newest one; older links stop working.</p>;
  }
  return (
    <p className="text-sm text-muted">
      {state === "error" ? "Could not send just now. Wait a minute and " : "No email? "}
      <button type="button" onClick={onResend} disabled={state === "sending"} className="font-medium text-accent-text underline-offset-4 hover:underline disabled:opacity-50">
        {state === "sending" ? "Sending…" : state === "error" ? "try again" : "Resend confirmation email"}
      </button>
    </p>
  );
}

/**
 * Continue with Apple / Google, above the email form. Inside the Facebook or Instagram app,
 * Google refuses to sign in, so its button is replaced by how to open a normal browser.
 */
function ProviderButtons({ providers, inApp, onChoose }: { providers: OAuthProvider[]; inApp: InApp | null; onChoose: (p: OAuthProvider) => void }) {
  const [busy, setBusy] = useState<OAuthProvider | null>(null);
  const googleBlocked = inApp !== null && providers.includes("google");
  const shown = providers.filter((p) => !(p === "google" && googleBlocked));
  const choose = (p: OAuthProvider) => {
    setBusy(p);
    onChoose(p);
    // If the page is still here (an error, or the browser blocked the redirect), allow a retry.
    window.setTimeout(() => setBusy(null), 4000);
  };
  return (
    <div className="space-y-3">
      {shown.map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => choose(p)}
          disabled={busy !== null}
          className={
            p === "apple"
              ? "flex h-12 w-full items-center justify-center gap-2.5 rounded-2xl bg-fg text-base font-semibold text-bg disabled:opacity-60"
              : "flex h-12 w-full items-center justify-center gap-2.5 rounded-2xl border border-line bg-surface text-base font-semibold text-fg disabled:opacity-60"
          }
        >
          {p === "apple" ? <AppleLogo /> : <GoogleLogo />}
          {busy === p ? "Opening…" : `Continue with ${PROVIDER_LABEL[p]}`}
        </button>
      ))}
      {googleBlocked ? (
        <p className="rounded-2xl bg-surface-2 px-4 py-3 text-sm text-muted">
          Google sign-in doesn’t work inside {IN_APP_NAME[inApp!]}. To use it, open this page in Safari or Chrome (tap <span aria-label="the menu">⋯</span> then{" "}
          <strong className="font-medium text-fg">Open in browser</strong>){shown.length ? ", or continue with Apple or your email here." : ", or use your email here."}
        </p>
      ) : null}
      <div className="flex items-center gap-3 text-sm text-faint" aria-hidden="true">
        <span className="h-px flex-1 bg-line" />
        or with email
        <span className="h-px flex-1 bg-line" />
      </div>
    </div>
  );
}

function AppleLogo() {
  return (
    <svg width="18" height="20" viewBox="0 0 384 512" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z"
      />
    </svg>
  );
}

function GoogleLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}
