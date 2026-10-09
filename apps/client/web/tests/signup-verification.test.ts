import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import bcrypt from "bcryptjs";
import { jwtVerify } from "jose";
import { db } from "./helpers/fake-supabase";
import { post } from "./helpers/requests";

vi.mock("@/components/supabase", async () => ({
  default: (await import("./helpers/fake-supabase")).db,
}));
vi.mock("@/lib/mailer", () => ({ sendVerificationEmail: vi.fn() }));

import { sendVerificationEmail } from "@/lib/mailer";
import { POST as signup } from "@/app/api/signup/route";
import { POST as verifyEmail } from "@/app/api/verify-email/route";
import { POST as resendCode } from "@/app/api/verify-email/resend/route";

const sent = vi.mocked(sendVerificationEmail);
const JANE = { name: "Jane Doe", email: "jane@wustl.edu", password: "correct horse" };
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

function lastSentCode(): string {
  return sent.mock.calls.at(-1)![1];
}

function wrongCode(code: string) {
  return code === "000000" ? "111111" : "000000";
}

function advance(ms: number) {
  vi.setSystemTime(Date.now() + ms);
}

async function signUp(body: Record<string, unknown> = JANE, ip?: string) {
  const res = await signup(post("/api/signup", body, {}, ip));
  return { res, data: await res.json(), signupId: res.cookies.get("pending-signup")?.value };
}

async function verify(signupId: string | undefined, code: string, ip?: string) {
  const res = await verifyEmail(
    post("/api/verify-email", { code }, signupId ? { "pending-signup": signupId } : {}, ip)
  );
  return { res, data: await res.json() };
}

async function resend(signupId: string | undefined) {
  const res = await resendCode(
    post("/api/verify-email/resend", {}, signupId ? { "pending-signup": signupId } : {})
  );
  return { res, data: await res.json() };
}

beforeEach(() => {
  db.reset();
  sent.mockReset().mockResolvedValue(undefined);
  vi.stubEnv("JWT_SECRET", "test-secret");
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-09T12:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("POST /api/signup", () => {
  it("rejects non-WashU email addresses", async () => {
    const { res, data } = await signUp({ ...JANE, email: "jane@gmail.com" });

    expect(res.status).toBe(400);
    expect(data.message).toMatch(/@wustl\.edu/);
    expect(sent).not.toHaveBeenCalled();
    expect(db.rows("users")).toHaveLength(0);
    expect(db.rows("pending_signups")).toHaveLength(0);
  });

  it("emails a code instead of creating the account or a session", async () => {
    const { res, data, signupId } = await signUp({ ...JANE, email: " Jane@WUSTL.edu " });

    expect(res.status).toBe(202);
    expect(data.verificationRequired).toBe(true);
    expect(data.email).toBe("jane@wustl.edu");
    expect(res.cookies.get("auth-token")).toBeUndefined();
    expect(signupId).toBeTruthy();
    expect(db.rows("users")).toHaveLength(0);
    expect(sent).toHaveBeenCalledTimes(1);
    expect(sent.mock.calls[0][0]).toBe("jane@wustl.edu");
    expect(lastSentCode()).toMatch(/^\d{6}$/);
  });

  it("never stores the password or the code in plain text", async () => {
    await signUp();

    const [pending] = db.rows("pending_signups");
    const stored = JSON.stringify(pending);
    expect(stored).not.toContain(JANE.password);
    expect(stored).not.toContain(lastSentCode());
    expect(await bcrypt.compare(JANE.password, pending.password_hash as string)).toBe(true);
  });

  it("rejects an email that already has an account", async () => {
    db.rows("users").push({ id: "u1", name: "Jane", email: "jane@wustl.edu", password: "x" });

    const { res } = await signUp();

    expect(res.status).toBe(409);
    expect(sent).not.toHaveBeenCalled();
  });

  it("waits a minute between emails to the same address", async () => {
    await signUp();
    advance(30_000);

    const { res } = await signUp();

    expect(res.status).toBe(429);
    expect(sent).toHaveBeenCalledTimes(1);
  });

  it("sends at most one email for a burst of simultaneous sign-ups", async () => {
    const results = await Promise.all([signUp(), signUp(), signUp()]);

    expect(sent.mock.calls.length).toBeLessThanOrEqual(1);
    expect(results.filter(({ res }) => res.status === 202).length).toBeLessThanOrEqual(1);
  });

  it("does not let a later sign-up for the same email cancel an earlier one", async () => {
    const first = await signUp();
    const firstCode = lastSentCode();
    advance(MINUTE + 1_000);
    const second = await signUp({ ...JANE, password: "someone else's password" });
    expect(second.res.status).toBe(202);

    const { res } = await verify(first.signupId, firstCode);

    expect(res.status).toBe(201);
    const [user] = db.rows("users");
    expect(await bcrypt.compare(JANE.password, user.password as string)).toBe(true);
    // Creating the account retires every other pending sign-up for the address.
    expect(db.rows("pending_signups")).toHaveLength(0);
    expect((await verify(second.signupId, lastSentCode())).res.status).toBe(400);
  });

  it("only accepts a code for the sign-up it was sent for", async () => {
    const first = await signUp();
    const firstCode = lastSentCode();
    advance(MINUTE + 1_000);
    const second = await signUp({ ...JANE, password: "someone else's password" });
    const secondCode = lastSentCode();

    if (firstCode !== secondCode) {
      expect((await verify(first.signupId, secondCode)).res.status).toBe(400);
      expect((await verify(second.signupId, firstCode)).res.status).toBe(400);
    }
    expect(db.rows("users")).toHaveLength(0);
  });

  it("allows five sign-ups per email per day", async () => {
    for (let i = 0; i < 5; i++) {
      expect((await signUp()).res.status).toBe(202);
      advance(MINUTE + 1_000);
    }

    expect((await signUp()).res.status).toBe(429);
    expect(sent).toHaveBeenCalledTimes(5);

    advance(DAY);
    expect((await signUp()).res.status).toBe(202);
  });

  it("allows ten sign-ups per client address per hour", async () => {
    const ip = "203.0.113.7";
    for (let i = 0; i < 10; i++) {
      expect((await signUp({ ...JANE, email: `student${i}@wustl.edu` }, ip)).res.status).toBe(202);
    }

    const { res } = await signUp({ ...JANE, email: "student10@wustl.edu" }, ip);

    expect(res.status).toBe(429);
    expect(sent).toHaveBeenCalledTimes(10);
  });

  it("does not leave a pending sign-up behind when the email fails to send", async () => {
    sent.mockRejectedValueOnce(new Error("SMTP down"));

    const { res } = await signUp();

    expect(res.status).toBe(502);
    expect(db.rows("pending_signups")).toHaveLength(0);
    // ...so the user can retry immediately instead of waiting out the cooldown.
    expect((await signUp()).res.status).toBe(202);
  });

  it("clears out sign-ups that are more than a day old", async () => {
    await signUp();
    advance(DAY + 1_000);

    await signUp({ ...JANE, email: "someone@wustl.edu" });

    expect(db.rows("pending_signups").map((row) => row.email)).toEqual(["someone@wustl.edu"]);
  });
});

describe("POST /api/verify-email", () => {
  it("creates the account and signs the user in with the emailed code", async () => {
    const { signupId } = await signUp();

    const { res, data } = await verify(signupId, lastSentCode());

    expect(res.status).toBe(201);
    expect(data.user).toMatchObject({ name: JANE.name, email: JANE.email });
    const users = db.rows("users");
    expect(users).toHaveLength(1);
    expect(users[0]).toMatchObject({ name: JANE.name, email: JANE.email });
    expect(await bcrypt.compare(JANE.password, users[0].password as string)).toBe(true);
    expect(db.rows("pending_signups")).toHaveLength(0);

    const token = res.cookies.get("auth-token")?.value;
    const { payload } = await jwtVerify(token!, new TextEncoder().encode("test-secret"));
    expect(payload).toMatchObject({ userId: users[0].id, email: JANE.email });
  });

  it("accepts the code with surrounding whitespace", async () => {
    const { signupId } = await signUp();
    const code = lastSentCode();

    const { res } = await verify(signupId, ` ${code.slice(0, 3)} ${code.slice(3)} `);

    expect(res.status).toBe(201);
  });

  it("rejects a wrong code without creating the account", async () => {
    const { signupId } = await signUp();

    const { res } = await verify(signupId, wrongCode(lastSentCode()));

    expect(res.status).toBe(400);
    expect(db.rows("users")).toHaveLength(0);
  });

  it("locks the code after five wrong attempts", async () => {
    const { signupId } = await signUp();
    const code = lastSentCode();
    for (let i = 0; i < 5; i++) {
      expect((await verify(signupId, wrongCode(code))).res.status).toBe(400);
    }

    const { res } = await verify(signupId, code);

    expect(res.status).toBe(429);
    expect(db.rows("users")).toHaveLength(0);
  });

  it("rejects a code after 15 minutes", async () => {
    const { signupId } = await signUp();
    advance(15 * MINUTE + 1_000);

    const { res } = await verify(signupId, lastSentCode());

    expect(res.status).toBe(400);
    expect(db.rows("users")).toHaveLength(0);
  });

  it("requires the browser that started the sign-up", async () => {
    await signUp();

    const { res } = await verify(undefined, lastSentCode());

    expect(res.status).toBe(400);
    expect(db.rows("users")).toHaveLength(0);
  });

  it("treats a malformed sign-up cookie as an expired sign-up", async () => {
    await signUp();

    const { res, data } = await verify("not-a-uuid", lastSentCode());

    expect(res.status).toBe(400);
    expect(data.signupExpired).toBe(true);
  });

  it("cannot be replayed once the account exists", async () => {
    const { signupId } = await signUp();
    const code = lastSentCode();
    await verify(signupId, code);

    const { res } = await verify(signupId, code);

    expect(res.status).toBe(400);
    expect(db.rows("users")).toHaveLength(1);
  });

  it("allows twenty attempts per client address per hour", async () => {
    const ip = "203.0.113.8";
    for (let i = 0; i < 20; i++) {
      expect((await verify(undefined, "123456", ip)).res.status).toBe(400);
    }

    expect((await verify(undefined, "123456", ip)).res.status).toBe(429);
  });
});

describe("POST /api/verify-email/resend", () => {
  it("waits a minute between codes", async () => {
    const { signupId } = await signUp();
    advance(30_000);

    const { res } = await resend(signupId);

    expect(res.status).toBe(429);
    expect(sent).toHaveBeenCalledTimes(1);
  });

  it("sends a fresh code that replaces the old one and resets attempts", async () => {
    const { signupId } = await signUp();
    const oldCode = lastSentCode();
    for (let i = 0; i < 5; i++) await verify(signupId, wrongCode(oldCode));
    advance(MINUTE + 1_000);

    const { res } = await resend(signupId);
    const newCode = lastSentCode();

    expect(res.status).toBe(200);
    expect(sent).toHaveBeenCalledTimes(2);
    expect(sent.mock.calls[1][0]).toBe(JANE.email);
    if (newCode !== oldCode) {
      expect((await verify(signupId, oldCode)).res.status).toBe(400);
    }
    expect((await verify(signupId, newCode)).res.status).toBe(201);
  });

  it("stops after three codes per sign-up, bounding the total number of guesses", async () => {
    const { signupId } = await signUp();
    let guessesChecked = 0;
    let resendStatus = 200;
    for (let round = 0; round < 10 && resendStatus === 200; round++) {
      for (let i = 0; i < 6; i++) {
        const { data } = await verify(signupId, wrongCode(lastSentCode()));
        if (/Incorrect code/.test(data.message)) guessesChecked++;
      }
      advance(MINUTE + 1_000);
      const { res, data } = await resend(signupId);
      resendStatus = res.status;
      if (res.status !== 200) expect(data.signupExpired).toBe(true);
    }

    expect(resendStatus).toBe(429);
    expect(sent).toHaveBeenCalledTimes(3);
    expect(guessesChecked).toBe(15);
  });

  it("counts codes that failed to send toward the limit", async () => {
    const { signupId } = await signUp();
    sent.mockRejectedValue(new Error("SMTP down"));
    advance(MINUTE + 1_000);

    expect((await resend(signupId)).res.status).toBe(502);
    // A failed send doesn't make the user wait out the cooldown...
    expect((await resend(signupId)).res.status).toBe(502);
    // ...but it still uses up one of the sign-up's codes.
    expect((await resend(signupId)).res.status).toBe(429);
  });

  it("keeps the previously sent code working when a new one fails to send", async () => {
    const { signupId } = await signUp();
    const delivered = lastSentCode();
    advance(MINUTE + 1_000);
    sent.mockRejectedValueOnce(new Error("SMTP down"));

    expect((await resend(signupId)).res.status).toBe(502);

    expect((await verify(signupId, delivered)).res.status).toBe(201);
  });

  it("treats a sign-up older than a day as expired", async () => {
    const { signupId } = await signUp();
    advance(DAY + 1_000);

    const { res, data } = await resend(signupId);

    expect(res.status).toBe(400);
    expect(data.signupExpired).toBe(true);
    expect(sent).toHaveBeenCalledTimes(1);
  });

  it("requires a pending sign-up", async () => {
    const { res } = await resend(undefined);

    expect(res.status).toBe(400);
    expect(sent).not.toHaveBeenCalled();
  });

  it("treats a malformed sign-up cookie as an expired sign-up", async () => {
    const { res, data } = await resend("not-a-uuid");

    expect(res.status).toBe(400);
    expect(data.signupExpired).toBe(true);
  });
});
