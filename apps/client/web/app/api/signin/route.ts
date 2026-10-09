import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import supabase from '@/components/supabase';
import { EMAIL_DOMAIN_ERROR, isAllowedEmail, normalizeEmail } from '@/lib/email-domain';
import { isSignupExpired, setPendingSignupCookie } from '@/lib/pending-signup';
import { setSessionCookie, signSessionToken } from '@/lib/session';


export async function POST(request: NextRequest) {
  try {
    const { email: rawEmail, password } = await request.json();

    // Validation
    if (!rawEmail || !password) {
      return NextResponse.json(
        { message: 'Email and password are required' },
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

    // Find user by email
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .maybeSingle();

    if (error) throw error;

    if (!user) {
      return await unverifiedSignupResponse(email, password);
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      return invalidCredentials();
    }

    // Generate JWT token
    const token = signSessionToken(user);

    // Create response
    const response = NextResponse.json(
      {
        message: 'Login successful',
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
        },
      },
      { status: 200 }
    );

    setSessionCookie(response, token);

    return response;
  } catch (error) {
    console.error('Signin error:', error);
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}

function invalidCredentials() {
  return NextResponse.json(
    { message: 'Invalid email or password' },
    { status: 401 }
  );
}

// No account yet, but maybe a sign-up that was never verified. If the password
// matches one, hand this browser that pending sign-up so it can enter the code
// (or request a new one) instead of starting over.
async function unverifiedSignupResponse(email: string, password: string) {
  const { data: signups, error } = await supabase
    .from('pending_signups')
    .select('signup_id, password_hash, created_at')
    .eq('email', email);

  if (error) throw error;

  // Newest first; at most MAX_SIGNUPS_PER_EMAIL_PER_DAY of them
  const candidates = (signups ?? [])
    .filter((signup) => !isSignupExpired(signup))
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));

  let pending = null;
  for (const signup of candidates) {
    if (await bcrypt.compare(password, signup.password_hash)) {
      pending = signup;
      break;
    }
  }

  if (!pending) {
    return invalidCredentials();
  }

  const response = NextResponse.json(
    {
      message: 'Please verify your email to finish signing up',
      email,
      verificationRequired: true,
    },
    { status: 403 }
  );
  setPendingSignupCookie(response, pending.signup_id);
  return response;
}
