import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { clientIp, rateLimit } from "@/lib/rate-limit";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-09T12:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("rateLimit", () => {
  it("allows up to the limit within the window, then reports when to retry", () => {
    for (let i = 0; i < 3; i++) expect(rateLimit("t1:a", 3, 60_000)).toBe(0);

    vi.setSystemTime(Date.now() + 20_000);

    expect(rateLimit("t1:a", 3, 60_000)).toBe(40);
  });

  it("starts a fresh window once the old one has passed", () => {
    for (let i = 0; i < 3; i++) rateLimit("t2:a", 3, 60_000);
    vi.setSystemTime(Date.now() + 60_000);

    expect(rateLimit("t2:a", 3, 60_000)).toBe(0);
  });

  it("counts each key separately", () => {
    for (let i = 0; i < 3; i++) rateLimit("t3:a", 3, 60_000);

    expect(rateLimit("t3:b", 3, 60_000)).toBe(0);
  });
});

describe("clientIp", () => {
  const req = (headers: Record<string, string>) =>
    new NextRequest("http://localhost/api/signup", { headers });

  it("uses the address the nearest proxy appended to x-forwarded-for", () => {
    expect(clientIp(req({ "x-forwarded-for": "1.1.1.1, 203.0.113.9" }))).toBe("203.0.113.9");
  });

  it("falls back when no proxy header is present", () => {
    expect(clientIp(req({}))).toBe("unknown");
  });
});
