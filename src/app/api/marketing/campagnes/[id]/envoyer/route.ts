import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getSegmentClients, type SegmentKey } from '@/lib/segmentationService';
import { sendNotifCampagneBoutique, sendNotifCampagneSite } from '@/lib/whatsappService';

function makeAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export const maxDuration = 300; // 5 min max (Vercel/Next.js)

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = makeAdminClient();

  try {
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
    const logs: any[] = [];

    for (const client of clients) {
      const clientName = (client.first_name || 'Cliente').trim();
      const messageAI = (campagne.message ?? '').replace(/\{prénom\}/gi, clientName);
      const isSite = campagne.type === 'site';

      const result = isSite
        ? await sendNotifCampagneSite(client.phone, clientName, messageAI)
        : await sendNotifCampagneBoutique(
            client.phone,
            clientName,
            messageAI,
            campagne.code_promo ?? '',
            campagne.date_limite ?? ''
          );

      if (result.ok) envoyes++; else erreurs++;

      logs.push({
        campagne_id: id,
        client_id: client.id,
        phone: client.phone,
        client_name: clientName,
        statut: result.ok ? 'envoye' : 'erreur',
        error_message: result.error ?? null,
      });

      // Insert logs in batches of 100 to avoid holding them all in memory
      if (logs.length >= 100) {
        await supabase.from('campagne_marketing_logs').insert(logs.splice(0, 100));
      }
    }

    // Insert remaining logs
    if (logs.length > 0) {
      await supabase.from('campagne_marketing_logs').insert(logs);
    }

    await supabase.from('campagnes_marketing').update({
      statut: 'terminee',
      envoyes,
      erreurs,
      sent_at: new Date().toISOString(),
    }).eq('id', id);

    return NextResponse.json({ ok: true, envoyes, erreurs, total: clients.length, channel: 'whatsapp/email' });
  } catch (e: any) {
    console.error('[envoyer]', e.message);
    try { await supabase.from('campagnes_marketing').update({ statut: 'erreur' }).eq('id', id); } catch { /* non-blocking */ }
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
