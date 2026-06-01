import { NextResponse } from 'next/server';
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
