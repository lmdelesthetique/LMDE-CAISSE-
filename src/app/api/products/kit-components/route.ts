import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const productId = searchParams.get('productId');
  if (!productId) return NextResponse.json({ error: 'productId requis' }, { status: 400 });

  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('product_kits')
      .select('component_id, quantity, products!product_kits_component_id_fkey(id, name, ref, image_url)')
      .eq('product_id', productId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const components = (data ?? []).map((row: any) => ({
      componentId: row.component_id,
      quantity: row.quantity,
      name: (row.products as any)?.name ?? '',
      ref: (row.products as any)?.ref ?? '',
      imageUrl: (row.products as any)?.image_url ?? null,
    }));

    return NextResponse.json({ components });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
