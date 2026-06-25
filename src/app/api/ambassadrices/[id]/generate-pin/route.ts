import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function makeAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase env vars not configured');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = makeAdminClient();

  // Generate a unique 6-digit PIN
  let pin = '';
  let attempts = 0;
  while (attempts < 10) {
    pin = String(Math.floor(100000 + Math.random() * 900000));
    const { data: existing } = await supabase
      .from('ambassadrices')
      .select('id')
      .eq('pin_code', pin)
      .maybeSingle();
    if (!existing) break;
    attempts++;
  }

  const { data, error } = await supabase
    .from('ambassadrices')
    .update({ pin_code: pin, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('id, prenom, nom, pin_code')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ pin: data.pin_code });
}
