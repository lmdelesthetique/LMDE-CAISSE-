import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get('q') ?? '').trim();
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '8', 10), 50);

  if (q.length < 2) return NextResponse.json({ products: [] });

  let supabase: ReturnType<typeof createAdminClient>;
  try {
    supabase = createAdminClient();
  } catch (e: any) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  const { data, error } = await supabase
    .from('products')
    .select('id, name, ref, barcode, sell_price_ttc, sell_price_ht, tva, stock, image_url, status, product_status')
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
