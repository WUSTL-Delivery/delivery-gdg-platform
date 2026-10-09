import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sendMail = vi.fn();
const createTransport = vi.fn(() => ({ sendMail }));
vi.mock("nodemailer", () => ({ default: { createTransport } }));

// The transport is cached per module instance, so load a fresh copy per test.
async function loadMailer() {
  vi.resetModules();
  return import("@/lib/mailer");
}

beforeEach(() => {
  sendMail.mockReset().mockResolvedValue({});
  createTransport.mockClear();
  for (const name of ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "SMTP_FROM"]) {
    vi.stubEnv(name, "");
  }
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("sendVerificationEmail", () => {
  it("sends the code over SMTP when configured", async () => {
    vi.stubEnv("SMTP_HOST", "smtp.example.com");
    vi.stubEnv("SMTP_PORT", "465");
    vi.stubEnv("SMTP_USER", "mailer");
    vi.stubEnv("SMTP_PASS", "hunter2");
    vi.stubEnv("SMTP_FROM", "WashU Delivery <no-reply@example.com>");
    const { sendVerificationEmail } = await loadMailer();

    await sendVerificationEmail("jane@wustl.edu", "042917");

    expect(createTransport).toHaveBeenCalledWith({
      host: "smtp.example.com",
      port: 465,
      secure: true,
      auth: { user: "mailer", pass: "hunter2" },
    });
    expect(sendMail).toHaveBeenCalledTimes(1);
    const message = sendMail.mock.calls[0][0];
    expect(message.to).toBe("jane@wustl.edu");
    expect(message.from).toBe("WashU Delivery <no-reply@example.com>");
    expect(message.text).toContain("042917");
  });

  it("connects without auth and with STARTTLS defaults for a local relay", async () => {
    vi.stubEnv("SMTP_HOST", "mailpit");
    vi.stubEnv("SMTP_PORT", "1025");
    vi.stubEnv("SMTP_FROM", "no-reply@localhost");
    const { sendVerificationEmail } = await loadMailer();

    await sendVerificationEmail("jane@wustl.edu", "042917");

    expect(createTransport).toHaveBeenCalledWith({
      host: "mailpit",
      port: 1025,
      secure: false,
      auth: undefined,
    });
  });

  it("propagates SMTP failures", async () => {
    vi.stubEnv("SMTP_HOST", "smtp.example.com");
    vi.stubEnv("SMTP_FROM", "no-reply@example.com");
    sendMail.mockRejectedValue(new Error("connection refused"));
    const { sendVerificationEmail } = await loadMailer();

    await expect(sendVerificationEmail("jane@wustl.edu", "042917")).rejects.toThrow(
      "connection refused"
    );
  });

  it("requires SMTP_FROM alongside SMTP_HOST", async () => {
    vi.stubEnv("SMTP_HOST", "smtp.example.com");
    const { sendVerificationEmail } = await loadMailer();

    await expect(sendVerificationEmail("jane@wustl.edu", "042917")).rejects.toThrow(
      /SMTP_FROM/
    );
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("logs the code instead of sending in development when SMTP is not configured", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const { sendVerificationEmail } = await loadMailer();

    await sendVerificationEmail("jane@wustl.edu", "042917");

    expect(createTransport).not.toHaveBeenCalled();
    expect(info.mock.calls.flat().join(" ")).toContain("042917");
  });

  it("refuses to run without SMTP in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const { sendVerificationEmail } = await loadMailer();

    await expect(sendVerificationEmail("jane@wustl.edu", "042917")).rejects.toThrow(
      /SMTP_HOST/
    );
    expect(info).not.toHaveBeenCalled();
  });
});
