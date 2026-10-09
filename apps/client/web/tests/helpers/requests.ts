import { NextRequest } from "next/server";

// Each request gets its own client address unless a test pins one, so the
// per-IP limits only come into play in the tests about them.
let nextIp = 0;
function headers(cookies: Record<string, string>, ip?: string) {
  const cookie = Object.entries(cookies)
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
  return {
    "x-forwarded-for": ip ?? `10.0.${(nextIp >> 8) & 255}.${nextIp++ & 255}`,
    ...(cookie ? { cookie } : {}),
  };
}

export function post(
  path: string,
  body: unknown,
  cookies: Record<string, string> = {},
  ip?: string
) {
  return new NextRequest(`http://localhost${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers(cookies, ip) },
    body: JSON.stringify(body),
  });
}

export function get(path: string, cookies: Record<string, string> = {}) {
  return new NextRequest(`http://localhost${path}`, { headers: headers(cookies) });
}
