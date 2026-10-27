import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function makeAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

// PATCH — cancel a scheduled campaign (reverts to brouillon)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = makeAdminClient();

  let body: any;
  try { body = await req.json(); } catch { body = {}; }

  const { action } = body as { action?: string };

  if (action === 'annuler') {
    const { error } = await supabase
      .from('campagnes_marketing')
      .update({ statut: 'brouillon', scheduled_at: null })
      .eq('id', id)
      .eq('statut', 'programme');
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Action non reconnue' }, { status: 400 });
}

// DELETE — delete a campaign (only brouillon, programme or erreur)
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = makeAdminClient();

  const { data: campagne } = await supabase
    .from('campagnes_marketing').select('statut').eq('id', id).maybeSingle();
  if (!campagne) return NextResponse.json({ error: 'Campagne introuvable' }, { status: 404 });
  if (campagne.statut === 'en_cours') return NextResponse.json({ error: "Campagne en cours d'envoi" }, { status: 409 });

  const { error } = await supabase.from('campagnes_marketing').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
