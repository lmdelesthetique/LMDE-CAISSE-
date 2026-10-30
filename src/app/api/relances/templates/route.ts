import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET() {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('relance_templates')
    .select('*')
    .order('sequence', { ascending: true })
    .order('delai_jours', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ templates: data ?? [] });
}

export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { id, sujet, apercu, corps, actif } = body;
  if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 });

  const supabase = createAdminClient();
  const update: any = { updated_at: new Date().toISOString() };
  if (sujet !== undefined) update.sujet = sujet;
  if (apercu !== undefined) update.apercu = apercu;
  if (corps !== undefined) update.corps = corps;
  if (actif !== undefined) update.actif = actif;

  const { error } = await supabase
    .from('relance_templates')
    .update(update)
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
