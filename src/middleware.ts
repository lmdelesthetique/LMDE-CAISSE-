import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const ADMIN_COOKIE = 'app_session';
const LIVREUR_COOKIE = 'livreur_session';

const ADMIN_PUBLIC = ['/pin-login', '/api/auth/pin'];

// These portals have their own auth — never redirect to admin PIN
const CLIENT_PORTALS = ['/client-portal', '/supplier-portal', '/abonnement', '/client', '/ambassadrice'];

function isAdminSessionValid(cookieValue: string | undefined): boolean {
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

  // ── Client/supplier portals: isolated from admin PIN ──────────────────────
  // Check FIRST, before any admin logic — no admin cookie required for these routes
  if (CLIENT_PORTALS.some(prefix => pathname.startsWith(prefix))) {
    // Redirect bare /supplier-portal root → login (no page.tsx exists at root)
    if (pathname === '/supplier-portal' || pathname === '/supplier-portal/') {
      return NextResponse.redirect(new URL('/supplier-portal/login', request.url));
    }
    return NextResponse.next();
  }

  // ── Livreur portal: completely isolated from admin ─────────────────────────
  // Use '/livreur/' (with slash) to avoid matching '/livreurs' (admin driver management)
  if (pathname === '/livreur' || pathname.startsWith('/livreur/')) {
    // Login page is always public
    if (pathname === '/livreur/login') return NextResponse.next();
    // All other /livreur/* pages require the livreur cookie
    const livreurCookie = request.cookies.get(LIVREUR_COOKIE)?.value;
    if (!livreurCookie) {
      return NextResponse.redirect(new URL('/livreur/login', request.url));
    }
    return NextResponse.next();
  }

  // ── Admin app: PIN session ─────────────────────────────────────────────────
  if (ADMIN_PUBLIC.some(prefix => pathname.startsWith(prefix))) {
    return NextResponse.next();
  }

  const adminCookie = request.cookies.get(ADMIN_COOKIE)?.value;

  if (isAdminSessionValid(adminCookie)) {
    const response = NextResponse.next();
    const newValue = btoa(JSON.stringify({ exp: Date.now() + SESSION_TTL_MS }));
    response.cookies.set(ADMIN_COOKIE, newValue, {
      httpOnly: true,
      sameSite: 'strict',
      path: '/',
      maxAge: SESSION_TTL_MS / 1000,
    });
    return response;
  }

  const loginUrl = new URL('/pin-login', request.url);
  loginUrl.searchParams.set('redirect', pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.json|client-manifest.json|assets|icons|api).*)',
  ],
};
