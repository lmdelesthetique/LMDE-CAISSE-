import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// GET /api/stock/movements?productId=xxx&limit=50&movementType=entry&since=ISO
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const productId = searchParams.get('productId');
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '50'), 1000);
  const movementType = searchParams.get('movementType');
  const since = searchParams.get('since');

  const supabase = createAdminClient();
  let query = supabase
    .from('stock_movements_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit) as any;

  if (productId) query = query.eq('product_id', productId);
  if (since) query = query.gte('created_at', since);

  // Map UI movementType filter values to DB fields
  if (movementType) {
    if (movementType === 'entry') {
      query = query.eq('movement_type', 'entry');
    } else if (movementType === 'exit') {
      query = query.in('movement_type', ['exit', 'sale']);
    } else if (movementType === 'sale') {
      query = query.eq('movement_type', 'sale').eq('source', 'pos_sale');
    } else if (movementType === 'b2b_sale') {
      query = query.eq('movement_type', 'sale').eq('source', 'b2b_sale');
    } else if (movementType === 'shopify') {
      query = query.eq('source', 'shopify_sale');
    } else {
      query = query.eq('movement_type', movementType);
    }
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}
