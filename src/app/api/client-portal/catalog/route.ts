import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(req: Request) {
  const debug = new URL(req.url).searchParams.get('debug') === '1';
  const supabase = createAdminClient();
  const hasServiceKey = !!process.env.SUPABASE_SERVICE_ROLE_KEY;

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

  // Count per category for diagnostics
  const countByCategory: Record<string, number> = {};
  for (const p of prods ?? []) {
    const cat = (p as any).category ?? '';
    countByCategory[cat] = (countByCategory[cat] ?? 0) + 1;
  }

  console.log('[catalog] service_role_key:', hasServiceKey, '| total_prods:', (prods ?? []).length, '| filtered:', filteredProducts.length, '| by_cat:', JSON.stringify(countByCategory));

  if (debug) {
    return NextResponse.json({
      service_role_key: hasServiceKey,
      total_products_from_db: (prods ?? []).length,
      total_filtered: filteredProducts.length,
      count_by_category: countByCategory,
      visible_categories: Array.from(visibleNames),
    });
  }

  return NextResponse.json({ categories: cats ?? [], products: filteredProducts });
}
