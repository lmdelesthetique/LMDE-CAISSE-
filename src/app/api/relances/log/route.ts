import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// POST — log a relance as sent/ignored
// Body: { devis_id?, client_id, sequence, etape, canal, statut, sent_by?, sequence_id? }
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { devis_id, client_id, sequence, etape, canal, sent_by, sequence_id } = body;
  const statut = body.statut ?? 'envoye';

  if (!client_id || !sequence || !etape || !canal) {
    return NextResponse.json({ error: 'client_id, sequence, etape, canal requis' }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Upsert relance log (idempotent per devis+sequence+etape)
  const logPayload: any = {
    client_id,
    sequence,
    etape,
    canal,
    statut,
    sent_at: new Date().toISOString(),
    sent_by: sent_by ?? null,
  };
  if (devis_id) logPayload.devis_id = devis_id;

  const { error: logErr } = await supabase
    .from('devis_pro_relances')
    .insert(logPayload);

  if (logErr) return NextResponse.json({ error: logErr.message }, { status: 500 });

  // If it's a sequence A/B: advance to next etape
  if (sequence_id && statut === 'envoye') {
    await supabase
      .from('client_relance_sequences')
      .update({ etape_actuelle: etape, updated_at: new Date().toISOString() })
      .eq('id', sequence_id);
  }

  // If client responded "stop" → mark sequence stopped + flag on client
  if (statut === 'stop') {
    if (sequence_id) {
      await supabase
        .from('client_relance_sequences')
        .update({ statut: 'stop', updated_at: new Date().toISOString() })
        .eq('id', sequence_id);
    }
    // Mark client no_relance
    if (client_id) {
      await supabase
        .from('client_pro_profiles')
        .update({ no_relance: true })
        .eq('client_id', client_id);
    }
  }

  return NextResponse.json({ ok: true });
}

// GET — history for a client or devis
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const clientId = searchParams.get('client_id');
  const devisId = searchParams.get('devis_id');

  if (!clientId && !devisId) {
    return NextResponse.json({ error: 'client_id ou devis_id requis' }, { status: 400 });
  }

  const supabase = createAdminClient();

  let q = supabase
    .from('devis_pro_relances')
    .select('*')
    .order('sent_at', { ascending: false })
    .limit(50);

  if (clientId) q = q.eq('client_id', clientId);
  if (devisId) q = q.eq('devis_id', devisId);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ logs: data ?? [] });
}
