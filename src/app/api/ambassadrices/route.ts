import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET() {
  try {
    const supabase = createAdminClient();
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
    const supabase = createAdminClient();
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
