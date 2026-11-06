import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { randomBytes } from 'crypto';

// POST — clone a devis as a fresh reassort for a new cycle
// Body: { template_devis_id: string }
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { template_devis_id } = body;
  if (!template_devis_id) return NextResponse.json({ error: 'template_devis_id requis' }, { status: 400 });

  const supabase = createAdminClient();

  // Fetch original devis
  const { data: original, error: fetchErr } = await supabase
    .from('devis_pro')
    .select('client_id, items, discount_pct, credit, total_ttc, client_pays, free_shipping, type_expedition, notes, date_reassort')
    .eq('id', template_devis_id)
    .maybeSingle();

  if (fetchErr || !original) return NextResponse.json({ error: 'Devis introuvable' }, { status: 404 });

  const now = new Date();
  const yy = now.getFullYear().toString().slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const rand = Math.floor(Math.random() * 9000) + 1000;
  const numero = `DEV-${yy}${mm}-${rand}`;
  const clientToken = randomBytes(20).toString('hex');

  // Reset item-level bonus/paid state for fresh cycle
  const freshItems = Array.isArray(original.items)
    ? original.items
        .filter((i: any) => !String(i.id || '').startsWith('custom-alma'))
        .map((i: any) => ({ ...i, isBonus: false }))
    : [];

  const { data: newDevis, error: insertErr } = await supabase
    .from('devis_pro')
    .insert({
      client_id: original.client_id,
      numero,
      items: freshItems,
      discount_pct: original.discount_pct ?? 0,
      credit: original.credit ?? 0,
      total_ttc: original.total_ttc ?? 0,
      client_pays: original.client_pays ?? 0,
      free_shipping: original.free_shipping ?? false,
      statut: 'envoye',
      type_expedition: original.type_expedition ?? 'retrait',
      notes: original.notes ?? null,
      date_reassort: original.date_reassort, // carry over so reassort continues on new devis
      paiements: [],
      paye_total: 0,
      client_token: clientToken,
      sent_at: now.toISOString(),
      created_at: now.toISOString(),
    })
    .select('id, numero, client_token')
    .single();

  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });

  // Remove date_reassort from original so it no longer appears in future relance cycles
  await supabase.from('devis_pro').update({ date_reassort: null }).eq('id', template_devis_id);

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.lmdecaisse.com';
  return NextResponse.json({
    ok: true,
    devis_id: (newDevis as any).id,
    numero: (newDevis as any).numero,
    client_token: (newDevis as any).client_token,
    link: `${siteUrl}/devis/${(newDevis as any).client_token}`,
  });
}
