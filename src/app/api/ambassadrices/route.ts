import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function makeClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  if (!url || !key) throw new Error('Supabase env vars not configured');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function GET() {
  try {
    const supabase = makeClient();
    const { data, error } = await supabase
      .from('ambassadrices')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data ?? []);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  try {
    const supabase = makeClient();
    const lienUnique = crypto.randomUUID().substring(0, 8);

    const { data, error } = await supabase
      .from('ambassadrices')
      .insert({
        prenom: body.prenom,
        nom: body.nom,
        email: body.email ?? null,
        telephone: body.telephone ?? null,
        instagram_url: body.instagram_url ?? null,
        instagram_followers: body.instagram_followers ?? 0,
        tiktok_url: body.tiktok_url ?? null,
        tiktok_followers: body.tiktok_followers ?? 0,
        grade: body.grade ?? 'debutante',
        statut: body.statut ?? 'active',
        notes: body.notes ?? null,
        lien_unique: lienUnique,
        google_drive_url: body.google_drive_url ?? null,
        date_entree: body.date_entree ?? new Date().toISOString(),
      })
      .select('*')
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
