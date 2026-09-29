import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { getAppUrl } from "@/lib/app-url";

export const Route = createFileRoute("/forgot-password")({
  ssr: false,
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email")).trim().toLowerCase();
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: getAppUrl("reset-password"),
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    setSent(true);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="surface w-full max-w-md p-6">
        <h1 className="text-xl font-semibold">Reset your password</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Enter your email and we'll send you a reset link.
        </p>
        {sent ? (
          <p className="mt-6 rounded-md border border-border bg-muted/30 p-3 text-sm">
            Check your email for the reset link.
          </p>
        ) : (
          <form onSubmit={submit} className="mt-6 space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" required autoComplete="email" />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              Send reset link
            </Button>
          </form>
        )}
        <div className="mt-4 text-center text-sm">
          <Link to="/auth" className="text-muted-foreground hover:text-foreground">
            Back to sign in
          </Link>
        </div>
      </Card>
    </div>
  );
}
