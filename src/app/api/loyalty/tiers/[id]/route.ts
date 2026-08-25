import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// ─── PATCH /api/loyalty/tiers/[id] — update tier ─────────────────────────────
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const supabase = createAdminClient();
  const updateData: Record<string, unknown> = {};
  if (body.name !== undefined) updateData.name = body.name;
  if (body.pointsRequired !== undefined) updateData.points_required = body.pointsRequired;
  if (body.rewardType !== undefined) updateData.reward_type = body.rewardType;
  if (body.rewardDescription !== undefined) updateData.reward_description = body.rewardDescription;
  if (body.rewardValue !== undefined) updateData.reward_value = body.rewardValue;
  if (body.rewardProductId !== undefined) updateData.reward_product_id = body.rewardProductId;
  if (body.categoryConstraint !== undefined) updateData.category_constraint = body.categoryConstraint;
  if (body.isActive !== undefined) updateData.is_active = body.isActive;
  if (body.sortOrder !== undefined) updateData.sort_order = body.sortOrder;
  updateData.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from('loyalty_tiers')
    .update(updateData)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('[api/loyalty/tiers PATCH]', error);
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

  supabase.rpc('recalculate_client_tiers').then(({ error: rpcErr }) => {
    if (rpcErr) console.log('[loyalty/tiers PATCH] recalculate_client_tiers:', rpcErr.message);
  });

  return NextResponse.json(tier);
}

// ─── DELETE /api/loyalty/tiers/[id] ──────────────────────────────────────────
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createAdminClient();
  const { error } = await supabase.from('loyalty_tiers').delete().eq('id', id);
  if (error) {
    console.error('[api/loyalty/tiers DELETE]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
