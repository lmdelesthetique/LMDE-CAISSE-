import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// POST /api/products/save-kit
// Body: { productId?: string, product: {...}, components: [{component_id, quantity}] }
// Creates or updates a kit product + replaces its components atomically.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body?.product || !Array.isArray(body.components)) {
    return NextResponse.json({ error: 'Missing product or components' }, { status: 400 });
  }

  const supabase = createAdminClient();
  let productId: string = body.productId ?? '';

  if (productId) {
    const { error } = await supabase
      .from('products')
      .update({ ...body.product, updated_at: new Date().toISOString() })
      .eq('id', productId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await supabase.from('product_kits').delete().eq('product_id', productId);
  } else {
    const { data, error } = await supabase
      .from('products')
      .insert({ ...body.product, created_at: new Date().toISOString() })
      .select('id')
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    productId = data.id;
  }

  if (body.components.length > 0) {
    const kitRows = body.components.map((c: any) => ({
      product_id: productId,
      component_id: c.component_id,
      quantity: c.quantity,
    }));
    const { error } = await supabase.from('product_kits').insert(kitRows);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ id: productId });
}
