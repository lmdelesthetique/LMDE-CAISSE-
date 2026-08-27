import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// GET /api/loyalty/redemptions?limit=50&clientId=xxx
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const limit = parseInt(searchParams.get('limit') ?? '50', 10);
  const clientId = searchParams.get('clientId');

  try {
    const supabase = createAdminClient();
    let q = supabase
      .from('loyalty_redemptions')
      .select('*')
      .order('redeemed_at', { ascending: false })
      .limit(limit);

    if (clientId) q = q.eq('client_id', clientId);

    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data ?? []);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// POST /api/loyalty/redemptions — create a redemption record
export async function POST(req: NextRequest) {
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { clientId, tierId, pointsAtRedemption, rewardType, rewardDescription, rewardValue, rewardProductId, cashierName, notes } = body ?? {};
  if (!clientId || !rewardType) return NextResponse.json({ error: 'clientId and rewardType required' }, { status: 400 });

  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('loyalty_redemptions')
      .insert({
        client_id: clientId,
        tier_id: tierId ?? null,
        points_at_redemption: pointsAtRedemption ?? 0,
        reward_type: rewardType,
        reward_description: rewardDescription,
        reward_value: rewardValue ?? 0,
        reward_product_id: rewardProductId ?? null,
        status: 'pending',
        cashier_name: cashierName ?? null,
        notes: notes ?? null,
      })
      .select()
      .single();

    if (error) {
      console.error('[api/loyalty/redemptions POST]', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json(data, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
