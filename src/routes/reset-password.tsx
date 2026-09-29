import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

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

    supabase.auth.getSession().then(({ data, error }) => {
      if (!mounted) return;
      if (data.session) {
        setCanReset(true);
      } else {
        const query = new URLSearchParams(window.location.search);
        const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
        setRecoveryError(
          query.get("error_description") ||
            hash.get("error_description") ||
            error?.message ||
            "This reset link is invalid or has expired.",
        );
      }
      setChecking(false);
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
    if (!/^\d{6}$/.test(password)) return toast.error("PIN must be 6 digits.");
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("PIN updated.");
    navigate({ to: "/home", replace: true });
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
        <h1 className="text-xl font-semibold">Set a new 6-digit PIN</h1>
        <form onSubmit={submit} className="mt-6 space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="pw">New PIN</Label>
            <Input
              id="pw"
              name="password"
              type="password"
              inputMode="numeric"
              pattern="\d{6}"
              maxLength={6}
              minLength={6}
              required
              autoComplete="new-password"
              className="tracking-[0.5em] text-center font-mono"
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Update PIN"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
