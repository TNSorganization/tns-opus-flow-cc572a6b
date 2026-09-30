import type { EmailOtpType, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AuthIntent = "recovery" | "signup" | "invite" | "oauth" | "unknown";

export type ParsedAuthCallback =
  | { kind: "none"; intent: AuthIntent }
  | { kind: "error"; intent: AuthIntent; message: string }
  | { kind: "pkce"; intent: AuthIntent; code: string }
  | {
      kind: "implicit";
      intent: AuthIntent;
      accessToken: string;
      refreshToken: string;
    }
  | {
      kind: "otp";
      intent: AuthIntent;
      tokenHash: string;
      otpType: EmailOtpType;
    };

const OTP_TYPES = new Set<EmailOtpType>([
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
]);

function intentFrom(value: string | null): AuthIntent {
  if (value === "recovery" || value === "signup" || value === "invite" || value === "oauth") {
    return value;
  }
  return "unknown";
}

export function parseAuthCallback(input: string | URL): ParsedAuthCallback {
  const url = input instanceof URL ? input : new URL(input, "https://opus.local");
  const query = url.searchParams;
  const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
  const type = query.get("type") ?? hash.get("type");
  const intent = intentFrom(query.get("intent") ?? hash.get("intent") ?? type);
  const error =
    query.get("error_description") ??
    hash.get("error_description") ??
    query.get("error") ??
    hash.get("error");

  if (error) {
    return { kind: "error", intent, message: error.replace(/\+/g, " ") };
  }

  const accessToken = hash.get("access_token") ?? query.get("access_token");
  const refreshToken = hash.get("refresh_token") ?? query.get("refresh_token");
  if (accessToken && refreshToken) {
    return { kind: "implicit", intent, accessToken, refreshToken };
  }

  const tokenHash = query.get("token_hash") ?? hash.get("token_hash");
  if (tokenHash && type && OTP_TYPES.has(type as EmailOtpType)) {
    return { kind: "otp", intent, tokenHash, otpType: type as EmailOtpType };
  }

  const code = query.get("code");
  if (code) return { kind: "pkce", intent, code };

  return { kind: "none", intent };
}

export function hasAuthCallback(input: string | URL): boolean {
  return parseAuthCallback(input).kind !== "none";
}

export async function completeAuthCallback(input: string | URL): Promise<{
  session: Session | null;
  intent: AuthIntent;
}> {
  const callback = parseAuthCallback(input);
  if (callback.kind === "error") throw new Error(callback.message);

  if (callback.kind === "implicit") {
    const { data, error } = await supabase.auth.setSession({
      access_token: callback.accessToken,
      refresh_token: callback.refreshToken,
    });
    if (error) throw error;
    return { session: data.session, intent: callback.intent };
  }

  if (callback.kind === "otp") {
    const { data, error } = await supabase.auth.verifyOtp({
      token_hash: callback.tokenHash,
      type: callback.otpType,
    });
    if (error) throw error;
    return { session: data.session, intent: callback.intent };
  }

  if (callback.kind === "pkce") {
    const { data, error } = await supabase.auth.exchangeCodeForSession(callback.code);
    if (error) throw error;
    return { session: data.session, intent: callback.intent };
  }

  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return { session: data.session, intent: callback.intent };
}

export function passwordIssue(password: string): string | null {
  if (password.length < 6) return "Use at least 6 characters.";
  return null;
}

export function authErrorMessage(error: unknown): string {
  const message =
    error instanceof Error ? error.message : String(error || "Authentication failed.");
  const normalized = message.toLowerCase();

  if (
    normalized.includes("invalid login credentials") ||
    normalized.includes("invalid_credentials")
  ) {
    return "That email and password do not match. Try again or create a new reset link.";
  }
  if (normalized.includes("email not confirmed")) {
    return "Confirm your email first. You can resend the confirmation message below.";
  }
  if (normalized.includes("user already registered")) {
    return "An account already exists for this email. Sign in or reset its password.";
  }
  if (normalized.includes("same password")) {
    return "Choose a password that is different from your current password.";
  }
  if (normalized.includes("expired") || normalized.includes("otp_expired")) {
    return "This link has expired. Request a fresh password-reset email.";
  }
  if (normalized.includes("rate limit") || normalized.includes("over_email_send_rate_limit")) {
    return "Too many attempts were made. Wait a few minutes, then try again.";
  }
  if (normalized.includes("abort") || normalized.includes("took too long")) {
    return "The connection took too long. Check your internet connection and try again.";
  }

  return message;
}
