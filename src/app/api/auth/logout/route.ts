import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  const loginUrl = new URL('/pin-login', request.url);
  const response = NextResponse.redirect(loginUrl);
  response.cookies.set('app_session', '', {
    httpOnly: true,
    sameSite: 'strict',
    path: '/',
    maxAge: 0,
  });
  return response;
}
