import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// POST /api/products/recalc-margins — recalculate gross_margin + margin_rate for given product names
// Body: { productNames: string[] }
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const productNames: string[] = Array.isArray(body?.productNames) ? body.productNames : [];
  if (productNames.length === 0) return NextResponse.json({ ok: true, updated: 0 });

  const supabase = createAdminClient();

  // Try RPC first
  const { error: rpcErr } = await supabase
    .rpc('recalc_margins_batch', { product_names: productNames })
    .maybeSingle();

  if (!rpcErr) return NextResponse.json({ ok: true, method: 'rpc' });

  // Fallback: compute client-side and batch update
  const { data: prods, error: selectErr } = await supabase
    .from('products')
    .select('id, sell_price_ht, sell_price_ttc, tva, buy_price')
    .in('name', productNames.slice(0, 200));

  if (selectErr || !prods) return NextResponse.json({ error: selectErr?.message ?? 'fetch failed' }, { status: 500 });

  let updated = 0;
  for (const p of prods) {
    const tva = Number(p.tva) > 0 ? Number(p.tva) : 8.5;
    const ht = Number(p.sell_price_ht) > 0
      ? Number(p.sell_price_ht)
      : Number(p.sell_price_ttc) / (1 + tva / 100);
    const bp = Number(p.buy_price) || 0;
    const gm = +(ht - bp).toFixed(4);
    const mr = bp > 0 ? +((gm / bp) * 100).toFixed(4) : 0;
    await supabase.from('products').update({ gross_margin: gm, margin_rate: mr }).eq('id', p.id);
    updated++;
  }

  return NextResponse.json({ ok: true, method: 'fallback', updated });
}
