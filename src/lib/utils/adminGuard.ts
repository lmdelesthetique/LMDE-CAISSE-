import { NextRequest, NextResponse } from 'next/server';

// Simple internal-admin guard: request must include X-Admin-Secret header
// matching the ADMIN_SECRET env var. Falls back to service role key prefix.
// Usage: const denied = requireAdminSecret(req); if (denied) return denied;
export function requireAdminSecret(req: NextRequest): NextResponse | null {
  const envSecret = process.env.ADMIN_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY?.slice(0, 32);
  if (!envSecret) return null; // no secret configured → allow (dev mode)

  const provided = req.headers.get('x-admin-secret') ?? req.nextUrl.searchParams.get('adminSecret') ?? '';
  if (provided === envSecret) return null; // authorized
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
