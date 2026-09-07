import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET() {
  const supabase = createAdminClient();

  const [{ data: cats, error: catError }, { data: prods, error: prodError }] = await Promise.all([
    supabase
      .from('categories')
      .select('id, name, color, icon')
      .eq('visible_in_client_portal', true)
      .eq('is_active', true)
      .order('sort_order'),
    supabase
      .from('products')
      .select('id, name, image_url, sell_price_ttc, buy_price, description, category, stock, product_status, has_color_variants')
      .order('name')
      .limit(10000),
  ]);

  if (catError) return NextResponse.json({ error: catError.message }, { status: 500 });
  if (prodError) return NextResponse.json({ error: prodError.message }, { status: 500 });

  const visibleNames = new Set((cats ?? []).map((c: any) => c.name));
  const filteredProducts = (prods ?? []).filter((p: any) => visibleNames.has(p.category ?? ''));

  return NextResponse.json({ categories: cats ?? [], products: filteredProducts });
}
