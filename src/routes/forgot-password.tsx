import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { CheckCircle2, Loader2, Mail } from "lucide-react";
import { AuthShell } from "@/components/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { authErrorMessage } from "@/lib/auth-flow";
import { getAppUrl } from "@/lib/app-url";
import { withTimeout } from "@/lib/auth-session";

export const Route = createFileRoute("/forgot-password")({
  ssr: false,
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const [loading, setLoading] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "")
      .trim()
      .toLowerCase();
    setError(null);
    setLoading(true);

    try {
      const { error: resetError } = await withTimeout(
        supabase.auth.resetPasswordForEmail(email, {
          redirectTo: getAppUrl("callback?intent=recovery"),
        }),
        15_000,
      );
      if (resetError) throw resetError;
      setSentTo(email);
    } catch (resetError) {
      setError(authErrorMessage(resetError));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      eyebrow="Account recovery"
      title={sentTo ? "Check your inbox" : "Reset your password"}
      description={
        sentTo
          ? "Use the newest email from TNS Opus. For security, older recovery links may stop working."
          : "We will email you a secure link that opens the current Opus password screen."
      }
      footer={
        <div className="text-center text-sm">
          <Link to="/auth" className="font-semibold text-primary hover:underline">
            Back to sign in
          </Link>
        </div>
      }
    >
      {sentTo ? (
        <div className="rounded-2xl border border-brand-success/30 bg-brand-success/10 p-5">
          <div className="flex gap-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-brand-success" />
            <div>
              <p className="font-semibold">Recovery email requested</p>
              <p className="mt-1 break-all text-sm text-muted-foreground">{sentTo}</p>
            </div>
          </div>
          <div className="mt-5 rounded-xl border border-border/70 bg-card/70 p-3 text-xs leading-5 text-muted-foreground">
            Keep this browser open, check Spam if needed, and open only the most recent reset email.
          </div>
          <Button
            type="button"
            variant="outline"
            className="mt-5 w-full"
            onClick={() => setSentTo(null)}
          >
            Send to another email
          </Button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-5" noValidate>
          {error && (
            <div
              className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
              role="alert"
            >
              {error}
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="recovery-email">Email address</Label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="recovery-email"
                name="email"
                type="email"
                required
                autoComplete="email"
                inputMode="email"
                className="h-11 pl-10"
                autoFocus
              />
            </div>
          </div>
          <Button type="submit" className="h-11 w-full" disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Email me a reset link"}
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
