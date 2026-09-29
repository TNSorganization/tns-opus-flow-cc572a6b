import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

const DEFAULT_SESSION_TIMEOUT_MS = 8_000;

export async function withTimeout<T>(
  value: PromiseLike<T>,
  timeoutMs = DEFAULT_SESSION_TIMEOUT_MS,
  message = "The connection took too long. Check your internet connection and try again.",
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve(value),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export async function getSessionWithTimeout(
  timeoutMs = DEFAULT_SESSION_TIMEOUT_MS,
): Promise<Session | null> {
  const { data, error } = await withTimeout(supabase.auth.getSession(), timeoutMs);
  if (error) throw error;
  return data.session;
}

// Browser session data is sufficient for UI routing; Supabase RLS remains the
// authority for every protected database operation.
export async function getSessionUser(timeoutMs = DEFAULT_SESSION_TIMEOUT_MS): Promise<User | null> {
  try {
    return (await getSessionWithTimeout(timeoutMs))?.user ?? null;
  } catch {
    // Callers already handle a missing user; fail closed instead of leaving an
    // action spinner active because session storage was temporarily unavailable.
    return null;
  }
}
