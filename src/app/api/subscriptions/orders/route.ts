import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// POST /api/subscriptions/orders — create a subscription order
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body?.subscription_id) return NextResponse.json({ error: 'subscription_id required' }, { status: 400 });
  const supabase = createAdminClient();
  const { data, error } = await supabase.from('subscription_orders').insert(body).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
