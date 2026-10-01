import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// GET /api/stock/movements?productId=xxx&limit=50
export async function GET(req: NextRequest) {
  const productId = req.nextUrl.searchParams.get('productId');
  const limit = Math.min(parseInt(req.nextUrl.searchParams.get('limit') ?? '50'), 500);

  const supabase = createAdminClient();
  let query = supabase
    .from('stock_movements_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (productId) query = query.eq('product_id', productId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}
