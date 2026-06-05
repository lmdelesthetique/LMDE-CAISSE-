import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

const COOKIE_NAME = 'livreur_session';
const MAX_AGE = 60 * 60 * 12; // 12 hours

function normalizePhone(raw: string): string {
  const stripped = raw.replace(/\s/g, '').trim();
  if (/^0[0-9]{9}$/.test(stripped)) return '+596' + stripped.slice(1);
  return stripped;
}

// POST /api/livreur/auth — validate credentials, set session cookie
export async function POST(request: Request) {
  let body: { phone?: string; pin?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { phone, pin } = body;
  if (!phone || !pin) {
    return NextResponse.json({ error: 'phone and pin required' }, { status: 400 });
  }

  const supabase = createAdminClient();
  const phoneRaw = phone.replace(/\s/g, '').trim();
  const phoneNorm = normalizePhone(phone);
  const pinTrimmed = String(pin).trim();

  let driver: { id: string; first_name: string; last_name: string } | null = null;
  for (const candidate of Array.from(new Set([phoneRaw, phoneNorm]))) {
    const { data } = await supabase
      .from('drivers')
      .select('id, first_name, last_name')
      .eq('phone', candidate)
      .eq('pin_code', pinTrimmed)
      .eq('status', 'active')
      .maybeSingle();
    if (data) { driver = data; break; }
  }

  if (!driver) {
    return NextResponse.json({ error: 'Téléphone ou PIN incorrect.' }, { status: 401 });
  }

  const response = NextResponse.json({
    ok: true,
    driver: { id: driver.id, first_name: driver.first_name, last_name: driver.last_name },
  });

  response.cookies.set(COOKIE_NAME, driver.id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: MAX_AGE,
    path: '/',
  });

  return response;
}

// DELETE /api/livreur/auth — clear session cookie
export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 0,
    path: '/',
  });
  return response;
}
