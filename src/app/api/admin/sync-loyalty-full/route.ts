import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// POST /api/admin/sync-loyalty-full
// Full loyalty sync in one shot:
// 1. Restore points from loyalty_transactions (MAX balance ever reached per client)
// 2. Also compare with receipt-derived total and take the highest
// 3. Update existing client_loyalty_rewards to reflect current tier values
// 4. Add missing tier rewards for clients who now qualify
// Safe to run multiple times (idempotent).
export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const dryRun = searchParams.get('dry') === 'true';

  try {
    const supabase = createAdminClient();

    // ── 1. Load all data in parallel ─────────────────────────────────────────
    const [tiersRes, clientsRes, receiptsRes, txRes, rewardsRes] = await Promise.all([
      supabase.from('loyalty_tiers').select('*').eq('is_active', true).order('points_required', { ascending: true }),
      supabase.from('clients').select('id, loyalty_points').neq('is_active', false),
      supabase.from('receipts').select('client_id, loyalty_points_earned, total_amount').not('client_id', 'is', null).neq('status', 'cancelled'),
      supabase.from('loyalty_transactions').select('client_id, points_change, balance_after, created_at').order('created_at', { ascending: true }),
      supabase.from('client_loyalty_rewards').select('id, client_id, tier_id, status'),
    ]);

    if (tiersRes.error) return NextResponse.json({ error: `tiers: ${tiersRes.error.message}` }, { status: 500 });
    if (clientsRes.error) return NextResponse.json({ error: `clients: ${clientsRes.error.message}` }, { status: 500 });

    const tiers = tiersRes.data ?? [];
    const allClients = clientsRes.data ?? [];
    const receipts = receiptsRes.data ?? [];
    const txRows = txRes.data ?? [];
    const existingRewards = rewardsRes.data ?? [];

    // ── 2. Compute points per client from 3 sources ──────────────────────────

    // Source A: receipts
    const receiptMap = new Map<string, number>();
    for (const r of receipts) {
      if (!r.client_id) continue;
      receiptMap.set(r.client_id, (receiptMap.get(r.client_id) ?? 0) + Number(r.loyalty_points_earned ?? 0));
    }

    // Source B: loyalty_transactions — sum of points_change (excludes balance resets from recalculate)
    // We ignore transactions with points_change = 0 (those are just balance snapshots)
    const txSumMap = new Map<string, number>();
    // Also track the max balance_after ever seen per client (safest restore point)
    const txMaxBalMap = new Map<string, number>();
    for (const tx of txRows) {
      if (!tx.client_id) continue;
      if (tx.points_change !== 0) {
        txSumMap.set(tx.client_id, (txSumMap.get(tx.client_id) ?? 0) + Number(tx.points_change));
      }
      const bal = Number(tx.balance_after ?? 0);
      txMaxBalMap.set(tx.client_id, Math.max(txMaxBalMap.get(tx.client_id) ?? 0, bal));
    }

    // Source C: current DB value
    const currentMap = new Map(allClients.map((c) => [c.id, c.loyalty_points ?? 0]));

    // ── 3. For each client, take the highest value from all sources ──────────
    const pointsUpdates: Array<{ id: string; loyalty_points: number }> = [];
    const report: Array<{ id: string; old: number; new: number; source: string }> = [];

    for (const client of allClients) {
      const current = currentMap.get(client.id) ?? 0;
      const fromReceipts = receiptMap.get(client.id) ?? 0;
      const fromTxSum = txSumMap.get(client.id) ?? 0;
      const fromTxMax = txMaxBalMap.get(client.id) ?? 0;

      // Take the MAX of all sources to never reduce legitimate points
      const best = Math.max(current, fromReceipts, fromTxSum, fromTxMax);
      const restored = Math.max(0, best);

      if (restored !== current) {
        let source = 'recalcul';
        if (fromTxMax > current && fromTxMax >= fromReceipts && fromTxMax >= fromTxSum) source = 'transactions (max solde)';
        else if (fromTxSum > current && fromTxSum >= fromReceipts) source = 'transactions (cumul)';
        else if (fromReceipts > current) source = 'tickets caisse';
        report.push({ id: client.id, old: current, new: restored, source });
        pointsUpdates.push({ id: client.id, loyalty_points: restored });
      }
    }

    // ── 4. Apply points updates ───────────────────────────────────────────────
    let pointsRestored = 0;
    if (!dryRun && pointsUpdates.length > 0) {
      const CHUNK = 100;
      for (let i = 0; i < pointsUpdates.length; i += CHUNK) {
        const chunk = pointsUpdates.slice(i, i + CHUNK);
        const { error } = await supabase.from('clients').upsert(chunk, { onConflict: 'id' });
        if (!error) pointsRestored += chunk.length;
        else console.error('[sync-loyalty-full] points upsert error:', error.message);
      }
    }

    // ── 5. Update existing client_loyalty_rewards to match current tier values ─
    // For each existing reward row, update the description/value from the current tier
    const existingByTier = new Map<string, string[]>(); // tier_id → [reward row ids]
    for (const r of existingRewards) {
      if (!existingByTier.has(r.tier_id)) existingByTier.set(r.tier_id, []);
      existingByTier.get(r.tier_id)!.push(r.id);
    }

    let rewardsUpdated = 0;
    if (!dryRun) {
      for (const tier of tiers) {
        const rowIds = existingByTier.get(tier.id);
        if (!rowIds || rowIds.length === 0) continue;

        const CHUNK = 200;
        for (let i = 0; i < rowIds.length; i += CHUNK) {
          const batch = rowIds.slice(i, i + CHUNK);
          const { error } = await supabase
            .from('client_loyalty_rewards')
            .update({
              reward_type: tier.reward_type,
              reward_description: tier.reward_description,
              reward_value: tier.reward_value ?? 0,
              reward_product_id: tier.reward_product_id ?? null,
            })
            .in('id', batch);
          if (!error) rewardsUpdated += batch.length;
          else console.error('[sync-loyalty-full] reward update error:', error.message);
        }
      }
    }

    // ── 6. Add missing tier rewards for clients who qualify ──────────────────
    // Use the RESOLVED points (after step 3) for each client
    const resolvedPoints = new Map(allClients.map((c) => {
      const update = pointsUpdates.find((u) => u.id === c.id);
      return [c.id, update ? update.loyalty_points : (c.loyalty_points ?? 0)];
    }));

    const existingSet = new Set(existingRewards.map((r) => `${r.client_id}:${r.tier_id}`));
    const inserts: any[] = [];
    const now = new Date().toISOString();

    for (const client of allClients) {
      const points = resolvedPoints.get(client.id) ?? 0;
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

    let rewardsInserted = 0;
    if (!dryRun && inserts.length > 0) {
      const CHUNK = 500;
      for (let i = 0; i < inserts.length; i += CHUNK) {
        const { error } = await supabase.from('client_loyalty_rewards').insert(inserts.slice(i, i + CHUNK));
        if (!error) rewardsInserted += inserts.slice(i, i + CHUNK).length;
        else console.error('[sync-loyalty-full] rewards insert error:', error.message);
      }
    }

    return NextResponse.json({
      success: true,
      dryRun,
      points: {
        clientsRestored: dryRun ? report.length : pointsRestored,
        preview: dryRun ? report.slice(0, 20) : undefined,
      },
      rewards: {
        updated: dryRun ? rewardsUpdated : rewardsUpdated,
        inserted: dryRun ? inserts.length : rewardsInserted,
      },
      tiers: tiers.length,
      clientsProcessed: allClients.length,
    });
  } catch (e: any) {
    console.error('[api/admin/sync-loyalty-full]', e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
