import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { getAppUrl } from "@/lib/app-url";
import {
  clearPendingMatricule,
  normalizeMatriculeCode,
  savePendingMatricule,
} from "@/lib/pending-matricule";

export const Route = createFileRoute("/auth")({
  ssr: false,
  component: AuthPage,
});

// 6-digit numeric password used across signup / signin / reset.
const PIN_RE = /^\d{6}$/;

function authErrorMessage(message: string) {
  const normalized = message.toLowerCase();

  if (normalized.includes("invalid login credentials")) return "Email or PIN is incorrect.";
  if (normalized.includes("email not confirmed")) {
    return "Confirm your email before signing in. Check your inbox for the confirmation link.";
  }
  if (normalized.includes("user already registered")) {
    return "An account already exists for this email. Sign in or use Forgot PIN.";
  }
  if (normalized.includes("rate limit")) {
    return "Too many attempts. Wait a few minutes, then try again.";
  }

  return message;
}

function AuthPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [confirmationEmail, setConfirmationEmail] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      if (data.session) navigate({ to: "/home", replace: true });
      else setChecking(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (session && (event === "SIGNED_IN" || event === "INITIAL_SESSION")) {
        navigate({ to: "/home", replace: true });
      }
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [navigate]);

  async function signInEmail(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const password = String(form.get("password"));
    if (!PIN_RE.test(password)) return toast.error("PIN must be 6 digits");
    const email = String(form.get("email")).trim().toLowerCase();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      setLoading(false);
      return toast.error(authErrorMessage(error.message));
    }
    setLoading(false);
    navigate({ to: "/home", replace: true });
  }

  async function signUpEmail(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const matricule = normalizeMatriculeCode(String(form.get("matricule") ?? ""));
    const email = String(form.get("email")).trim().toLowerCase();
    const password = String(form.get("password"));
    const fullName = String(form.get("full_name") ?? "").trim();
    if (!PIN_RE.test(password)) return toast.error("PIN must be 6 digits");
    setConfirmationEmail(null);
    setLoading(true);

    if (matricule) {
      const { data: m, error: mErr } = await supabase
        .from("matricules")
        .select("id, used_by, expires_at")
        .eq("code", matricule)
        .maybeSingle();
      if (mErr) {
        setLoading(false);
        return toast.error(
          "We couldn't verify the matricule. Check your connection and try again.",
        );
      }
      if (!m || m.used_by || (m.expires_at && new Date(m.expires_at) < new Date())) {
        setLoading(false);
        return toast.error("Invalid or already-used matricule");
      }
      savePendingMatricule(matricule, email);
    }

    const { data: signUpData, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: getAppUrl(),
        data: { full_name: fullName },
      },
    });
    if (error) {
      clearPendingMatricule(matricule || undefined);
      setLoading(false);
      return toast.error(authErrorMessage(error.message));
    }

    if (signUpData.user?.identities?.length === 0) {
      clearPendingMatricule(matricule || undefined);
      setLoading(false);
      return toast.error("An account already exists for this email. Sign in or use Forgot PIN.");
    }

    setLoading(false);
    if (signUpData.session) {
      toast.success("Account created. Activate your matricule to finish setup.");
      navigate({ to: "/home", replace: true });
    } else {
      setConfirmationEmail(email);
      toast.success("Account created. Check your inbox to confirm your email.");
    }
  }

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background px-4">
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          background:
            "radial-gradient(ellipse at top, color-mix(in oklab, var(--primary) 25%, transparent), transparent 55%)",
        }}
      />
      <div className="relative w-full max-w-md">
        <div className="mb-8 text-center">
          <BrandLogo kind="logo" className="mx-auto mb-5 w-56 max-w-[70vw]" />
          <h1 className="text-2xl font-semibold tracking-tight">Operations System</h1>
          <p className="mt-1 text-sm text-muted-foreground">Sign in with your 6-digit PIN.</p>
        </div>

        <Card className="surface p-6">
          {confirmationEmail && (
            <div
              className="mb-5 rounded-lg border border-brand-success/40 bg-brand-success/5 p-3 text-sm"
              role="status"
            >
              <p className="font-medium">Confirmation email sent</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Open the link sent to {confirmationEmail}. After confirmation, we'll bring you back
                to activate your matricule.
              </p>
            </div>
          )}

          <Tabs defaultValue="signin">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="signin">Sign in</TabsTrigger>
              <TabsTrigger value="signup">Create account</TabsTrigger>
            </TabsList>

            <TabsContent value="signin" className="mt-4">
              <form onSubmit={signInEmail} className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="si-email">Email</Label>
                  <Input id="si-email" name="email" type="email" required autoComplete="email" />
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="si-pw">6-digit PIN</Label>
                    <Link
                      to="/forgot-password"
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      Forgot?
                    </Link>
                  </div>
                  <Input
                    id="si-pw"
                    name="password"
                    type="password"
                    inputMode="numeric"
                    pattern="\d{6}"
                    maxLength={6}
                    minLength={6}
                    required
                    autoComplete="current-password"
                    className="tracking-[0.5em] text-center font-mono"
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sign in"}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="signup" className="mt-4">
              <form onSubmit={signUpEmail} className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="su-name">Full name</Label>
                  <Input id="su-name" name="full_name" type="text" required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="su-email">Email</Label>
                  <Input id="su-email" name="email" type="email" required autoComplete="email" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="su-pw">6-digit PIN</Label>
                  <Input
                    id="su-pw"
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
                <div className="space-y-1.5">
                  <Label htmlFor="su-matricule">Matricule</Label>
                  <Input
                    id="su-matricule"
                    name="matricule"
                    type="text"
                    placeholder="Code from the CEO"
                    autoComplete="off"
                    onChange={(event) => {
                      event.currentTarget.value = event.currentTarget.value.toUpperCase();
                    }}
                    className="uppercase tracking-wider"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Required unless you're the first user. We'll carry it through email confirmation
                    and prefill the activation step.
                  </p>
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create account"}
                </Button>
                <p className="text-center text-xs text-muted-foreground">
                  First user becomes CEO automatically.
                </p>
              </form>
            </TabsContent>
          </Tabs>
        </Card>
        <p className="mt-4 text-center text-xs text-muted-foreground">
          Google sign-in is temporarily unavailable. Use your email and 6-digit PIN.
        </p>
      </div>
    </div>
  );
}
