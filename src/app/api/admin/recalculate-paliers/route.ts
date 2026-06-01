import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// POST /api/admin/recalculate-paliers
// Backfills client_loyalty_rewards for every client based on their current loyalty_points.
// Safe to call multiple times — skips tiers that already have a reward row.
export async function POST() {
  try {
    const supabase = createAdminClient();

    const [tiersRes, clientsRes] = await Promise.all([
      supabase.from('loyalty_tiers').select('*').eq('is_active', true).order('points_required', { ascending: true }),
      supabase.from('clients').select('id, loyalty_points').neq('is_active', false),
    ]);

    if (tiersRes.error) return NextResponse.json({ error: tiersRes.error.message }, { status: 500 });
    if (clientsRes.error) return NextResponse.json({ error: clientsRes.error.message }, { status: 500 });

    const tiers = tiersRes.data ?? [];
    const clients = clientsRes.data ?? [];

    if (tiers.length === 0) return NextResponse.json({ success: true, updated: 0, inserted: 0, message: 'No tiers configured' });

    // Load all existing reward rows in one query to avoid N+1
    const { data: existingAll } = await supabase
      .from('client_loyalty_rewards')
      .select('client_id, tier_id');

    const existingSet = new Set(
      (existingAll ?? []).map((r: any) => `${r.client_id}:${r.tier_id}`)
    );

    const inserts: any[] = [];
    const now = new Date().toISOString();

    for (const client of clients) {
      const points: number = client.loyalty_points ?? 0;
      for (const tier of tiers) {
        if (points >= tier.points_required && !existingSet.has(`${client.id}:${tier.id}`)) {
          inserts.push({
            client_id: client.id,
            tier_id: tier.id,
            reward_type: tier.reward_type,
            reward_description: tier.reward_description,
            reward_value: tier.reward_value ?? 0,
            reward_product_id: tier.reward_product_id ?? null,
            status: 'available',
            points_at_unlock: points,
            unlocked_at: now,
          });
        }
      }
    }

    let inserted = 0;
    if (inserts.length > 0) {
      // Batch in chunks of 500 to avoid request size limits
      for (let i = 0; i < inserts.length; i += 500) {
        const chunk = inserts.slice(i, i + 500);
        await supabase.from('client_loyalty_rewards').insert(chunk);
        inserted += chunk.length;
      }
    }

    return NextResponse.json({
      success: true,
      clientsProcessed: clients.length,
      tiersChecked: tiers.length,
      rewardsInserted: inserted,
    });
  } catch (e: any) {
    console.error('[api/admin/recalculate-paliers]', e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
