import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { AuthShell } from "@/components/auth-shell";
import { Button } from "@/components/ui/button";
import { authErrorMessage, completeAuthCallback } from "@/lib/auth-flow";
import { getAppUrl } from "@/lib/app-url";
import { withTimeout } from "@/lib/auth-session";

export const Route = createFileRoute("/callback")({
  ssr: false,
  component: AuthCallbackPage,
});

function AuthCallbackPage() {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    withTimeout(completeAuthCallback(window.location.href), 15_000)
      .then(({ session, intent }) => {
        if (!active) return;
        if (!session) throw new Error("The sign-in link did not create a session.");
        const destination = intent === "recovery" ? "reset-password" : "home";
        window.location.replace(getAppUrl(destination));
      })
      .catch((callbackError) => {
        if (active) setError(authErrorMessage(callbackError));
      });

    return () => {
      active = false;
    };
  }, []);

  return (
    <AuthShell
      eyebrow="Secure sign-in"
      title={error ? "We could not open this link" : "Finishing your sign-in"}
      description={
        error
          ? "The link may be expired, already used, or opened in a different browser."
          : "Opus is exchanging the one-time link for a secure session."
      }
      footer={
        error ? (
          <Link
            to="/auth"
            className="block text-center text-sm font-semibold text-primary hover:underline"
          >
            Back to sign in
          </Link>
        ) : undefined
      }
    >
      {error ? (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-5">
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
          <Button asChild className="mt-5 w-full">
            <Link to="/forgot-password">Request a new password link</Link>
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin text-primary" /> Verifying with Supabase...
        </div>
      )}
    </AuthShell>
  );
}
