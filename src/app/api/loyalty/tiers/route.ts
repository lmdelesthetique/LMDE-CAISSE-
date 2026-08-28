import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// GET /api/loyalty/tiers — returns all tiers (bypasses RLS for POS reads)
export async function GET() {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('loyalty_tiers')
      .select('*')
      .order('points_required', { ascending: true });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(
      (data ?? []).map((t: any) => ({
        id: t.id,
        name: t.name,
        pointsRequired: t.points_required,
        rewardType: t.reward_type,
        rewardDescription: t.reward_description,
        rewardValue: parseFloat(t.reward_value ?? 0),
        rewardProductId: t.reward_product_id ?? null,
        categoryConstraint: t.category_constraint ?? null,
        isActive: t.is_active,
        sortOrder: t.sort_order ?? 0,
        createdAt: t.created_at,
        updatedAt: t.updated_at,
      }))
    );
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// POST /api/loyalty/tiers — create a new tier
export async function POST(req: NextRequest) {
  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('loyalty_tiers')
    .insert({
      name: body.name,
      points_required: body.pointsRequired,
      reward_type: body.rewardType,
      reward_description: body.rewardDescription,
      reward_value: body.rewardValue ?? 0,
      reward_product_id: body.rewardProductId ?? null,
      category_constraint: body.categoryConstraint ?? null,
      is_active: body.isActive ?? true,
      sort_order: body.sortOrder ?? 0,
    })
    .select()
    .single();

  if (error) {
    console.error('[api/loyalty/tiers POST]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const tier = {
    id: data.id,
    name: data.name,
    pointsRequired: data.points_required,
    rewardType: data.reward_type,
    rewardDescription: data.reward_description,
    rewardValue: parseFloat(data.reward_value ?? 0),
    rewardProductId: data.reward_product_id ?? null,
    categoryConstraint: data.category_constraint ?? null,
    isActive: data.is_active,
    sortOrder: data.sort_order ?? 0,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };

  // Auto-unlock this tier for clients who already qualify (fire-and-forget)
  void (async () => {
    try {
      const { data: eligible } = await supabase
        .from('clients')
        .select('id, loyalty_points')
        .gte('loyalty_points', data.points_required)
        .neq('is_active', false);
      if (!eligible || eligible.length === 0) return;
      const { data: existing } = await supabase
        .from('client_loyalty_rewards')
        .select('client_id')
        .eq('tier_id', data.id);
      const existingIds = new Set((existing ?? []).map((r: any) => r.client_id));
      const now = new Date().toISOString();
      const inserts = eligible
        .filter((c: any) => !existingIds.has(c.id))
        .map((c: any) => ({
          client_id: c.id,
          tier_id: data.id,
          reward_type: data.reward_type,
          reward_description: data.reward_description,
          reward_value: data.reward_value ?? 0,
          reward_product_id: data.reward_product_id ?? null,
          status: 'available',
          points_at_unlock: c.loyalty_points,
          unlocked_at: now,
        }));
      if (inserts.length > 0) {
        const { error: ie } = await supabase.from('client_loyalty_rewards').insert(inserts);
        if (ie) console.warn('[loyalty/tiers POST] auto-unlock error:', ie.message);
      }
    } catch (e: any) { console.warn('[loyalty/tiers POST] auto-unlock catch:', e.message); }
  })();

  return NextResponse.json(tier, { status: 201 });
}
