import { NextRequest, NextResponse } from 'next/server';
import supabase from '@/components/supabase';
import { sendVerificationEmail } from '@/lib/mailer';
import {
  MAX_CODES_PER_SIGNUP,
  findPendingSignup,
  issueVerificationCode,
  resendWaitSeconds,
  signupExpiredResponse,
  tooSoonResponse,
} from '@/lib/pending-signup';
import { clientIp, rateLimit, rateLimitedResponse } from '@/lib/rate-limit';
import { RESEND_COOLDOWN_MS } from '@/lib/verification-code';

const HOUR = 60 * 60 * 1000;

// Emails a fresh code for the pending sign-up started in this browser. The
// old code stops working and the attempt counter resets.
export async function POST(request: NextRequest) {
  try {
    const limited = rateLimit(`resend:${clientIp(request)}`, 10, HOUR);
    if (limited) {
      return rateLimitedResponse(limited);
    }

    const pending = await findPendingSignup(request);
    if (!pending) {
      return signupExpiredResponse();
    }

    if (pending.codes_sent >= MAX_CODES_PER_SIGNUP) {
      return signupExpiredResponse(
        'You have requested too many codes. Please sign up again.',
        429
      );
    }

    const wait = resendWaitSeconds(pending.last_sent_at);
    if (wait > 0) {
      return tooSoonResponse(wait);
    }

    // Claim this send. Matching on the count we read means concurrent resends
    // can't both go out, and every code counts toward the limit even if
    // sending it fails.
    const { code, columns } = issueVerificationCode(pending.signup_id);
    const { data: claimed, error: claimError } = await supabase
      .from('pending_signups')
      .update({ ...columns, codes_sent: pending.codes_sent + 1 })
      .eq('signup_id', pending.signup_id)
      .eq('codes_sent', pending.codes_sent)
      .select('signup_id');

    if (claimError) throw claimError;
    if (!claimed?.length) {
      return tooSoonResponse(RESEND_COOLDOWN_MS / 1000);
    }

    try {
      await sendVerificationEmail(pending.email, code);
    } catch (error) {
      console.error('Verification email error:', error);
      // Put back the code the user already has (it was never replaced in
      // their inbox) and undo the cooldown so they can retry right away. The
      // code_hash match skips this if another resend has claimed the row since.
      await supabase
        .from('pending_signups')
        .update({
          code_hash: pending.code_hash,
          code_expires_at: pending.code_expires_at,
          attempts: pending.attempts,
          last_sent_at: pending.last_sent_at,
        })
        .eq('signup_id', pending.signup_id)
        .eq('code_hash', columns.code_hash);
      return NextResponse.json(
        { message: 'Could not send the verification email. Please try again.' },
        { status: 502 }
      );
    }

    return NextResponse.json(
      { message: `We sent a new code to ${pending.email}`, email: pending.email },
      { status: 200 }
    );
  } catch (error) {
    console.error('Resend verification error:', error);
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}
