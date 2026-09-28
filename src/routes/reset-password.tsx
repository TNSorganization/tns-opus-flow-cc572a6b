import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const password = String(form.get("password"));
    if (!/^\d{6}$/.test(password)) return toast.error("PIN must be 6 digits.");
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("PIN updated. Signing you in.");
    navigate({ to: "/home", replace: true });
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
              className="tracking-[0.5em] text-center font-mono"
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            Update password
          </Button>
        </form>
      </Card>
    </div>
  );
}
