import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

const PAGE_SIZE = 1000;

async function fetchAllProducts(supabase: ReturnType<typeof createAdminClient>) {
  const results: any[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from('products')
      .select('id, name, image_url, sell_price_ttc, buy_price, description, category, stock, product_status, has_color_variants')
      .order('name')
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    results.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return results;
}

export async function GET() {
  const supabase = createAdminClient();

  const [{ data: cats, error: catError }, prods] = await Promise.all([
    supabase
      .from('categories')
      .select('id, name, color, icon')
      .eq('visible_in_client_portal', true)
      .eq('is_active', true)
      .order('sort_order'),
    fetchAllProducts(supabase),
  ]);

  if (catError) return NextResponse.json({ error: catError.message }, { status: 500 });

  // Trim category names to avoid trailing-space mismatches
  const visibleNames = new Set((cats ?? []).map((c: any) => (c.name as string).trim()));
  const filteredProducts = prods.filter((p: any) => visibleNames.has((p.category ?? '').trim()));

  return NextResponse.json({ categories: cats ?? [], products: filteredProducts });
}
