// Read JWT_SECRET lazily at request time, never at module scope: `next build`
// imports every route handler while collecting page data and the env isn't
// present at build time. No fallback value — a missing secret must fail loudly
// rather than silently sign/verify tokens with a well-known string.
export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET must be set");
  }
  return secret;
}

// Encoded form for `jose` (jwtVerify / SignJWT).
export function getJwtSecretKey(): Uint8Array {
  return new TextEncoder().encode(getJwtSecret());
}
