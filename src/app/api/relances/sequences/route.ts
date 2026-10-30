import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// GET — list active sequences for a client
export async function GET(req: NextRequest) {
  const clientId = req.nextUrl.searchParams.get('client_id');
  if (!clientId) return NextResponse.json({ error: 'client_id requis' }, { status: 400 });

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('client_relance_sequences')
    .select('*')
    .eq('client_id', clientId)
    .order('started_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ sequences: data ?? [] });
}

// POST — start a new sequence for a client
// Body: { client_id, sequence ('A'|'B'|'D'|'E'), devis_id? }
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { client_id, sequence, devis_id } = body;

  if (!client_id || !sequence) {
    return NextResponse.json({ error: 'client_id et sequence requis' }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Upsert: one active sequence per client per type
  const { data, error } = await supabase
    .from('client_relance_sequences')
    .upsert({
      client_id,
      sequence,
      devis_id: devis_id ?? null,
      etape_actuelle: null,
      started_at: new Date().toISOString(),
      statut: 'active',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'client_id,sequence' })
    .select('id')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id: data.id }, { status: 201 });
}

// PATCH — update sequence status (complete/stop/pause) or advance etape
// Body: { id, statut?, etape_actuelle? }
export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { id, statut, etape_actuelle } = body;
  if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 });

  const supabase = createAdminClient();
  const update: any = { updated_at: new Date().toISOString() };
  if (statut !== undefined) update.statut = statut;
  if (etape_actuelle !== undefined) update.etape_actuelle = etape_actuelle;

  const { error } = await supabase
    .from('client_relance_sequences')
    .update(update)
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
