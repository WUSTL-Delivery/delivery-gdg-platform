import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  generateVerificationCode,
  hashVerificationCode,
  isCorrectVerificationCode,
} from "@/lib/verification-code";

const SIGNUP_ID = "8d0f4f6c-1a52-4a8e-9f0e-2a7c5b1e9d33";

beforeEach(() => {
  vi.stubEnv("JWT_SECRET", "test-secret");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("generateVerificationCode", () => {
  it("returns six digits, including leading zeros", () => {
    const codes = Array.from({ length: 500 }, generateVerificationCode);
    for (const code of codes) expect(code).toMatch(/^\d{6}$/);
    expect(new Set(codes).size).toBeGreaterThan(450);
  });
});

describe("isCorrectVerificationCode", () => {
  it("accepts the code that was hashed", () => {
    const hash = hashVerificationCode(SIGNUP_ID, "042917");
    expect(isCorrectVerificationCode(SIGNUP_ID, "042917", hash)).toBe(true);
  });

  it("rejects a different code", () => {
    const hash = hashVerificationCode(SIGNUP_ID, "042917");
    expect(isCorrectVerificationCode(SIGNUP_ID, "042918", hash)).toBe(false);
  });

  it("rejects the right code presented for a different sign-up", () => {
    const hash = hashVerificationCode(SIGNUP_ID, "042917");
    expect(
      isCorrectVerificationCode("00000000-0000-4000-8000-000000000000", "042917", hash)
    ).toBe(false);
  });

  it("does not store the code in plain text", () => {
    expect(hashVerificationCode(SIGNUP_ID, "042917")).not.toContain("042917");
  });

  it("is keyed by the server secret", () => {
    const hash = hashVerificationCode(SIGNUP_ID, "042917");
    vi.stubEnv("JWT_SECRET", "rotated-secret");
    expect(isCorrectVerificationCode(SIGNUP_ID, "042917", hash)).toBe(false);
  });

  it("returns false instead of throwing on a malformed stored hash", () => {
    expect(isCorrectVerificationCode(SIGNUP_ID, "042917", "")).toBe(false);
    expect(isCorrectVerificationCode(SIGNUP_ID, "042917", "abc")).toBe(false);
  });
});
