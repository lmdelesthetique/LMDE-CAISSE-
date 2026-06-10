import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

// GET /api/client-portal/subscription-order?subscriptionId=…&month=2026-06
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const subscriptionId = searchParams.get('subscriptionId');
  const month = searchParams.get('month');

  if (!subscriptionId || !month) {
    return NextResponse.json({ error: 'subscriptionId and month required' }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('subscription_orders')
    .select('*')
    .eq('subscription_id', subscriptionId)
    .eq('order_month', month)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ order: data ?? null });
}

// POST /api/client-portal/subscription-order  → get-or-create
export async function POST(request: Request) {
  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { subscriptionId, month, shippingCost, deadlineDate } = body;
  if (!subscriptionId || !month) {
    return NextResponse.json({ error: 'subscriptionId and month required' }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Try to find existing order first
  const { data: existing } = await supabase
    .from('subscription_orders')
    .select('*')
    .eq('subscription_id', subscriptionId)
    .eq('order_month', month)
    .maybeSingle();

  if (existing) return NextResponse.json({ order: existing });

  // Create new order
  const { data: newOrder, error } = await supabase
    .from('subscription_orders')
    .insert({
      subscription_id: subscriptionId,
      order_month: month,
      status: 'open',
      shipping_cost: shippingCost ?? 0,
      deadline_date: deadlineDate ?? null,
    })
    .select()
    .single();

  if (error) {
    // 23505 = unique_violation — concurrent insert, fetch the winner
    if (error.code === '23505') {
      const { data: recovered } = await supabase
        .from('subscription_orders')
        .select('*')
        .eq('subscription_id', subscriptionId)
        .eq('order_month', month)
        .maybeSingle();
      if (recovered) return NextResponse.json({ order: recovered });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ order: newOrder });
}
