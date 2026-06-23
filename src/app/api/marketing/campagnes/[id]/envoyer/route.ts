import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getSegmentClients, type SegmentKey } from '@/lib/segmentationService';
import { sendWhatsApp } from '@/lib/whatsappService';

function makeAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = makeAdminClient();

  const { data: campagne, error: fetchErr } = await supabase
    .from('campagnes_marketing').select('*').eq('id', id).maybeSingle();
  if (fetchErr || !campagne) return NextResponse.json({ error: 'Campagne introuvable' }, { status: 404 });
  if (campagne.statut === 'en_cours') return NextResponse.json({ error: 'Campagne déjà en cours' }, { status: 409 });

  const clients = await getSegmentClients(campagne.segment as SegmentKey);
  if (!clients.length) return NextResponse.json({ error: 'Aucune cliente dans ce segment' }, { status: 400 });

  await supabase.from('campagnes_marketing').update({
    statut: 'en_cours',
    total_clients: clients.length,
    envoyes: 0,
    erreurs: 0,
  }).eq('id', id);

  let envoyes = 0;
  let erreurs = 0;

  for (const client of clients) {
    const clientName = `${client.first_name} ${client.last_name}`.trim() || 'Cliente';
    const personalizedMsg = campagne.message.replace(/\{prénom\}/gi, client.first_name || 'Cliente');

    const result = await sendWhatsApp({ to: client.phone, message: personalizedMsg });

    const statut = result.ok ? 'envoye' : 'erreur';
    if (result.ok) envoyes++; else erreurs++;

    await supabase.from('campagne_marketing_logs').insert({
      campagne_id: id,
      client_id: client.id,
      phone: client.phone,
      client_name: clientName,
      statut,
      error_message: result.error ?? null,
    });

    // Rate limit: 500ms between sends
    await new Promise(r => setTimeout(r, 500));
  }

  await supabase.from('campagnes_marketing').update({
    statut: 'terminee',
    envoyes,
    erreurs,
    sent_at: new Date().toISOString(),
  }).eq('id', id);

  return NextResponse.json({ ok: true, envoyes, erreurs, total: clients.length });
}
