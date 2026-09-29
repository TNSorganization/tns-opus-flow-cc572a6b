import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { getSessionWithTimeout, withTimeout } from "@/lib/auth-session";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [canReset, setCanReset] = useState(false);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted || !session) return;
      setCanReset(true);
      setRecoveryError(null);
      setChecking(false);
    });

    getSessionWithTimeout(12_000)
      .then((session) => {
        if (!mounted) return;
        if (session) {
          setCanReset(true);
        } else {
          const query = new URLSearchParams(window.location.search);
          const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
          setRecoveryError(
            query.get("error_description") ||
              hash.get("error_description") ||
              "This reset link is invalid or has expired.",
          );
        }
      })
      .catch((error) => {
        if (!mounted) return;
        setRecoveryError(
          error instanceof Error
            ? error.message
            : "We couldn't open this reset link. Check your connection and try again.",
        );
      })
      .finally(() => {
        if (mounted) setChecking(false);
      });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const password = String(form.get("password"));
    const confirmation = String(form.get("password_confirmation"));
    if (password.length < 6) return toast.error("Password must be at least 6 characters.");
    if (password !== confirmation) return toast.error("The passwords do not match.");
    setLoading(true);
    try {
      const { error } = await withTimeout(supabase.auth.updateUser({ password }), 15_000);
      if (error) return toast.error(error.message);
      toast.success("Password updated.");
      navigate({ to: "/home", replace: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Password update failed.");
    } finally {
      setLoading(false);
    }
  }

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!canReset) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <Card className="surface w-full max-w-md p-6 text-center">
          <h1 className="text-xl font-semibold">Request a new reset link</h1>
          <p className="mt-2 text-sm text-muted-foreground">{recoveryError}</p>
          <Button asChild className="mt-6">
            <Link to="/forgot-password">Send another link</Link>
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="surface w-full max-w-md p-6">
        <h1 className="text-xl font-semibold">Set a new password</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Use at least 6 characters. Any letters, numbers, spaces, or symbols are accepted.
        </p>
        <form onSubmit={submit} className="mt-6 space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="pw">New password</Label>
            <Input
              id="pw"
              name="password"
              type="password"
              minLength={6}
              required
              autoComplete="new-password"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pw-confirmation">Confirm new password</Label>
            <Input
              id="pw-confirmation"
              name="password_confirmation"
              type="password"
              minLength={6}
              required
              autoComplete="new-password"
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Update password"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
