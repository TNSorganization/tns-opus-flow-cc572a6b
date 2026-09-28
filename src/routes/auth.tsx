import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { getAppUrl } from "@/lib/app-url";

export const Route = createFileRoute("/auth")({
  ssr: false,
  component: AuthPage,
});

// 6-digit numeric password used across signup / signin / reset.
const PIN_RE = /^\d{6}$/;

function AuthPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);

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
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: String(form.get("email")),
      password,
    });
    if (error) {
      setLoading(false);
      return toast.error(error.message);
    }
    setLoading(false);
    navigate({ to: "/home", replace: true });
  }

  async function signUpEmail(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const matricule = String(form.get("matricule") ?? "").trim();
    const email = String(form.get("email"));
    const password = String(form.get("password"));
    const fullName = String(form.get("full_name") ?? "");
    if (!PIN_RE.test(password)) return toast.error("PIN must be 6 digits");
    setLoading(true);

    if (matricule) {
      const { data: m, error: mErr } = await supabase
        .from("matricules")
        .select("id, used_by, expires_at")
        .eq("code", matricule)
        .maybeSingle();
      if (mErr || !m || m.used_by || (m.expires_at && new Date(m.expires_at) < new Date())) {
        setLoading(false);
        return toast.error("Invalid or already-used matricule");
      }
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
      setLoading(false);
      return toast.error(error.message);
    }

    if (matricule && signUpData.session) {
      const { error: rErr } = await supabase.rpc("redeem_matricule", { _code: matricule });
      if (rErr) {
        setLoading(false);
        return toast.error(`Signup ok but matricule failed: ${rErr.message}`);
      }
    } else if (matricule) {
      try {
        localStorage.setItem("pending_matricule", matricule);
      } catch {
        /* ignore */
      }
    }

    setLoading(false);
    if (signUpData.session) {
      toast.success("Welcome! Now confirm your matricule in Settings to unlock the app.");
      navigate({ to: "/home", replace: true });
    } else {
      toast.success("Account created. Check your inbox to confirm your email.");
    }
  }

  async function google() {
    setLoading(true);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: getAppUrl(),
    });
    if (result.error) {
      setLoading(false);
      toast.error(result.error.message ?? "Google sign-in failed");
      return;
    }
    if (result.redirected) return;
    navigate({ to: "/home", replace: true });
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
          <Button
            variant="outline"
            className="w-full"
            onClick={google}
            disabled={loading}
            type="button"
          >
            <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
              <path
                fill="currentColor"
                d="M21.35 11.1H12v3.2h5.35c-.23 1.5-1.68 4.4-5.35 4.4-3.22 0-5.85-2.67-5.85-5.95S8.78 6.8 12 6.8c1.83 0 3.06.78 3.76 1.45l2.57-2.47C16.83 4.34 14.66 3.5 12 3.5 7.03 3.5 3 7.53 3 12.5s4.03 9 9 9c5.2 0 8.63-3.65 8.63-8.78 0-.6-.06-1.05-.13-1.62z"
              />
            </svg>
            Continue with Google
          </Button>

          <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
            <div className="h-px flex-1 bg-border" />
            or
            <div className="h-px flex-1 bg-border" />
          </div>

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
                    className="uppercase tracking-wider"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Required unless you're the first user. You'll re-confirm it in Settings to
                    unlock the app.
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
      </div>
    </div>
  );
}
