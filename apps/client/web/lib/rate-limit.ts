import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

// Fixed-window request counters held in this process. Prod runs a single web
// container, so this is a real per-client limit there; it resets on restart.
const windows = new Map<string, { count: number; resetAt: number }>();

// Counts a hit for `key`. Returns 0 if it is within `limit` per `windowMs`,
// otherwise the number of seconds until the window resets.
export function rateLimit(key: string, limit: number, windowMs: number): number {
  const now = Date.now();
  if (windows.size > 10_000) {
    for (const [k, w] of windows) if (w.resetAt <= now) windows.delete(k);
  }

  let window = windows.get(key);
  if (!window || window.resetAt <= now) {
    window = { count: 0, resetAt: now + windowMs };
    windows.set(key, window);
  }
  window.count++;
  return window.count <= limit ? 0 : Math.ceil((window.resetAt - now) / 1000);
}

// Caddy overwrites X-Forwarded-For with the client address it saw; without a
// proxy, Next fills it from the socket. Use the entry the nearest proxy added.
export function clientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  return forwarded?.split(',').at(-1)?.trim() || 'unknown';
}

export function rateLimitedResponse(retryAfter: number) {
  return NextResponse.json(
    { message: 'Too many requests. Please try again later.', retryAfter },
    { status: 429, headers: { 'Retry-After': String(retryAfter) } }
  );
}
