import { NextRequest, NextResponse } from 'next/server';
import supabase from '@/components/supabase';
import {
  MAX_CODES_PER_SIGNUP,
  PENDING_SIGNUP_COOKIE,
  findPendingSignup,
  signupExpiredResponse,
} from '@/lib/pending-signup';
import { clientIp, rateLimit, rateLimitedResponse } from '@/lib/rate-limit';
import { setSessionCookie, signSessionToken } from '@/lib/session';
import { MAX_ATTEMPTS, isCorrectVerificationCode } from '@/lib/verification-code';

const HOUR = 60 * 60 * 1000;

// Finishes a sign-up: checks the emailed code, creates the account, and signs
// the user in.
export async function POST(request: NextRequest) {
  try {
    const limited = rateLimit(`verify:${clientIp(request)}`, 20, HOUR);
    if (limited) {
      return rateLimitedResponse(limited);
    }

    const { code: rawCode } = await request.json();
    const code = typeof rawCode === 'string' ? rawCode.replace(/\s+/g, '') : '';

    if (!/^\d{6}$/.test(code)) {
      return NextResponse.json(
        { message: 'Enter the 6-digit code from your email' },
        { status: 400 }
      );
    }

    const pending = await findPendingSignup(request);
    if (!pending) {
      return signupExpiredResponse();
    }
    const outOfCodes = pending.codes_sent >= MAX_CODES_PER_SIGNUP;

    if (pending.attempts >= MAX_ATTEMPTS) {
      return outOfCodes
        ? signupExpiredResponse('Too many incorrect attempts. Please sign up again.', 429)
        : NextResponse.json(
          { message: 'Too many incorrect attempts. Request a new code.' },
          { status: 429 }
        );
    }

    if (Date.parse(pending.code_expires_at) <= Date.now()) {
      return outOfCodes
        ? signupExpiredResponse('This code has expired. Please sign up again.')
        : NextResponse.json(
          { message: 'This code has expired. Request a new code.' },
          { status: 400 }
        );
    }

    // Count the attempt before checking the code. Matching on the attempt
    // count we read means concurrent guesses can't share one attempt.
    const { data: claimed, error: claimError } = await supabase
      .from('pending_signups')
      .update({ attempts: pending.attempts + 1 })
      .eq('signup_id', pending.signup_id)
      .eq('attempts', pending.attempts)
      .select('signup_id');

    if (claimError) throw claimError;
    if (!claimed?.length) {
      return NextResponse.json(
        { message: 'Please try again.' },
        { status: 409 }
      );
    }

    if (!isCorrectVerificationCode(pending.signup_id, code, pending.code_hash)) {
      const remaining = MAX_ATTEMPTS - pending.attempts - 1;
      return NextResponse.json(
        {
          message: remaining > 0
            ? `Incorrect code. ${remaining} ${remaining === 1 ? 'attempt' : 'attempts'} left.`
            : `Incorrect code. ${outOfCodes ? 'Please sign up again.' : 'Request a new code.'}`,
        },
        { status: 400 }
      );
    }

    const { data: existingUser, error: userLookupError } = await supabase
      .from('users')
      .select('id')
      .eq('email', pending.email)
      .maybeSingle();

    if (userLookupError) throw userLookupError;
    if (existingUser) {
      await supabase.from('pending_signups').delete().eq('email', pending.email);
      const response = NextResponse.json(
        { message: 'User already exists with this email' },
        { status: 409 }
      );
      response.cookies.delete(PENDING_SIGNUP_COOKIE);
      return response;
    }

    // Insert user into database
    const { data: newUser, error: insertError } = await supabase
      .from('users')
      .insert([
        {
          name: pending.name,
          email: pending.email,
          password: pending.password_hash,
          created_at: new Date().toISOString(),
        },
      ])
      .select()
      .single();

    if (insertError) {
      console.error('Supabase error:', insertError);
      return NextResponse.json(
        { message: 'Error creating user' },
        { status: 500 }
      );
    }

    // Retire every pending sign-up for this address, including other people's
    const { error: deleteError } = await supabase
      .from('pending_signups')
      .delete()
      .eq('email', pending.email);

    // Not fatal: the account exists, so leftover rows can't be used again.
    if (deleteError) console.error('Pending sign-up cleanup error:', deleteError);

    const token = signSessionToken(newUser);

    const response = NextResponse.json(
      {
        message: 'Email verified. Account created successfully',
        token,
        user: {
          id: newUser.id,
          name: newUser.name,
          email: newUser.email,
        },
      },
      { status: 201 }
    );
    setSessionCookie(response, token);
    response.cookies.delete(PENDING_SIGNUP_COOKIE);

    return response;
  } catch (error) {
    console.error('Verify email error:', error);
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}
