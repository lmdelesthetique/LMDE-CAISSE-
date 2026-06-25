import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function makeAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase env vars not configured');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function POST(req: NextRequest) {
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const pin = String(body.pin ?? '').trim();
  if (!pin || pin.length !== 6 || !/^\d{6}$/.test(pin)) {
    return NextResponse.json({ error: 'Code PIN invalide (6 chiffres requis)' }, { status: 400 });
  }

  const supabase = makeAdminClient();
  const { data: ambassadrice, error } = await supabase
    .from('ambassadrices')
    .select('id, prenom, nom, lien_unique, grade, statut, pin_code')
    .eq('pin_code', pin)
    .eq('statut', 'active')
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!ambassadrice) {
    return NextResponse.json({ error: 'Code PIN incorrect ou compte inactif' }, { status: 401 });
  }

  return NextResponse.json({
    ok: true,
    lienUnique: ambassadrice.lien_unique,
    prenom: ambassadrice.prenom,
    nom: ambassadrice.nom,
    grade: ambassadrice.grade,
  });
}
