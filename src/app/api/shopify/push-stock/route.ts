import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSupabase } from '@supabase/supabase-js';
import { setInventoryLevel, getAccessToken } from '@/lib/services/shopifyService';

function getSupabase() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createSupabase(process.env.NEXT_PUBLIC_SUPABASE_URL!, key);
}

// POST /api/shopify/push-stock
// Body: { productIds?: string[] }  — omit to push ALL linked products
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const specificIds: string[] | undefined = body.productIds;

  // Early check: Shopify token configured?
  const token = await getAccessToken();
  if (!token) {
    return NextResponse.json({ error: 'Shopify non connecté — token manquant', ok: 0, failed: 0, total: 0 }, { status: 503 });
  }

  const supabase = getSupabase();

  let query = supabase
    .from('products')
    .select('id, name, stock, shopify_inventory_item_id')
    .eq('shopify', true)
    .not('shopify_inventory_item_id', 'is', null);

  if (specificIds?.length) {
    query = query.in('id', specificIds);
  }

  const { data, error } = await query;
  if (error) {
    console.error('[push-stock] DB error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const products: { id: string; name: string; stock: number; shopify_inventory_item_id: string }[] =
    (data ?? []).filter((r: any) => r.shopify_inventory_item_id);

  if (!products.length) {
    return NextResponse.json({ ok: 0, failed: 0, total: 0, warning: 'Aucun produit lié trouvé avec shopify_inventory_item_id' });
  }

  let ok = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const p of products) {
    const qty = Math.max(0, Number(p.stock) || 0);
    const success = await setInventoryLevel(p.shopify_inventory_item_id, qty);
    if (success) {
      ok++;
    } else {
      failed++;
      errors.push(`${p.name ?? p.id} (inv:${p.shopify_inventory_item_id})`);
      console.error('[push-stock] failed:', p.name, p.shopify_inventory_item_id, 'qty:', qty);
    }
  }

  console.log(`[push-stock] done: ${ok} ok, ${failed} failed / ${products.length} total`);
  return NextResponse.json({ ok, failed, total: products.length, errors });
}
