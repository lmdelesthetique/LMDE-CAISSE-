import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// GET /api/client-portal/product-variants?productId=... — in-stock color variants for client portal
export async function GET(req: NextRequest) {
  const productId = req.nextUrl.searchParams.get('productId');
  if (!productId) return NextResponse.json({ error: 'productId required' }, { status: 400 });
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('product_color_variants')
    .select('id, color_name, color_hex, quantity')
    .eq('product_id', productId)
    .gt('quantity', 0)
    .order('color_name');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}
