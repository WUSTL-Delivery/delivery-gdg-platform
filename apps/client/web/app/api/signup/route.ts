import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import bcrypt from 'bcryptjs';
import supabase from '@/components/supabase';
import { EMAIL_DOMAIN_ERROR, isAllowedEmail, normalizeEmail } from '@/lib/email-domain';
import { sendVerificationEmail } from '@/lib/mailer';
import {
  MAX_SIGNUPS_PER_EMAIL_PER_DAY,
  SIGNUP_TTL_MS,
  issueVerificationCode,
  resendWaitSeconds,
  setPendingSignupCookie,
  tooSoonResponse,
} from '@/lib/pending-signup';
import { clientIp, rateLimit, rateLimitedResponse } from '@/lib/rate-limit';

const HOUR = 60 * 60 * 1000;

// Starts a sign-up: stores it as pending and emails a verification code. The
// account is only created once the code is entered (POST /api/verify-email).
export async function POST(request: NextRequest) {

  try {
    const limited = rateLimit(`signup:${clientIp(request)}`, 10, HOUR);
    if (limited) {
      return rateLimitedResponse(limited);
    }

    const { name, email: rawEmail, password } = await request.json();

    // Validation
    if (!name || !rawEmail || !password) {
      return NextResponse.json(
        { message: 'All fields are required' },
        { status: 400 }
      );
    }

    if (!isAllowedEmail(rawEmail)) {
      return NextResponse.json(
        { message: EMAIL_DOMAIN_ERROR },
        { status: 400 }
      );
    }
    const email = normalizeEmail(rawEmail);

    if (typeof password !== 'string' || password.length < 6) {
      return NextResponse.json(
        { message: 'Password must be at least 6 characters' },
        { status: 400 }
      );
    }

    // Check if user already exists
    const { data: existingUser, error: userLookupError } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .maybeSingle();

    if (userLookupError) throw userLookupError;

    if (existingUser) {
      return NextResponse.json(
        { message: 'User already exists with this email' },
        { status: 409 }
      );
    }

    // Clear out sign-ups that can no longer be finished
    const { error: cleanupError } = await supabase
      .from('pending_signups')
      .delete()
      .lt('created_at', new Date(Date.now() - SIGNUP_TTL_MS).toISOString());

    if (cleanupError) console.error('Pending sign-up cleanup error:', cleanupError);

    const signupId = randomUUID();
    const { code, columns } = issueVerificationCode(signupId);
    const { error: insertError } = await supabase
      .from('pending_signups')
      .insert({
        signup_id: signupId,
        email,
        name,
        password_hash: await bcrypt.hash(password, 10),
        ...columns,
        codes_sent: 1,
        created_at: new Date().toISOString(),
      });

    if (insertError) throw insertError;

    // Check the per-address limits only after inserting, so simultaneous
    // sign-ups see each other's rows and at most one of them sends an email.
    const { data: signups, error: signupsError } = await supabase
      .from('pending_signups')
      .select('signup_id, last_sent_at')
      .eq('email', email);

    if (signupsError) throw signupsError;

    const wait = Math.max(
      0,
      ...(signups ?? [])
        .filter((signup) => signup.signup_id !== signupId)
        .map((signup) => resendWaitSeconds(signup.last_sent_at))
    );
    const tooMany = (signups?.length ?? 0) > MAX_SIGNUPS_PER_EMAIL_PER_DAY;

    if (wait > 0 || tooMany) {
      await supabase.from('pending_signups').delete().eq('signup_id', signupId);
      return wait > 0
        ? tooSoonResponse(wait)
        : NextResponse.json(
          { message: 'Too many sign-up attempts for this email today. Please try again tomorrow.' },
          { status: 429 }
        );
    }

    try {
      await sendVerificationEmail(email, code);
    } catch (error) {
      console.error('Verification email error:', error);
      // Drop the pending row so the cooldown doesn't block an immediate retry
      await supabase.from('pending_signups').delete().eq('signup_id', signupId);
      return NextResponse.json(
        { message: 'Could not send the verification email. Please try again.' },
        { status: 502 }
      );
    }

    const response = NextResponse.json(
      {
        message: `We sent a 6-digit code to ${email}`,
        email,
        verificationRequired: true,
      },
      { status: 202 }
    );
    setPendingSignupCookie(response, signupId);

    return response;
  } catch (error) {
    console.error('Signup error:', error);
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}
