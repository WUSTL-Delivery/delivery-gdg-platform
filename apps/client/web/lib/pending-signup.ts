import { NextRequest, NextResponse } from 'next/server';
import supabase from '@/components/supabase';
import {
  CODE_TTL_MS,
  RESEND_COOLDOWN_MS,
  generateVerificationCode,
  hashVerificationCode,
} from '@/lib/verification-code';

// A sign-up waiting on email verification lives in `pending_signups` (see
// supabase/migrations) until the emailed code is entered; only then is the
// `users` row created. Each sign-up attempt is its own row with a random
// signup_id, handed to the browser that started it in an httpOnly cookie.
// Verifying needs both that cookie and the code, so a second sign-up for the
// same address (say, by someone who doesn't own it) can neither take over nor
// cancel the first one; whichever is verified first creates the account and
// retires the rest.
export const PENDING_SIGNUP_COOKIE = 'pending-signup';

// Together with MAX_ATTEMPTS per code these bound the guesses at any one
// address to 5 sign-ups x 3 codes x 5 attempts = 75 per day.
export const SIGNUP_TTL_MS = 24 * 60 * 60 * 1000;
export const MAX_SIGNUPS_PER_EMAIL_PER_DAY = 5;
export const MAX_CODES_PER_SIGNUP = 3;

export type PendingSignup = {
  signup_id: string;
  email: string;
  name: string;
  password_hash: string;
  code_hash: string;
  code_expires_at: string;
  attempts: number;
  codes_sent: number;
  last_sent_at: string;
  created_at: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isSignupExpired(signup: Pick<PendingSignup, 'created_at'>): boolean {
  return Date.parse(signup.created_at) + SIGNUP_TTL_MS <= Date.now();
}

// The pending sign-up started in this browser, or null if there is none: no
// (or a malformed) cookie, already verified or retired, or over a day old.
export async function findPendingSignup(request: NextRequest): Promise<PendingSignup | null> {
  const signupId = request.cookies.get(PENDING_SIGNUP_COOKIE)?.value;
  // signup_id is a uuid column: anything else is a query error, not a miss.
  if (!signupId || !UUID.test(signupId)) return null;

  const { data, error } = await supabase
    .from('pending_signups')
    .select('*')
    .eq('signup_id', signupId)
    .maybeSingle();

  if (error) throw error;
  return data && !isSignupExpired(data) ? (data as PendingSignup) : null;
}

// A new code plus the columns that store it; resets the attempt counter.
export function issueVerificationCode(signupId: string) {
  const code = generateVerificationCode();
  const now = Date.now();
  return {
    code,
    columns: {
      code_hash: hashVerificationCode(signupId, code),
      code_expires_at: new Date(now + CODE_TTL_MS).toISOString(),
      attempts: 0,
      last_sent_at: new Date(now).toISOString(),
    },
  };
}

// Seconds until another code may be emailed after one sent at lastSentAt (0 = now).
export function resendWaitSeconds(lastSentAt: string): number {
  const remaining = Date.parse(lastSentAt) + RESEND_COOLDOWN_MS - Date.now();
  return remaining > 0 ? Math.ceil(remaining / 1000) : 0;
}

export function tooSoonResponse(waitSeconds: number) {
  return NextResponse.json(
    {
      message: `Please wait ${waitSeconds} seconds before requesting another code`,
      retryAfter: waitSeconds,
    },
    { status: 429, headers: { 'Retry-After': String(waitSeconds) } }
  );
}

export function setPendingSignupCookie(response: NextResponse, signupId: string) {
  response.cookies.set(PENDING_SIGNUP_COOKIE, signupId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: SIGNUP_TTL_MS / 1000,
    path: '/',
  });
}

// This browser's sign-up can't be finished (gone, expired, or out of codes):
// the user has to start over.
export function signupExpiredResponse(
  message = 'This sign-up has expired. Please sign up again.',
  status = 400
) {
  const response = NextResponse.json({ message, signupExpired: true }, { status });
  response.cookies.delete(PENDING_SIGNUP_COOKIE);
  return response;
}
