// Accounts are limited to WashU addresses. Shared by the API routes (the real
// enforcement) and the login page (early feedback), so keep it free of
// server-only imports.
export const ALLOWED_EMAIL_DOMAIN = "wustl.edu";

export const EMAIL_DOMAIN_ERROR = `Only @${ALLOWED_EMAIL_DOMAIN} email addresses are allowed`;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isAllowedEmail(email: unknown): boolean {
  if (typeof email !== "string") return false;
  const [local, domain, ...rest] = normalizeEmail(email).split("@");
  return (
    rest.length === 0 &&
    domain === ALLOWED_EMAIL_DOMAIN &&
    // Plain address characters only. Anything else (<, (, ;, :, ", ...) is
    // address-list syntax that the mailer would re-parse into a different
    // recipient than the address being verified.
    /^[a-z0-9._+-]+$/.test(local)
  );
}
