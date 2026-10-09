import jwt from 'jsonwebtoken';
import type { NextResponse } from 'next/server';
import { getJwtSecret } from '@/lib/jwt-secret';

export type SessionUser = { id: string; name: string; email: string };

export function signSessionToken(user: SessionUser): string {
  return jwt.sign(
    {
      userId: user.id,
      email: user.email,
      name: user.name
    },
    getJwtSecret(),
    { expiresIn: '7d' }
  );
}

// Set JWT in httpOnly cookie
export function setSessionCookie(response: NextResponse, token: string) {
  response.cookies.set('auth-token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 60 * 60 * 24 * 7, // 7 days
    path: '/',
  });
}
