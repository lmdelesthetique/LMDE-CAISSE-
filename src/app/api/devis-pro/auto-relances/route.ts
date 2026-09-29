import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendWhatsApp } from '@/lib/whatsappService';

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
    const firstName = client?.first_name ?? 'Madame';

    if (!phone) {
      results.push({ id: devis.id, numero: devis.numero ?? devis.id, status: 'no_phone' });
      errors++;
      continue;
    }

    const intlPhone = normalizePhone(phone);
    const itemLines = (devis.items as any[])
      .filter(i => !i.isBonus)
      .slice(0, 8)
      .map((i: any) => `• ${i.name}${i.qty > 1 ? ` x${i.qty}` : ''}`)
      .join('\n');

    const devisLink = devis.client_token
      ? `${siteUrl}/devis/${devis.client_token}`
      : null;

    const message = [
      `Bonjour ${firstName} 🌸`,
      '',
      `C'est le moment de votre réassort ! 🛍️`,
      '',
      `Voici votre dernier devis *${devis.numero ?? ''}* (du ${fmtDate(devis.created_at)}) :`,
      itemLines,
      '',
      devisLink
        ? `👉 Consulter et renouveler : ${devisLink}`
        : `👉 Contactez-nous pour renouveler votre commande.`,
      '',
      '— Le Monde de l\'Esthétique ✨',
    ].join('\n');

    try {
      const result = await sendWhatsApp({
        to: intlPhone,
        message,
        email: client?.email ?? undefined,
      });

      if (result.ok) {
        await supabase.from('devis_pro')
          .update({ relance_auto_sent_at: new Date().toISOString() })
          .eq('id', devis.id);
        results.push({ id: devis.id, numero: devis.numero ?? devis.id, status: 'sent' });
        sent++;
      } else {
        results.push({ id: devis.id, numero: devis.numero ?? devis.id, status: 'error', detail: result.error });
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
