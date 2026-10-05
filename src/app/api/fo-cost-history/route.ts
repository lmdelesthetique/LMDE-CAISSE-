import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(req: NextRequest) {
  const productId = req.nextUrl.searchParams.get('productId');
  const supabase = createAdminClient();
  let q = supabase
    .from('fo_product_cost_history')
    .select('*')
    .order('changed_at', { ascending: false });
  if (productId) q = q.eq('product_id', productId);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}
