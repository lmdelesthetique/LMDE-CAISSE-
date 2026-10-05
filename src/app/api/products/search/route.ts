import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get('q') ?? '').trim();
  const refsParam = (searchParams.get('refs') ?? '').trim();
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '8', 10), 100);

  let supabase: ReturnType<typeof createAdminClient>;
  try {
    supabase = createAdminClient();
  } catch (e: any) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  // refs= mode: lookup by ref array (for barcode batch lookup)
  if (refsParam) {
    const refs = refsParam.split(',').map(r => r.trim()).filter(Boolean);
    if (refs.length === 0) return NextResponse.json([]);
    const { data, error } = await supabase
      .from('products')
      .select('id, name, ref, barcode, buy_price, sell_price_ttc, stock, image_url, status, product_status, category, is_kit')
      .in('ref', refs);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data ?? []);
  }

  if (q.length < 2) return NextResponse.json({ products: [] });

  const { data, error } = await supabase
    .from('products')
    .select('id, name, ref, barcode, sell_price_ttc, sell_price_ht, tva, stock, min_stock, image_url, status, product_status, category, is_kit, buy_price, purchase_price_supplier')
    .or(`name.ilike.%${q}%,ref.ilike.%${q}%,barcode.ilike.%${q}%`)
    .neq('product_status', 'inactive')
    .order('name')
    .limit(limit);

  if (error) {
    console.error('[api/products/search]', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ products: data ?? [] });
}
