const STORAGE_KEY = "pending_matricule";

type PendingMatricule = {
  code: string;
  email: string | null;
};

export function normalizeMatriculeCode(value: string) {
  return value.trim().toUpperCase();
}

export function savePendingMatricule(code: string, email: string) {
  if (typeof window === "undefined") return;

  const normalizedCode = normalizeMatriculeCode(code);
  if (!normalizedCode) return;

  const pending: PendingMatricule = {
    code: normalizedCode,
    email: email.trim().toLowerCase() || null,
  };

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pending));
  } catch {
    // Storage can be unavailable in private browsing; signup should still continue.
  }
}

export function getPendingMatricule(email?: string | null): PendingMatricule | null {
  if (typeof window === "undefined") return null;

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;

    let pending: PendingMatricule;
    try {
      const parsed = JSON.parse(stored) as Partial<PendingMatricule>;
      if (typeof parsed.code !== "string") return null;
      pending = {
        code: normalizeMatriculeCode(parsed.code),
        email: typeof parsed.email === "string" ? parsed.email.toLowerCase() : null,
      };
    } catch {
      // Migrate codes stored by older app versions.
      pending = { code: normalizeMatriculeCode(stored), email: null };
    }

    if (!pending.code) return null;

    const normalizedEmail = email?.trim().toLowerCase();
    if (normalizedEmail && pending.email && normalizedEmail !== pending.email) return null;

    return pending;
  } catch {
    return null;
  }
}

export function clearPendingMatricule(code?: string) {
  if (typeof window === "undefined") return;

  try {
    if (code) {
      const pending = getPendingMatricule();
      if (pending && pending.code !== normalizeMatriculeCode(code)) return;
    }
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing else is required if browser storage is unavailable.
  }
}
