import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getSegmentClients, type SegmentKey, type ClientForSegment } from '@/lib/segmentationService';
import { sendCampaignMultiChannel } from '@/lib/whatsappService';

function makeAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export const maxDuration = 300;

type Channel = 'sms+email' | 'sms' | 'email';

// 5 concurrent sends per batch — stays under Brevo rate limits and keeps
// 3500-client campaigns within the 300s Vercel timeout (~70s vs ~350s sequential)
const SEND_CONCURRENCY = 5;

function parseSegmentStr(raw: string): { key: string; channel: Channel; ids: string[] | null } {
  const parts = raw.split('|');
  const key = parts[0];
  const isChannel = (s?: string): s is Channel => s === 'sms' || s === 'email' || s === 'sms+email';

  if (key === 'custom') {
    if (parts.length >= 3 && isChannel(parts[1])) {
      return { key, channel: parts[1], ids: parts[2].split(',').filter(Boolean) };
    }
    if (parts.length >= 2) {
      return { key, channel: 'sms+email', ids: parts[1].split(',').filter(Boolean) };
    }
    return { key, channel: 'sms+email', ids: [] };
  }

  const channel: Channel = isChannel(parts[1]) ? parts[1] : 'sms+email';
  return { key, channel, ids: null };
}

async function getClientsByIds(supabase: ReturnType<typeof makeAdminClient>, ids: string[]): Promise<ClientForSegment[]> {
  if (!ids.length) return [];
  const results: any[] = [];
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500);
    const { data } = await supabase
      .from('clients')
      .select('id, first_name, last_name, phone, email')
      .in('id', chunk);
    if (data) results.push(...data);
  }
  return results.map((c: any) => ({
    id: c.id,
    first_name: c.first_name ?? '',
    last_name: c.last_name ?? '',
    phone: c.phone ?? '',
    email: c.email ?? undefined,
  }));
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = makeAdminClient();

  try {
    const { data: campagne, error: fetchErr } = await supabase
      .from('campagnes_marketing').select('*').eq('id', id).maybeSingle();
    if (fetchErr || !campagne) return NextResponse.json({ error: 'Campagne introuvable' }, { status: 404 });
    if (campagne.statut === 'en_cours') return NextResponse.json({ error: 'Campagne déjà en cours' }, { status: 409 });
    if (campagne.statut === 'terminee') return NextResponse.json({ error: 'Campagne déjà envoyée' }, { status: 409 });

    const { key: segKey, channel, ids: customIds } = parseSegmentStr(campagne.segment ?? 'tous');

    let clients: ClientForSegment[];
    if (customIds?.length) {
      clients = await getClientsByIds(supabase, customIds);
    } else {
      clients = await getSegmentClients(segKey as SegmentKey);
    }

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
    const errorMessages: string[] = [];
    const logBatch: any[] = [];

    // Decode nom|||sujet|||imageUrl|||links encoding
    const [campaignNom, encodedSubject, encodedImageUrl, encodedLinks] = (campagne.nom ?? '').split('|||');
    const subjectTemplate = encodedSubject?.trim() || campaignNom || "Le Monde de l'Esthétique";
    const imageUrl = encodedImageUrl?.trim() || undefined;
    const linksRaw = encodedLinks?.trim() || undefined;

    // Parallel batches of SEND_CONCURRENCY to avoid Vercel timeout on large segments
    for (let b = 0; b < clients.length; b += SEND_CONCURRENCY) {
      const batch = clients.slice(b, b + SEND_CONCURRENCY);

      const results = await Promise.all(batch.map(async (client) => {
        const clientName = (client.first_name || 'Cliente').trim();
        const subject = subjectTemplate.replace(/\{prénom\}/gi, clientName);
        const messageText = (campagne.message ?? '').replace(/\{prénom\}/gi, clientName);

        const result = await sendCampaignMultiChannel(
          { phone: client.phone || undefined, email: client.email || undefined, name: clientName },
          subject, messageText, channel, imageUrl, linksRaw
        );

        return { client, clientName, result };
      }));

      for (const { client, clientName, result } of results) {
        if (result.anyOk) envoyes++; else erreurs++;
        if (result.sms) smsSent++;
        if (result.email) emailSent++;
        if (!result.anyOk && result.errorMsg) errorMessages.push(result.errorMsg);

        logBatch.push({
          campagne_id: id,
          client_id: client.id,
          phone: client.phone,
          client_name: clientName,
          statut: result.anyOk ? 'envoye' : 'erreur',
          error_message: result.anyOk ? null : (result.errorMsg ?? 'Erreur envoi'),
        });
      }

      // Flush logs every 100 — non-blocking (missing table must not abort the campaign)
      if (logBatch.length >= 100) {
        const toFlush = logBatch.splice(0, 100);
        try { await supabase.from('campagne_marketing_logs').insert(toFlush); } catch {}
      }
    }

    // Flush remaining logs
    if (logBatch.length > 0) {
      try { await supabase.from('campagne_marketing_logs').insert(logBatch); } catch {}
    }

    await supabase.from('campagnes_marketing').update({
      statut: 'terminee',
      envoyes,
      erreurs,
      sent_at: new Date().toISOString(),
    }).eq('id', id);

    const errorSample = [...new Set(errorMessages)].slice(0, 3).join(', ');

    return NextResponse.json({ ok: true, envoyes, erreurs, smsSent, emailSent, total: clients.length, channel, errorSample: erreurs > 0 ? errorSample : undefined });
  } catch (e: any) {
    console.error('[envoyer]', e.message);
    try { await supabase.from('campagnes_marketing').update({ statut: 'erreur' }).eq('id', id); } catch {}
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
