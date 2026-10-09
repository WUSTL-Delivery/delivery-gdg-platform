import { createHmac, randomInt, timingSafeEqual } from "crypto";
import { getJwtSecret } from "@/lib/jwt-secret";

// Sign-up email verification codes. A short numeric code (rather than a
// link) survives Outlook Safe Links pre-fetching on @wustl.edu mailboxes and
// can be typed on a different device than the one that received the email.
export const CODE_TTL_MS = 15 * 60 * 1000;
export const RESEND_COOLDOWN_MS = 60 * 1000;
export const MAX_ATTEMPTS = 5;

export function generateVerificationCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

// Codes are only 6 digits, so a plain hash would be trivial to reverse from a
// database dump. Key it with the server secret and bind it to the sign-up it
// was issued for.
export function hashVerificationCode(signupId: string, code: string): string {
  return createHmac("sha256", getJwtSecret())
    .update(`email-verification:${signupId}:${code}`)
    .digest("hex");
}

export function isCorrectVerificationCode(
  signupId: string,
  code: string,
  storedHash: string
): boolean {
  const expected = Buffer.from(hashVerificationCode(signupId, code), "hex");
  const actual = Buffer.from(storedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
