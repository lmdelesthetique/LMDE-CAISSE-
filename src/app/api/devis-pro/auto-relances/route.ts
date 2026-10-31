import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendWhatsApp, sendEmailNotification } from '@/lib/whatsappService';
import { normalizePhone } from '@/lib/utils/phoneUtils';
import { randomBytes } from 'crypto';

export const maxDuration = 60;

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// GET — preview (default) or run relances (?send=1, called by Vercel cron)
export async function GET(req: NextRequest) {
  const send = req.nextUrl.searchParams.get('send') === '1';
  const supabase = createAdminClient();
  const today = new Date().toISOString().split('T')[0];
  const cutoff = new Date(Date.now() - 25 * 24 * 3600 * 1000).toISOString();

  if (!send) {
    // Preview only — count due relances
    const { data, error } = await supabase
      .from('devis_pro')
      .select('id, numero, date_reassort, relance_auto_sent_at, client:clients(first_name, last_name, phone, whatsapp)')
      .lte('date_reassort', today)
      .not('date_reassort', 'is', null)
      .not('statut', 'eq', 'annule')
      .or(`relance_auto_sent_at.is.null,relance_auto_sent_at.lt.${cutoff}`);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ due: data?.length ?? 0, devis: data ?? [] });
  }

  // ?send=1 — actually run (called by Vercel cron daily at 9h UTC)
  const syntheticReq = new Request(req.url, { method: 'POST', headers: req.headers });
  return POST(new NextRequest(syntheticReq));
}

// POST — run relances (called by cron or manually)
// Body (optional): { devisId: string } to send for a single devis regardless of date
export async function POST(req: NextRequest) {
  const supabase = createAdminClient();
  const today = new Date().toISOString().split('T')[0];
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://lmdecaisse.com';

  let forceDevisId: string | null = null;
  try {
    const body = await req.json().catch(() => ({}));
    forceDevisId = body?.devisId ?? null;
  } catch { /* no body */ }

  let query = supabase
    .from('devis_pro')
    .select(`
      id, numero, date_reassort, items, client_token, created_at,
      client:clients(id, first_name, last_name, phone, whatsapp, email)
    `)
    .not('statut', 'eq', 'annule');

  if (forceDevisId) {
    // Force send for a specific devis (manual from dashboard)
    query = query.eq('id', forceDevisId);
  } else {
    // Auto: only devis with date_reassort due and not sent in last 25 days
    query = query
      .lte('date_reassort', today)
      .not('date_reassort', 'is', null)
      .or(`relance_auto_sent_at.is.null,relance_auto_sent_at.lt.${new Date(Date.now() - 25 * 24 * 3600 * 1000).toISOString()}`);
  }

  const { data: dueDevis, error } = await query;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!dueDevis?.length) return NextResponse.json({ ok: true, sent: 0, message: 'Aucune relance à envoyer' });

  let sent = 0;
  let errors = 0;
  const results: { id: string; numero: string; status: 'sent' | 'no_phone' | 'error'; detail?: string }[] = [];

  for (const devis of dueDevis) {
    const client = devis.client as any;
    const phone = client?.whatsapp ?? client?.phone;
    const rawFirst = (client?.first_name as string | null)?.trim() ?? '';
    const rawLast = (client?.last_name as string | null)?.trim() ?? '';
    const firstName = (rawFirst && !/^\d+$/.test(rawFirst)) ? rawFirst : rawLast || 'Madame';

    const clientEmail = client?.email as string | undefined;

    if (!phone && !clientEmail) {
      results.push({ id: devis.id, numero: devis.numero ?? devis.id, status: 'no_phone' });
      errors++;
      continue;
    }

    const itemLines = (devis.items as any[])
      .filter(i => !i.isBonus)
      .slice(0, 8)
      .map((i: any) => `• ${i.name}${i.qty > 1 ? ` x${i.qty}` : ''}`)
      .join('\n');

    // Ensure the devis has a client_token — generate one if missing
    let token = devis.client_token as string | null;
    if (!token) {
      token = randomBytes(20).toString('hex');
      await supabase.from('devis_pro').update({ client_token: token }).eq('id', devis.id);
    }
    const devisLink = `${siteUrl}/devis/${token}`;

    // WhatsApp — message Séquence C J0 (personnel et chaleureux)
    const waMessage = `${firstName}, ta commande est prête ! Tu la récupères en boutique ou on te l'envoie ? Merci pour ta confiance, ça compte beaucoup pour moi.\n\n👉 Voir ta commande : ${devisLink}`;

    // Email — message Séquence C J-7 (fiche du mois prête)
    const reassortDate = devis.date_reassort ? new Date(devis.date_reassort).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }) : '';
    const emailBodyText = `Coucou ${firstName},

Ton mois est déjà préparé. Voici ce qu'on a prévu pour toi :
${itemLines}

La livraison est offerte dès 150 €.

Si quelque chose a changé dans ton mois (une nouvelle prestation, une cliente en plus, un produit en trop), dis-le-moi. Sinon, je prépare tout pour le ${reassortDate}.

C'est ça qui me fait plaisir dans ce métier : savoir que ton institut tourne sans que tu aies à y penser.

Christy`;

    const emailHtml = `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#fdf5f9;font-family:Georgia,serif">
<div style="max-width:580px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.07)">
  <div style="background:#e91e8c;padding:24px 32px">
    <p style="margin:0;font-size:13px;font-weight:bold;color:#fff;letter-spacing:1px;text-transform:uppercase">Le Monde de l'Esthétique</p>
  </div>
  <div style="padding:32px">
    ${emailBodyText.split('\n\n').map(p =>
      `<p style="font-size:15px;color:#444;line-height:1.8;margin:0 0 16px">${p.replace(/\n/g, '<br/>')}</p>`
    ).join('')}
    <div style="text-align:center;margin:28px 0">
      <a href="${devisLink}" style="display:inline-block;background:#e91e8c;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-size:15px;font-weight:bold">
        ✅ Voir ma commande →
      </a>
    </div>
  </div>
  <div style="background:#fdf5f9;padding:16px 32px;text-align:center;border-top:1px solid #f0d6e8">
    <p style="font-size:11px;color:#aaa;margin:0">Christy — LMDE Martinique 🇲🇶 · Pour se désabonner, répondre STOP.</p>
  </div>
</div>
</body>
</html>`;

    const emailSubject = `${firstName}, ta fiche du mois est prête`;

    try {
      // Send WhatsApp AND email in parallel
      const [waResult, emailResult] = await Promise.all([
        phone
          ? sendWhatsApp({ to: normalizePhone(phone), message: waMessage, email: clientEmail })
          : Promise.resolve({ ok: false, error: 'no_phone' } as { ok: boolean; error?: string }),
        clientEmail
          ? sendEmailNotification(clientEmail, firstName, emailSubject, waMessage, emailHtml)
          : Promise.resolve({ ok: false, error: 'no_email' } as { ok: boolean; error?: string }),
      ]);

      const anyOk = waResult.ok || emailResult.ok;

      if (anyOk) {
        await supabase.from('devis_pro')
          .update({ relance_auto_sent_at: new Date().toISOString() })
          .eq('id', devis.id);
        results.push({ id: devis.id, numero: devis.numero ?? devis.id, status: 'sent' });
        sent++;
      } else {
        const detail = [waResult.error, emailResult.error].filter(Boolean).join(' / ');
        results.push({ id: devis.id, numero: devis.numero ?? devis.id, status: 'error', detail });
        errors++;
      }
    } catch (e: any) {
      results.push({ id: devis.id, numero: devis.numero ?? devis.id, status: 'error', detail: e.message });
      errors++;
    }
  }

  console.log(`[devis-pro/auto-relances] sent=${sent} errors=${errors}`);
  return NextResponse.json({ ok: true, sent, errors, total: dueDevis.length, results });
}
