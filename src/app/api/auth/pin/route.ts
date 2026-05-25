import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

async function sha256hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function POST(request: Request) {
  try {
    const { pin } = await request.json();
    if (!pin || typeof pin !== 'string') {
      return NextResponse.json({ ok: false, error: 'PIN manquant' }, { status: 400 });
    }

    const supabase = await createClient();
    const { data } = await supabase
      .from('app_settings')
      .select('pos_pin_hash')
      .eq('id', 'main')
      .maybeSingle();

    const storedHash = data?.pos_pin_hash ?? null;

    if (storedHash) {
      const enteredHash = await sha256hex(pin);
      if (enteredHash !== storedHash) {
        return NextResponse.json({ ok: false, error: 'Code PIN incorrect' }, { status: 401 });
      }
    }
    // If no PIN configured → free access

    const sessionValue = btoa(JSON.stringify({ exp: Date.now() + SESSION_TTL_MS }));
    const response = NextResponse.json({ ok: true });
    response.cookies.set('app_session', sessionValue, {
      httpOnly: true,
      sameSite: 'strict',
      path: '/',
      maxAge: SESSION_TTL_MS / 1000,
    });
    return response;
  } catch {
    return NextResponse.json({ ok: false, error: 'Erreur serveur' }, { status: 500 });
  }
}
