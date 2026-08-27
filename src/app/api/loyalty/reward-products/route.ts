import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// GET /api/loyalty/reward-products?category=xxx
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const category = searchParams.get('category');

  try {
    const supabase = createAdminClient();
    let q = supabase
      .from('loyalty_reward_products')
      .select('*')
      .eq('is_active', true)
      .order('product_name', { ascending: true });

    if (category) q = q.eq('reward_category', category);

    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data ?? []);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// POST /api/loyalty/reward-products — create a reward product
export async function POST(req: NextRequest) {
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('loyalty_reward_products')
      .insert({
        product_name: body.productName,
        sku: body.sku ?? null,
        description: body.description ?? null,
        stock_quantity: body.stockQuantity ?? 0,
        reward_category: body.rewardCategory ?? 'gift',
        is_active: body.isActive ?? true,
      })
      .select()
      .single();

    if (error) {
      console.error('[api/loyalty/reward-products POST]', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json(data, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
