import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const SESSION_COOKIE = 'app_session';

const PUBLIC_PREFIXES = ['/pin-login', '/api/auth/pin'];

function isSessionValid(cookieValue: string | undefined): boolean {
  if (!cookieValue) return false;
  try {
    const { exp } = JSON.parse(atob(cookieValue)) as { exp: number };
    return Date.now() < exp;
  } catch {
    return false;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Always allow public paths
  if (PUBLIC_PREFIXES.some(prefix => pathname.startsWith(prefix))) {
    return NextResponse.next();
  }

  const sessionCookie = request.cookies.get(SESSION_COOKIE)?.value;

  if (isSessionValid(sessionCookie)) {
    // Slide the session window (refresh expiry on each request)
    const response = NextResponse.next();
    const newValue = btoa(JSON.stringify({ exp: Date.now() + SESSION_TTL_MS }));
    response.cookies.set(SESSION_COOKIE, newValue, {
      httpOnly: true,
      sameSite: 'strict',
      path: '/',
      maxAge: SESSION_TTL_MS / 1000,
    });
    return response;
  }

  // No valid session → redirect to PIN login
  const loginUrl = new URL('/pin-login', request.url);
  loginUrl.searchParams.set('redirect', pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.json|assets|api).*)',
  ],
};
