import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const productId = searchParams.get('productId');
  if (!productId) return NextResponse.json({ error: 'productId requis' }, { status: 400 });

  try {
    const supabase = createAdminClient();

    // Step 1: fetch kit rows
    const { data: kitRows, error: kitError } = await supabase
      .from('product_kits')
      .select('component_id, quantity')
      .eq('product_id', productId);

    if (kitError) return NextResponse.json({ error: kitError.message }, { status: 500 });
    if (!kitRows || kitRows.length === 0) return NextResponse.json({ components: [] });

    // Step 2: fetch product details for each component
    const componentIds = kitRows.map((r: any) => r.component_id);
    const { data: products, error: prodError } = await supabase
      .from('products')
      .select('id, name, ref, image_url')
      .in('id', componentIds);

    if (prodError) return NextResponse.json({ error: prodError.message }, { status: 500 });

    const productMap = new Map((products ?? []).map((p: any) => [p.id, p]));

    const components = kitRows.map((row: any) => {
      const prod = productMap.get(row.component_id) as any;
      return {
        componentId: row.component_id,
        quantity: row.quantity,
        name: prod?.name ?? '',
        ref: prod?.ref ?? '',
        imageUrl: prod?.image_url ?? null,
      };
    });

    return NextResponse.json({ components });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
