import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// GET /api/loyalty/client-rewards?clientId=xxx
// Returns available rewards, auto-backfilling any tiers the client
// qualifies for but has never had a reward record created.
export async function GET(req: NextRequest) {
  const clientId = new URL(req.url).searchParams.get('clientId');
  if (!clientId) return NextResponse.json({ error: 'clientId required' }, { status: 400 });

  try {
    const supabase = createAdminClient();

    // Load client points, all active tiers, and existing reward rows in parallel
    const [clientRes, tiersRes, existingRes] = await Promise.all([
      supabase.from('clients').select('loyalty_points').eq('id', clientId).single(),
      supabase.from('loyalty_tiers').select('*').eq('is_active', true).order('points_required', { ascending: true }),
      supabase.from('client_loyalty_rewards').select('*').eq('client_id', clientId),
    ]);

    if (clientRes.error) return NextResponse.json({ error: clientRes.error.message }, { status: 500 });

    const points: number = clientRes.data?.loyalty_points ?? 0;
    const tiers = tiersRes.data ?? [];
    const existing = existingRes.data ?? [];

    // Determine which tiers the client has earned but have no record yet
    const existingTierIds = new Set(existing.map((r: any) => r.tier_id).filter(Boolean));
    const tiersToUnlock = tiers.filter(
      (t: any) => points >= t.points_required && !existingTierIds.has(t.id)
    );

    // Insert missing reward rows
    if (tiersToUnlock.length > 0) {
      const inserts = tiersToUnlock.map((t: any) => ({
        client_id: clientId,
        tier_id: t.id,
        reward_type: t.reward_type,
        reward_description: t.reward_description,
        reward_value: t.reward_value ?? 0,
        reward_product_id: t.reward_product_id ?? null,
        status: 'available',
        points_at_unlock: points,
        unlocked_at: new Date().toISOString(),
      }));
      await supabase.from('client_loyalty_rewards').insert(inserts);
      // Re-fetch after insert
      const refreshed = await supabase
        .from('client_loyalty_rewards')
        .select('*')
        .eq('client_id', clientId);
      existing.splice(0, existing.length, ...(refreshed.data ?? []));
    }

    // Return only available (non-expired) rewards
    const now = new Date().toISOString();
    const available = existing.filter(
      (r: any) => r.status === 'available' && (!r.expiry_date || r.expiry_date > now)
    );

    return NextResponse.json({ available, all: existing });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
