import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, MailWarning } from "lucide-react";
import { toast } from "sonner";
import { AuthShell } from "@/components/auth-shell";
import { PasswordField } from "@/components/password-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { canSignUpWithoutMatricule, isTrustedOwnerEmail, normalizeEmail } from "@/lib/access";
import { authErrorMessage, passwordIssue } from "@/lib/auth-flow";
import { getAppUrl } from "@/lib/app-url";
import { getSessionWithTimeout, withTimeout } from "@/lib/auth-session";
import {
  clearPendingMatricule,
  normalizeMatriculeCode,
  savePendingMatricule,
} from "@/lib/pending-matricule";
import { isMissingRpcError } from "@/lib/supabase-errors";

export const Route = createFileRoute("/auth")({
  ssr: false,
  component: AuthPage,
});

type PendingAction = "signin" | "signup" | "resend" | null;

function AuthPage() {
  const navigate = useNavigate();
  const [pending, setPending] = useState<PendingAction>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmationEmail, setConfirmationEmail] = useState<string | null>(null);
  const [signupEmail, setSignupEmail] = useState("");
  const [bootstrapAvailable, setBootstrapAvailable] = useState<boolean | null>(null);
  const trustedOwnerSignup = isTrustedOwnerEmail(signupEmail);
  const passwordChanged = new URL(window.location.href).searchParams.get("password") === "updated";

  useEffect(() => {
    let active = true;

    getSessionWithTimeout(4_000)
      .then((session) => {
        if (active && session) navigate({ to: "/home", replace: true });
      })
      .catch(() => {
        // Keep the form usable if restoring an old session times out.
      });

    withTimeout(supabase.rpc("is_admin_bootstrap_available"), 10_000)
      .then(({ data: available, error }) => {
        if (error) throw error;
        if (active) setBootstrapAvailable(available === true);
      })
      .catch(() => {
        // Fail closed: if setup cannot be checked, regular signups still need a matricule.
        if (active) setBootstrapAvailable(false);
      });

    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active || !session) return;
      if (event === "PASSWORD_RECOVERY") {
        navigate({ to: "/reset-password", replace: true });
      } else if (event === "SIGNED_IN") {
        navigate({ to: "/home", replace: true });
      }
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [navigate]);

  async function signInEmail(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = normalizeEmail(String(form.get("email") ?? ""));
    const password = String(form.get("password") ?? "");
    setFormError(null);
    setPending("signin");

    try {
      const { data, error } = await withTimeout(
        supabase.auth.signInWithPassword({ email, password }),
        15_000,
      );
      if (error) throw error;
      if (!data.session) throw new Error("Supabase did not create a sign-in session.");
      navigate({ to: "/home", replace: true });
    } catch (error) {
      const message = authErrorMessage(error);
      if (message.toLowerCase().includes("confirm your email")) setConfirmationEmail(email);
      setFormError(message);
    } finally {
      setPending(null);
    }
  }

  async function validateMatricule(matricule: string, email: string): Promise<boolean> {
    const { data, error } = await withTimeout(
      supabase.rpc("validate_matricule", { _code: matricule, _email: email }),
      15_000,
    );
    if (!error) return data === true;
    if (!isMissingRpcError(error)) throw error;

    const { data: legacy, error: legacyError } = await withTimeout(
      supabase
        .from("matricules")
        .select("id, used_by, expires_at, email")
        .eq("code", matricule)
        .maybeSingle(),
      15_000,
    );
    if (legacyError) throw legacyError;
    return (
      !!legacy &&
      !legacy.used_by &&
      (!legacy.expires_at || new Date(legacy.expires_at) >= new Date()) &&
      (!legacy.email || legacy.email.trim().toLowerCase() === email)
    );
  }

  async function signUpEmail(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const fullName = String(form.get("full_name") ?? "").trim();
    const email = normalizeEmail(String(form.get("email") ?? ""));
    const password = String(form.get("password") ?? "");
    const matricule = normalizeMatriculeCode(String(form.get("matricule") ?? ""));
    const trustedOwner = isTrustedOwnerEmail(email);
    const bootstrapAdmin = bootstrapAvailable === true;
    const matriculeExempt = canSignUpWithoutMatricule(email, bootstrapAdmin);
    const issue = passwordIssue(password);

    setFormError(null);
    setConfirmationEmail(null);
    if (issue) return setFormError(issue);
    if (!matriculeExempt && !matricule) {
      return setFormError("Enter the matricule issued to you by TNS.");
    }
    setPending("signup");

    try {
      if (matriculeExempt) {
        clearPendingMatricule();
      } else {
        const valid = await validateMatricule(matricule, email);
        if (!valid) {
          setFormError(
            "This matricule is invalid, expired, already used, or assigned to another email.",
          );
          return;
        }
        savePendingMatricule(matricule, email);
      }

      const { data, error } = await withTimeout(
        supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: getAppUrl("callback?intent=signup"),
            data: { full_name: fullName },
          },
        }),
        15_000,
      );
      if (error) throw error;

      if (data.user?.identities?.length === 0) {
        clearPendingMatricule(matriculeExempt ? undefined : matricule);
        setFormError("An account already exists for this email. Sign in or reset its password.");
        return;
      }

      if (data.session) {
        if (matriculeExempt) {
          toast.success("Administrator account created. Welcome to Opus.");
          navigate({ to: "/home", replace: true });
        } else {
          toast.success("Account created. Confirm your matricule to unlock the workspace.");
          navigate({ to: "/settings", replace: true });
        }
      } else {
        setConfirmationEmail(email);
      }
    } catch (error) {
      clearPendingMatricule(matriculeExempt ? undefined : matricule);
      setFormError(authErrorMessage(error));
    } finally {
      setPending(null);
    }
  }

  async function resendConfirmation() {
    if (!confirmationEmail) return;
    setPending("resend");
    setFormError(null);
    try {
      const { error } = await withTimeout(
        supabase.auth.resend({
          type: "signup",
          email: confirmationEmail,
          options: { emailRedirectTo: getAppUrl("callback?intent=signup") },
        }),
        15_000,
      );
      if (error) throw error;
      toast.success("A fresh confirmation email was sent.");
    } catch (error) {
      setFormError(authErrorMessage(error));
    } finally {
      setPending(null);
    }
  }

  return (
    <AuthShell
      eyebrow="TNS Operations"
      title="Welcome to Opus"
      description="Use your TNS account to enter the workspace. Passwords are case-sensitive and are never trimmed or rewritten."
      footer={
        <p className="text-center text-xs leading-5 text-muted-foreground">
          {bootstrapAvailable
            ? "The first account becomes the workspace administrator."
            : "Need access? Ask your TNS administrator for a matricule."}
        </p>
      }
    >
      {passwordChanged && (
        <div className="mb-5 flex gap-3 rounded-xl border border-brand-success/30 bg-brand-success/10 p-3 text-sm">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-success" />
          <div>
            <p className="font-semibold">Password updated</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Sign in with the exact new password you just saved.
            </p>
          </div>
        </div>
      )}

      {confirmationEmail && (
        <div className="mb-5 rounded-xl border border-brand-yellow/30 bg-brand-yellow/10 p-3 text-sm">
          <div className="flex gap-3">
            <MailWarning className="mt-0.5 h-4 w-4 shrink-0 text-brand-yellow" />
            <div>
              <p className="font-semibold">Check {confirmationEmail}</p>
              <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                Open the newest confirmation email. Older links may already be expired.
              </p>
              <button
                type="button"
                className="mt-2 text-xs font-semibold text-primary hover:underline"
                disabled={pending === "resend"}
                onClick={resendConfirmation}
              >
                {pending === "resend" ? "Sending..." : "Resend confirmation"}
              </button>
            </div>
          </div>
        </div>
      )}

      {formError && (
        <div
          className="mb-5 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
          role="alert"
        >
          {formError}
        </div>
      )}

      <Tabs defaultValue="signin">
        <TabsList className="grid h-11 w-full grid-cols-2 rounded-xl">
          <TabsTrigger value="signin" className="rounded-lg">
            Sign in
          </TabsTrigger>
          <TabsTrigger value="signup" className="rounded-lg">
            Create account
          </TabsTrigger>
        </TabsList>

        <TabsContent value="signin" className="mt-5">
          <form onSubmit={signInEmail} className="space-y-4" noValidate>
            <div className="space-y-2">
              <Label htmlFor="signin-email">Email address</Label>
              <Input
                id="signin-email"
                name="email"
                type="email"
                required
                autoComplete="email"
                inputMode="email"
                className="h-11"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="signin-password">Password</Label>
                <Link
                  to="/forgot-password"
                  className="text-xs font-semibold text-primary hover:underline"
                >
                  Reset password
                </Link>
              </div>
              <PasswordField
                id="signin-password"
                name="password"
                required
                autoComplete="current-password"
                className="h-11"
              />
            </div>
            <Button type="submit" className="h-11 w-full" disabled={pending !== null}>
              {pending === "signin" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Open Opus"}
            </Button>
          </form>
        </TabsContent>

        <TabsContent value="signup" className="mt-5">
          <form onSubmit={signUpEmail} className="space-y-4" noValidate>
            <div className="space-y-2">
              <Label htmlFor="signup-name">Full name</Label>
              <Input
                id="signup-name"
                name="full_name"
                required
                autoComplete="name"
                className="h-11"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="signup-email">Email address</Label>
              <Input
                id="signup-email"
                name="email"
                type="email"
                required
                autoComplete="email"
                inputMode="email"
                className="h-11"
                value={signupEmail}
                onChange={(event) => setSignupEmail(event.currentTarget.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="signup-password">Password</Label>
              <PasswordField
                id="signup-password"
                name="password"
                minLength={6}
                required
                autoComplete="new-password"
                className="h-11"
              />
              <p className="text-[11px] leading-5 text-muted-foreground">
                At least 6 characters. Spaces, symbols, accents, and mixed scripts are accepted.
              </p>
            </div>
            {trustedOwnerSignup ? (
              <div
                className="rounded-xl border border-brand-success/30 bg-brand-success/10 p-3 text-sm"
                role="status"
              >
                <p className="font-semibold text-foreground">TNS owner account recognized</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  No matricule is required for this organization email.
                </p>
              </div>
            ) : bootstrapAvailable === null ? (
              <div
                className="flex items-center gap-3 rounded-xl border border-border bg-muted/40 p-3 text-sm text-muted-foreground"
                role="status"
              >
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
                Checking whether this is the first account...
              </div>
            ) : bootstrapAvailable ? (
              <div
                className="rounded-xl border border-brand-success/30 bg-brand-success/10 p-3 text-sm"
                role="status"
              >
                <p className="font-semibold text-foreground">Create the first administrator</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  No matricule is required. This account will be able to issue matricules to the
                  rest of the team.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="signup-matricule">Matricule</Label>
                <Input
                  id="signup-matricule"
                  name="matricule"
                  required
                  autoComplete="off"
                  placeholder="Code issued by TNS"
                  className="h-11 uppercase tracking-wider"
                  onChange={(event) => {
                    event.currentTarget.value = event.currentTarget.value.toUpperCase();
                  }}
                />
              </div>
            )}
            <Button
              type="submit"
              className="h-11 w-full"
              disabled={pending !== null || (!trustedOwnerSignup && bootstrapAvailable === null)}
            >
              {pending === "signup" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Create account"
              )}
            </Button>
          </form>
        </TabsContent>
      </Tabs>
    </AuthShell>
  );
}
