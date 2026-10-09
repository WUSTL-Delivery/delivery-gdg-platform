import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';
import { getJwtSecretKey } from '@/lib/jwt-secret';
import { isAllowedEmail } from '@/lib/email-domain';


export async function proxy(request: NextRequest) {
  const token = request.cookies.get('auth-token')?.value;

  // Protected routes
  const protectedPaths = ['/dashboard', '/profile', '/settings'];
  const isProtectedPath = protectedPaths.some(path => 
    request.nextUrl.pathname.startsWith(path)
  );

  if (isProtectedPath && !token) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  if (token) {
    try {
      const { payload } = await jwtVerify(token, getJwtSecretKey());
      // Sessions issued before sign-in was limited to WashU addresses
      if (!isAllowedEmail(payload.email)) {
        throw new Error('Email domain not allowed');
      }
      return NextResponse.next();
    } catch {
      // Invalid token, clear it and redirect
      const response = NextResponse.redirect(new URL('/login', request.url));
      response.cookies.delete('auth-token');
      return response;
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/profile/:path*', '/settings/:path*'],
};
