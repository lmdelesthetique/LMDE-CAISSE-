import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getSegmentClients, type SegmentKey } from '@/lib/segmentationService';
import { sendCampaignMultiChannel } from '@/lib/whatsappService';

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
    let smsSent = 0;
    let emailSent = 0;
    const logs: any[] = [];

    const subject = campagne.nom ?? "Le Monde de l'Esthétique";

    for (const client of clients) {
      const clientName = (client.first_name || 'Cliente').trim();
      const messageAI = (campagne.message ?? '').replace(/\{prénom\}/gi, clientName);

      const result = await sendCampaignMultiChannel(
        { phone: client.phone || undefined, email: client.email || undefined, name: clientName },
        subject,
        messageAI
      );

      if (result.anyOk) envoyes++; else erreurs++;
      if (result.sms) smsSent++;
      if (result.email) emailSent++;

      logs.push({
        campagne_id: id,
        client_id: client.id,
        phone: client.phone,
        client_name: clientName,
        statut: result.anyOk ? 'envoye' : 'erreur',
        error_message: result.anyOk ? null : 'Aucun canal disponible ou erreur envoi',
      });

      if (logs.length >= 100) {
        await supabase.from('campagne_marketing_logs').insert(logs.splice(0, 100));
      }
    }

    if (logs.length > 0) {
      await supabase.from('campagne_marketing_logs').insert(logs);
    }

    await supabase.from('campagnes_marketing').update({
      statut: 'terminee',
      envoyes,
      erreurs,
      sent_at: new Date().toISOString(),
    }).eq('id', id);

    return NextResponse.json({ ok: true, envoyes, erreurs, smsSent, emailSent, total: clients.length, channel: 'sms+email' });
  } catch (e: any) {
    console.error('[envoyer]', e.message);
    try { await supabase.from('campagnes_marketing').update({ statut: 'erreur' }).eq('id', id); } catch { /* non-blocking */ }
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
