import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import bcrypt from "bcryptjs";
import { db } from "./helpers/fake-supabase";
import { post } from "./helpers/requests";

vi.mock("@/components/supabase", async () => ({
  default: (await import("./helpers/fake-supabase")).db,
}));
vi.mock("@/lib/mailer", () => ({ sendVerificationEmail: vi.fn() }));

import { sendVerificationEmail } from "@/lib/mailer";
import { POST as signin } from "@/app/api/signin/route";
import { POST as signup } from "@/app/api/signup/route";
import { POST as verifyEmail } from "@/app/api/verify-email/route";

const PASSWORD = "correct horse";
let passwordHash: string;

async function signIn(email: string, password = PASSWORD) {
  const res = await signin(post("/api/signin", { email, password }));
  return { res, data: await res.json() };
}

beforeEach(async () => {
  db.reset();
  vi.mocked(sendVerificationEmail).mockReset().mockResolvedValue(undefined);
  vi.stubEnv("JWT_SECRET", "test-secret");
  passwordHash ??= await bcrypt.hash(PASSWORD, 4);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/signin", () => {
  it("signs in a WashU account", async () => {
    db.rows("users").push({ id: "u1", name: "Jane", email: "jane@wustl.edu", password: passwordHash });

    const { res, data } = await signIn("jane@wustl.edu");

    expect(res.status).toBe(200);
    expect(data.user).toEqual({ id: "u1", name: "Jane", email: "jane@wustl.edu" });
    expect(res.cookies.get("auth-token")?.value).toBeTruthy();
  });

  it("matches the email case-insensitively", async () => {
    db.rows("users").push({ id: "u1", name: "Jane", email: "jane@wustl.edu", password: passwordHash });

    const { res } = await signIn("  Jane@WUSTL.edu ");

    expect(res.status).toBe(200);
  });

  it("refuses non-WashU accounts even with the right password", async () => {
    db.rows("users").push({ id: "u2", name: "Old", email: "old@gmail.com", password: passwordHash });

    const { res, data } = await signIn("old@gmail.com");

    expect(res.status).toBe(400);
    expect(data.message).toMatch(/@wustl\.edu/);
    expect(res.cookies.get("auth-token")).toBeUndefined();
  });

  it("rejects a wrong password", async () => {
    db.rows("users").push({ id: "u1", name: "Jane", email: "jane@wustl.edu", password: passwordHash });

    const { res } = await signIn("jane@wustl.edu", "wrong password");

    expect(res.status).toBe(401);
    expect(res.cookies.get("auth-token")).toBeUndefined();
  });

  it("rejects an unknown email", async () => {
    const { res } = await signIn("nobody@wustl.edu");

    expect(res.status).toBe(401);
  });

  describe("with an unverified sign-up", () => {
    beforeEach(async () => {
      const res = await signup(
        post("/api/signup", { name: "Jane", email: "jane@wustl.edu", password: PASSWORD })
      );
      expect(res.status).toBe(202);
    });

    it("sends the owner back to verification instead of signing in", async () => {
      const { res, data } = await signIn("jane@wustl.edu");

      expect(res.status).toBe(403);
      expect(data.verificationRequired).toBe(true);
      expect(res.cookies.get("auth-token")).toBeUndefined();

      // The cookie it hands back lets this browser finish with the emailed code.
      const signupId = res.cookies.get("pending-signup")?.value;
      const code = vi.mocked(sendVerificationEmail).mock.calls[0][1];
      const verified = await verifyEmail(
        post("/api/verify-email", { code }, { "pending-signup": signupId! })
      );
      expect(verified.status).toBe(201);
    });

    it("resumes the owner's sign-up when someone else also started one", async () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(Date.now() + 61_000);
      const other = await signup(
        post("/api/signup", { name: "Mallory", email: "jane@wustl.edu", password: "mallory pass" })
      );
      expect(other.status).toBe(202);
      vi.useRealTimers();

      const { res } = await signIn("jane@wustl.edu");

      expect(res.status).toBe(403);
      const signupId = res.cookies.get("pending-signup")?.value;
      expect(signupId).not.toBe(other.cookies.get("pending-signup")?.value);
      const janesCode = vi.mocked(sendVerificationEmail).mock.calls[0][1];
      const verified = await verifyEmail(
        post("/api/verify-email", { code: janesCode }, { "pending-signup": signupId! })
      );
      expect(verified.status).toBe(201);
      expect((await verified.json()).user.name).toBe("Jane");
    });

    it("does not reveal or resume it for a wrong password", async () => {
      const { res } = await signIn("jane@wustl.edu", "wrong password");

      expect(res.status).toBe(401);
      expect(res.cookies.get("pending-signup")).toBeUndefined();
    });
  });
});
