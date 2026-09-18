import { NextRequest, NextResponse } from 'next/server';
import { requireAdminSecret } from '@/lib/utils/adminGuard';
import { createAdminClient } from '@/lib/supabase/admin';

// POST /api/admin/cleanup-loyalty-duplicates
// Fixes the loyalty reward accumulation bug:
// 1. Removes duplicate rewards per (client, tier) — keeps only ONE per tier per client
// 2. Cancels 'available' rewards for tiers the client no longer qualifies for
// 3. Removes rewards with null tier_id that don't correspond to any active tier
// Safe to run multiple times.
export async function POST(req: NextRequest) {
  const denied = requireAdminSecret(req);
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const dryRun = searchParams.get('dry') === 'true';

  try {
    const supabase = createAdminClient();

    const [tiersRes, rewardsRes, clientsRes] = await Promise.all([
      supabase.from('loyalty_tiers').select('id, points_required').eq('is_active', true),
      supabase.from('client_loyalty_rewards').select('id, client_id, tier_id, status, unlocked_at, points_at_unlock'),
      supabase.from('clients').select('id, loyalty_points').neq('is_active', false),
    ]);

    if (tiersRes.error) return NextResponse.json({ error: tiersRes.error.message }, { status: 500 });

    const tiers = tiersRes.data ?? [];
    const rewards = rewardsRes.data ?? [];
    const clients = clientsRes.data ?? [];

    const tierThresholds = new Map(tiers.map((t) => [t.id, t.points_required]));
    const clientPoints = new Map(clients.map((c) => [c.id, c.loyalty_points ?? 0]));
    const activeTierIds = new Set(tiers.map((t) => t.id));

    const toDelete: string[] = [];
    const toCancel: string[] = [];

    // Group rewards by (client_id, tier_id)
    const grouped = new Map<string, typeof rewards>();
    for (const r of rewards) {
      if (!r.tier_id) continue; // handle null tier_ids separately
      const key = `${r.client_id}:${r.tier_id}`;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(r);
    }

    // For each (client, tier) group, keep only ONE row (prefer 'available', then most recent 'used')
    for (const [, rows] of grouped) {
      if (rows.length <= 1) continue;

      // Sort: available first, then by unlocked_at desc
      rows.sort((a, b) => {
        if (a.status === 'available' && b.status !== 'available') return -1;
        if (b.status === 'available' && a.status !== 'available') return 1;
        return new Date(b.unlocked_at).getTime() - new Date(a.unlocked_at).getTime();
      });

      // Keep the first (best), delete the rest
      for (let i = 1; i < rows.length; i++) {
        toDelete.push(rows[i].id);
      }
    }

    // Cancel 'available' rewards for tiers the client no longer qualifies for
    // (tier threshold was raised after reward was created, or client had more points before)
    for (const r of rewards) {
      if (toDelete.includes(r.id)) continue; // already marked for deletion
      if (r.status !== 'available') continue;
      if (!r.tier_id) continue;

      const threshold = tierThresholds.get(r.tier_id);
      const points = clientPoints.get(r.client_id) ?? 0;

      // Hide reward if tier doesn't exist or client doesn't qualify
      if (threshold === undefined || points < threshold) {
        toCancel.push(r.id);
      }
    }

    // Delete null-tier_id rewards that are 'available' — they're orphaned
    // (created before tier tracking was added; can't validate them)
    const nullTierOrphans = rewards.filter(
      (r) => !r.tier_id && r.status === 'available'
    );
    for (const r of nullTierOrphans) {
      toCancel.push(r.id);
    }

    let deleted = 0;
    let cancelled = 0;

    if (!dryRun) {
      // Delete duplicates in batches
      const CHUNK = 200;
      for (let i = 0; i < toDelete.length; i += CHUNK) {
        const batch = toDelete.slice(i, i + CHUNK);
        const { error } = await supabase.from('client_loyalty_rewards').delete().in('id', batch);
        if (!error) deleted += batch.length;
        else console.error('[cleanup-loyalty-duplicates] delete error:', error.message);
      }

      // Cancel invalid rewards
      for (let i = 0; i < toCancel.length; i += CHUNK) {
        const batch = toCancel.slice(i, i + CHUNK);
        const { error } = await supabase
          .from('client_loyalty_rewards')
          .update({ status: 'cancelled', updated_at: new Date().toISOString() })
          .in('id', batch);
        if (!error) cancelled += batch.length;
        else console.error('[cleanup-loyalty-duplicates] cancel error:', error.message);
      }
    }

    return NextResponse.json({
      success: true,
      dryRun,
      duplicatesRemoved: dryRun ? toDelete.length : deleted,
      invalidCancelled: dryRun ? toCancel.length : cancelled,
      totalRewardsChecked: rewards.length,
      preview: dryRun ? {
        toDelete: toDelete.slice(0, 20),
        toCancel: toCancel.slice(0, 20),
      } : undefined,
    });
  } catch (e: any) {
    console.error('[api/admin/cleanup-loyalty-duplicates]', e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
