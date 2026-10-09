import nodemailer, { type Transporter } from "nodemailer";
import { CODE_TTL_MS } from "@/lib/verification-code";

// Outbound email over SMTP. Configured at runtime (never at module scope, see
// lib/jwt-secret.ts) from:
//   SMTP_HOST, SMTP_PORT (default 587; 465 = implicit TLS),
//   SMTP_USER / SMTP_PASS (optional, e.g. not needed for the local mailpit),
//   SMTP_FROM (e.g. "WashU Delivery <no-reply@example.com>").
// With SMTP_HOST unset, `next dev` logs the code to the console so sign-up
// works without a mail server; a production server refuses instead.
let transporter: Transporter | null = null;

function env(name: string): string | undefined {
  return process.env[name]?.trim() || undefined;
}

function getTransporter(host: string): Transporter {
  if (!transporter) {
    const port = Number(env("SMTP_PORT") ?? 587);
    const user = env("SMTP_USER");
    transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: user ? { user, pass: env("SMTP_PASS") } : undefined,
    });
  }
  return transporter;
}

export async function sendVerificationEmail(to: string, code: string): Promise<void> {
  const host = env("SMTP_HOST");
  if (!host) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("SMTP_HOST must be set to send verification emails");
    }
    console.info(`[dev] SMTP_HOST not set; verification code for ${to}: ${code}`);
    return;
  }

  const from = env("SMTP_FROM");
  if (!from) {
    throw new Error("SMTP_FROM must be set when SMTP_HOST is set");
  }

  const minutes = CODE_TTL_MS / 60_000;
  await getTransporter(host).sendMail({
    from,
    to,
    subject: `${code} is your WashU Delivery verification code`,
    text:
      `Your WashU Delivery verification code is ${code}.\n\n` +
      `Enter it on the sign-up page within ${minutes} minutes to finish creating your account.\n\n` +
      `If you didn't try to sign up, you can ignore this email.`,
  });
}
