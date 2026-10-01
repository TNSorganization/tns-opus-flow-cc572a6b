export const TRUSTED_OWNER_EMAIL = "tnsorganization@gmail.com";

export function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

export function isTrustedOwnerEmail(value?: string | null) {
  return normalizeEmail(value ?? "") === TRUSTED_OWNER_EMAIL;
}

export function canSignUpWithoutMatricule(
  email: string | null | undefined,
  bootstrapAvailable: boolean,
) {
  return bootstrapAvailable || isTrustedOwnerEmail(email);
}
