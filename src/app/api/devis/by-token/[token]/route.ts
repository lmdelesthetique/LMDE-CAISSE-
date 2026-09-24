import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

type Ctx = { params: Promise<{ token: string }> };

// GET /api/devis/by-token/[token] — public, token is the access control
export async function GET(_req: NextRequest, { params }: Ctx) {
  const { token } = await params;
  const supabase = createAdminClient();

  const { data: devis, error } = await supabase
    .from('devis_pro')
    .select(`
      id, numero, items, discount_pct, credit, total_ttc, client_pays,
      free_shipping, statut, client_response, client_responded_at, notes,
      client:clients(first_name, last_name)
    `)
    .eq('client_token', token)
    .maybeSingle();

  if (error || !devis) return NextResponse.json({ error: 'Devis introuvable' }, { status: 404 });

  // Catalog for browsing — active products in stock
  const { data: products } = await supabase
    .from('products')
    .select('id, name, ref, sell_price_ttc, image_url, stock')
    .gt('stock', 0)
    .order('name');

  return NextResponse.json({ devis, products: products ?? [] });
}

// PATCH /api/devis/by-token/[token] — client submits their response
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { token } = await params;
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const supabase = createAdminClient();

  const { data: devis } = await supabase
    .from('devis_pro')
    .select('id, statut, discount_pct, credit')
    .eq('client_token', token)
    .maybeSingle();

  if (!devis) return NextResponse.json({ error: 'Devis introuvable' }, { status: 404 });
  if (['livre', 'annule'].includes(devis.statut)) {
    return NextResponse.json({ error: 'Ce devis ne peut plus être modifié' }, { status: 400 });
  }

  const response: 'accepted' | 'modified' = body.response;
  const newStatut = response === 'accepted' ? 'client_valide' : 'client_modifie';

  const patch: Record<string, any> = {
    client_response: response,
    client_responded_at: new Date().toISOString(),
    statut: newStatut,
    updated_at: new Date().toISOString(),
  };

  if (response === 'modified' && Array.isArray(body.items)) {
    const items = body.items;
    patch.items = items;
    const discountPct = Number(devis.discount_pct) || 0;
    const credit = Number(devis.credit) || 0;
    const rawTotal = items.reduce((s: number, i: any) => {
      if (i.isBonus) return s;
      return s + (Number(i.price) || 0) * (Number(i.qty) || 1);
    }, 0);
    const total = Math.round(rawTotal * (1 - discountPct / 100) * 100) / 100;
    const clientPays = Math.max(0, Math.round((total - credit) * 100) / 100);
    patch.total_ttc = total;
    patch.client_pays = clientPays;
  }

  const { error } = await supabase.from('devis_pro').update(patch).eq('id', devis.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
