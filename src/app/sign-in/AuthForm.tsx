"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, ErrorNote, Field, Input } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client";

type Mode = "sign-in" | "sign-up";

const ERRORS: Record<string, string> = {
  confirm_failed: "That confirmation link is invalid or has expired. Try signing in; if your email is not confirmed yet, create the account again to get a new link.",
  missing_code: "The sign-in link was incomplete. Please try again.",
};

export function AuthForm({ initialMode, next, error }: { initialMode: Mode; next: string; error: string | null }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(error ? (ERRORS[error] ?? "Something went wrong. Please try again.") : null);
  const [checkEmail, setCheckEmail] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    const supabase = supabaseBrowser();
    try {
      if (mode === "sign-in") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          setMessage(error.message === "Email not confirmed" ? "Please confirm your email first. Check your inbox for the link." : "Incorrect email or password.");
          return;
        }
        router.replace(next);
        router.refresh();
      } else {
        // Where to continue after confirming (e.g. a shared split). Kept in a short-lived cookie
        // because the email link itself carries only the confirmation token.
        document.cookie = `sm_next=${encodeURIComponent(next)}; path=/; max-age=3600; samesite=lax`;
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/auth/confirm` },
        });
        if (error) {
          setMessage(error.message);
          return;
        }
        if (data.session) {
          router.replace(next);
          router.refresh();
        } else {
          setCheckEmail(true);
        }
      }
    } catch {
      setMessage("Could not reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  if (checkEmail) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Check your email</h1>
        <p className="text-muted">
          We sent a confirmation link to <span className="text-fg">{email}</span>. Open it on this device to finish creating your account.
        </p>
        <Button variant="secondary" onClick={() => { setCheckEmail(false); setMode("sign-in"); }}>
          Back to sign in
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-5" noValidate={false}>
      <h1 className="text-2xl font-semibold">{mode === "sign-in" ? "Sign in" : "Create your account"}</h1>
      <Field label="Email">
        {(id) => <Input id={id} type="email" autoComplete="email" inputMode="email" required value={email} onChange={(e) => setEmail(e.target.value)} />}
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
          />
        )}
      </Field>
      <ErrorNote>{message}</ErrorNote>
      <Button type="submit" variant="primary" size="lg" className="w-full" busy={busy}>
        {mode === "sign-in" ? "Sign in" : "Create account"}
      </Button>
      <p className="text-center text-sm text-muted">
        {mode === "sign-in" ? "New to Splitmate?" : "Already have an account?"}{" "}
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
