import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// GET /api/pos-favourites
export async function GET() {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('pos_favourites')
    .select('id, product_id, sort_order, products(name, ref, image_url, sell_price_ttc, stock, category)')
    .order('sort_order');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

// POST /api/pos-favourites — add a favourite
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body?.product_id) return NextResponse.json({ error: 'Missing product_id' }, { status: 400 });
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('pos_favourites')
    .insert({ product_id: body.product_id, sort_order: body.sort_order ?? 0 })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
