import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendWhatsApp, sendEmailNotification } from '@/lib/whatsappService';

export const maxDuration = 60;

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function normalizePhone(raw: string): string {
  const clean = raw.replace(/\s/g, '');
  if (clean.startsWith('+')) return clean;
  if (clean.startsWith('0')) return '+596' + clean.slice(1);
  return '+596' + clean;
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

    const devisLink = devis.client_token
      ? `${siteUrl}/devis/${devis.client_token}`
      : null;

    // WhatsApp plain-text message
    const waMessage = [
      `Bonjour ${firstName} 🌸`,
      '',
      `Chez Le Monde de l'Esthétique, on pense à votre stock avant même que vous ayez à le faire 💅`,
      '',
      `Votre prochaine commande est prête :`,
      itemLines,
      '',
      devisLink
        ? `👉 Consultez, modifiez si besoin et confirmez en 1 clic :\n${devisLink}`
        : `👉 Contactez-nous pour renouveler votre commande.`,
      '',
      `Sans engagement — vous validez quand vous êtes prête 😊`,
      `— Le Monde de l'Esthétique, à votre service ✨`,
    ].join('\n');

    // HTML email with button and persuasive layout
    const emailHtml = `
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#fdf5f9;font-family:Arial,sans-serif">
<div style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08)">
  <!-- Header -->
  <div style="background:#e91e8c;padding:32px 32px 24px;text-align:center">
    <p style="margin:0;font-size:22px;font-weight:bold;color:#fff;letter-spacing:0.5px">Le Monde de l'Esthétique 💅</p>
  </div>
  <!-- Body -->
  <div style="padding:32px">
    <p style="font-size:18px;font-weight:bold;color:#18181b;margin:0 0 16px">Bonjour ${firstName} 🌸</p>
    <p style="font-size:15px;color:#444;line-height:1.7;margin:0 0 20px">
      Vos produits préférés vous attendent ! Vos stocks diminuent vite, et votre clientèle mérite toujours le meilleur.
      <strong>En renouvelant maintenant, vous évitez les ruptures et restez toujours prête.</strong>
    </p>
    <!-- Items -->
    <div style="background:#fdf5f9;border-radius:8px;padding:16px 20px;margin-bottom:24px">
      <p style="font-size:13px;font-weight:bold;color:#e91e8c;margin:0 0 8px;text-transform:uppercase;letter-spacing:0.5px">Votre sélection habituelle</p>
      <p style="font-size:14px;color:#333;line-height:1.8;margin:0;white-space:pre-line">${itemLines}</p>
    </div>
    <!-- Psychological nudge -->
    <div style="border-left:4px solid #e91e8c;padding:12px 16px;background:#fff0f7;margin-bottom:28px">
      <p style="font-size:14px;color:#444;line-height:1.6;margin:0">
        💡 <strong>Le saviez-vous ?</strong> Les professionnels qui réassortent régulièrement enregistrent moins de pertes de clients liées à l'indisponibilité des soins. <em>Ne laissez pas un produit manquant freiner votre activité !</em>
      </p>
    </div>
    ${devisLink ? `
    <!-- CTA Button -->
    <div style="text-align:center;margin-bottom:28px">
      <a href="${devisLink}" style="display:inline-block;background:#e91e8c;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-size:15px;font-weight:bold;letter-spacing:0.3px">
        ✅ Consulter et renouveler mon devis
      </a>
      <p style="font-size:12px;color:#999;margin:10px 0 0">Ou copiez ce lien dans votre navigateur :<br/><a href="${devisLink}" style="color:#e91e8c;word-break:break-all">${devisLink}</a></p>
    </div>` : `<p style="color:#444;font-size:14px">Contactez-nous pour renouveler votre commande.</p>`}
    <p style="font-size:13px;color:#888;margin:0">Des questions ? Répondez simplement à cet email.</p>
  </div>
  <!-- Footer -->
  <div style="background:#fdf5f9;padding:16px 32px;text-align:center;border-top:1px solid #f0d6e8">
    <p style="font-size:12px;color:#aaa;margin:0">Le Monde de l'Esthétique — Martinique 🇲🇶</p>
  </div>
</div>
</body>
</html>`;

    const emailSubject = `${firstName}, vos produits vous attendent ! 🌸`;

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
