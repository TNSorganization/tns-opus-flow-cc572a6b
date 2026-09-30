import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { KeyRound, Loader2, ShieldCheck } from "lucide-react";
import { AuthShell } from "@/components/auth-shell";
import { PasswordField } from "@/components/password-field";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import {
  authErrorMessage,
  completeAuthCallback,
  hasAuthCallback,
  passwordIssue,
} from "@/lib/auth-flow";
import { getAppUrl } from "@/lib/app-url";
import { withTimeout } from "@/lib/auth-session";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const [checking, setChecking] = useState(true);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active || !session) return;
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") {
        setReady(true);
        setError(null);
        setChecking(false);
      }
    });

    async function initialize() {
      try {
        const callbackPresent = hasAuthCallback(window.location.href);
        const result = await withTimeout(completeAuthCallback(window.location.href), 15_000);
        if (!active) return;
        if (!result.session) throw new Error("This password-reset link is invalid or has expired.");
        setReady(true);
        setError(null);
        if (callbackPresent) {
          window.history.replaceState({}, document.title, getAppUrl("reset-password"));
        }
      } catch (recoveryError) {
        if (active) setError(authErrorMessage(recoveryError));
      } finally {
        if (active) setChecking(false);
      }
    }

    void initialize();
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    const confirmation = String(form.get("password_confirmation") ?? "");
    const issue = passwordIssue(password);
    setError(null);

    if (issue) return setError(issue);
    if (password !== confirmation) return setError("The two passwords do not match exactly.");
    setLoading(true);

    try {
      const { data, error: updateError } = await withTimeout(
        supabase.auth.updateUser({ password }),
        15_000,
      );
      if (updateError) throw updateError;
      if (!data.user) throw new Error("Supabase did not confirm the password update.");

      const { error: signOutError } = await supabase.auth.signOut({ scope: "global" });
      if (signOutError) await supabase.auth.signOut({ scope: "local" });
      window.location.replace(getAppUrl("auth?password=updated"));
    } catch (updateError) {
      setError(authErrorMessage(updateError));
      setLoading(false);
    }
  }

  if (checking) {
    return (
      <AuthShell
        eyebrow="Secure recovery"
        title="Opening your reset link"
        description="Opus is validating this one-time link with Supabase."
      >
        <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin text-primary" /> Checking link...
        </div>
      </AuthShell>
    );
  }

  if (!ready) {
    return (
      <AuthShell
        eyebrow="Secure recovery"
        title="This link cannot be used"
        description="Recovery links are single-use and expire. Requesting a new one is the safest next step."
        footer={
          <Link
            to="/auth"
            className="block text-center text-sm font-semibold text-primary hover:underline"
          >
            Back to sign in
          </Link>
        }
      >
        <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-5">
          <p className="text-sm text-destructive">{error || "This link is invalid or expired."}</p>
          <Button asChild className="mt-5 w-full">
            <Link to="/forgot-password">Request a new reset link</Link>
          </Button>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      eyebrow="Secure recovery"
      title="Choose a new password"
      description="Your new password is saved exactly as typed. Spaces, symbols, accents, and mixed scripts are accepted."
      footer={
        <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="h-4 w-4 text-brand-success" /> One-time encrypted recovery session
        </div>
      }
    >
      <form onSubmit={submit} className="space-y-5" noValidate>
        {error && (
          <div
            className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
            role="alert"
          >
            {error}
          </div>
        )}
        <div className="rounded-2xl border border-border bg-card/70 p-4">
          <div className="flex items-center gap-2 text-xs font-semibold text-brand-success">
            <KeyRound className="h-4 w-4" /> Reset link verified
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="new-password">New password</Label>
          <PasswordField
            id="new-password"
            name="password"
            minLength={6}
            required
            autoComplete="new-password"
            className="h-11"
            autoFocus
          />
          <p className="text-[11px] leading-5 text-muted-foreground">
            Minimum 6 characters. No required combination of numbers, capitals, or symbols.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm-password">Confirm new password</Label>
          <PasswordField
            id="confirm-password"
            name="password_confirmation"
            minLength={6}
            required
            autoComplete="new-password"
            className="h-11"
          />
        </div>
        <Button type="submit" className="h-11 w-full" disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save new password"}
        </Button>
      </form>
    </AuthShell>
  );
}
