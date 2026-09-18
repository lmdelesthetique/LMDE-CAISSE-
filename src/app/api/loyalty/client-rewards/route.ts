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
    let tiers = tiersRes.data ?? [];
    const existing = existingRes.data ?? [];

    // If no tiers exist at all, seed the full 20-tier programme
    if (tiers.length === 0 && !tiersRes.error) {
      const defaultTiers = [
        { name: 'Palier 1 — Bienvenue',       points_required: 100,  reward_type: 'discount',       reward_description: 'Réduction -5% sur votre prochain achat',                        reward_value: 5,  sort_order: 1 },
        { name: 'Palier 2 — Fidèle',          points_required: 200,  reward_type: 'free_product',   reward_description: 'Produit surprise offert',                                       reward_value: 0,  sort_order: 2 },
        { name: 'Palier 3 — Régulière',       points_required: 320,  reward_type: 'double_points',  reward_description: 'Points doublés sur votre prochain achat',                       reward_value: 0,  sort_order: 3 },
        { name: 'Palier 4 — Privilège',       points_required: 420,  reward_type: 'discount',       reward_description: 'Réduction -10% sur toute la boutique',                         reward_value: 10, sort_order: 4 },
        { name: 'Palier 5 — Or',              points_required: 500,  reward_type: 'free_product',   reward_description: 'Ancienne collection offerte au choix',                          reward_value: 0,  sort_order: 5 },
        { name: 'Palier 6 — Prestige',        points_required: 650,  reward_type: 'private_offer',  reward_description: 'Offre privée exclusive — accès avant tout le monde',            reward_value: 0,  sort_order: 6 },
        { name: 'Palier 7 — VIP',             points_required: 700,  reward_type: 'vip_access',     reward_description: 'Accès offre VIP — pack fidélité premium',                      reward_value: 0,  sort_order: 7 },
        { name: 'Palier 8 — Diamant',         points_required: 1000, reward_type: 'free_product',   reward_description: 'Cadeau surprise premium',                                      reward_value: 0,  sort_order: 8 },
        { name: 'Palier 9 — Elite',           points_required: 1050, reward_type: 'discount',       reward_description: 'Remise catégorie spéciale -15%',                               reward_value: 15, sort_order: 9 },
        { name: 'Palier 10 — Légende',        points_required: 1500, reward_type: 'buy_one_get_one',reward_description: 'Offre 1 acheté = 1 offert sur sélection',                      reward_value: 0,  sort_order: 10 },
        { name: 'Palier 11 — Ambassadrice',   points_required: 2000, reward_type: 'free_shipping',  reward_description: 'Livraison offerte + pack fidélité exclusif',                   reward_value: 0,  sort_order: 11 },
        { name: 'Palier 12 — Icône',          points_required: 3000, reward_type: 'vip_access',     reward_description: 'Accès VIP illimité + remise permanente -20%',                 reward_value: 20, sort_order: 12 },
        { name: 'Palier 13 — Légende Ultime', points_required: 5000, reward_type: 'private_offer',  reward_description: 'Programme ambassadrice — avantages sur mesure',                reward_value: 0,  sort_order: 13 },
        { name: 'Palier 14 — Éclat Royal',    points_required: 6000, reward_type: 'discount',       reward_description: 'Remise permanente -25% sur toute la boutique',                 reward_value: 25, sort_order: 14 },
        { name: 'Palier 15 — Diamant Noir',   points_required: 7000, reward_type: 'vip_access',     reward_description: 'Accès VIP illimité + pack exclusif ambassadrice',              reward_value: 0,  sort_order: 15 },
        { name: 'Palier 16 — Éternelle',      points_required: 8000, reward_type: 'buy_one_get_one',reward_description: 'Offre 1 acheté = 1 offert — sélection premium',                reward_value: 0,  sort_order: 16 },
        { name: 'Palier 17 — Mythique',       points_required: 9000, reward_type: 'free_product',   reward_description: 'Cadeau surprise ultra-premium au choix',                       reward_value: 0,  sort_order: 17 },
        { name: 'Palier 18 — Transcendante',  points_required: 10000,reward_type: 'private_offer',  reward_description: 'Offre privée sur mesure — avantages ambassadrice',             reward_value: 0,  sort_order: 18 },
        { name: 'Palier 19 — Suprême',        points_required: 12000,reward_type: 'discount',       reward_description: 'Remise -30% + livraison offerte permanente',                   reward_value: 30, sort_order: 19 },
        { name: 'Palier 20 — LMDE Royale',    points_required: 15000,reward_type: 'private_offer',  reward_description: 'Programme ambassadrice Royale — avantages exclusifs sur mesure',reward_value: 0,  sort_order: 20 },
      ];
      const { data: seeded } = await supabase.from('loyalty_tiers').insert(defaultTiers).select('*');
      if (seeded && seeded.length > 0) tiers = seeded;
    }

    // Only unlock a tier if the client qualifies AND has NO row at all for that tier
    // (any status — available, used, cancelled). A used reward must not be auto-recreated;
    // re-earning requires the client's points to dip below the threshold and come back up,
    // which is handled by the POS detectUnlockedTiers flow during an actual purchase.
    const existingTierIds = new Set(
      existing.map((r: any) => r.tier_id).filter(Boolean)
    );
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

    // Build a map of current tier thresholds
    const tierThresholdMap = new Map(tiers.map((t: any) => [t.id, t.points_required]));
    const now = new Date().toISOString();

    // Auto-cancel 'available' rewards where client no longer meets the threshold,
    // and delete extra duplicate 'available' rows per tier (keep only the most recent).
    const toCancel: string[] = [];
    const toDelete: string[] = [];
    const seenAvailableTier = new Map<string, string>(); // tier_id → reward id (most recent kept)

    for (const r of existing) {
      if (r.status !== 'available') continue;
      if (r.expiry_date && r.expiry_date <= now) continue; // let expiry handle itself

      if (r.tier_id) {
        const threshold = tierThresholdMap.get(r.tier_id);
        if (threshold !== undefined && points < threshold) {
          // Client no longer qualifies for this tier
          toCancel.push(r.id);
          continue;
        }
        // Deduplicate: if we already have an available row for this tier, delete the extra
        if (seenAvailableTier.has(r.tier_id)) {
          toDelete.push(r.id);
        } else {
          seenAvailableTier.set(r.tier_id, r.id);
        }
      }
    }

    // Apply inline cleanup (fire-and-forget, don't block response on errors)
    if (toCancel.length > 0) {
      supabase.from('client_loyalty_rewards')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .in('id', toCancel)
        .then(() => {});
    }
    if (toDelete.length > 0) {
      supabase.from('client_loyalty_rewards')
        .delete()
        .in('id', toDelete)
        .then(() => {});
    }

    // Build final available list: exclude cancelled/deleted rows
    const cancelledOrDeleted = new Set([...toCancel, ...toDelete]);
    const available = existing.filter((r: any) => {
      if (cancelledOrDeleted.has(r.id)) return false;
      if (r.status !== 'available') return false;
      if (r.expiry_date && r.expiry_date <= now) return false;
      if (r.tier_id && tierThresholdMap.has(r.tier_id) && points < tierThresholdMap.get(r.tier_id)) return false;
      return true;
    });

    // Build corrected 'all' (exclude inline-deleted rows, update cancelled ones)
    const all = existing
      .filter((r: any) => !toDelete.includes(r.id))
      .map((r: any) => toCancel.includes(r.id) ? { ...r, status: 'cancelled' } : r);

    return NextResponse.json({ available, all });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// POST /api/loyalty/client-rewards — unlock a reward for a client
export async function POST(req: NextRequest) {
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { clientId, tierId, rewardType, rewardDescription, rewardValue, rewardProductId, pointsAtUnlock, expiryDays } = body ?? {};
  if (!clientId || !rewardType) return NextResponse.json({ error: 'clientId and rewardType required' }, { status: 400 });

  try {
    const supabase = createAdminClient();

    // Idempotency: if a row already exists for this tier+client (any status), return it
    if (tierId) {
      const { data: existing } = await supabase
        .from('client_loyalty_rewards')
        .select('*')
        .eq('client_id', clientId)
        .eq('tier_id', tierId)
        .order('unlocked_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (existing) return NextResponse.json(existing, { status: 200 });
    }

    const expiryDate = expiryDays
      ? new Date(Date.now() + Number(expiryDays) * 24 * 60 * 60 * 1000).toISOString()
      : null;

    const { data, error } = await supabase
      .from('client_loyalty_rewards')
      .insert({
        client_id: clientId,
        tier_id: tierId ?? null,
        reward_type: rewardType,
        reward_description: rewardDescription,
        reward_value: rewardValue ?? 0,
        reward_product_id: rewardProductId ?? null,
        status: 'available',
        points_at_unlock: pointsAtUnlock ?? 0,
        unlocked_at: new Date().toISOString(),
        expiry_date: expiryDate,
      })
      .select()
      .single();

    if (error) {
      console.error('[api/loyalty/client-rewards POST]', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json(data, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// PATCH /api/loyalty/client-rewards — use or cancel a reward
export async function PATCH(req: NextRequest) {
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { rewardId, action, ticketRef, cashierName, notes } = body ?? {};
  if (!rewardId || !action) return NextResponse.json({ error: 'rewardId and action required' }, { status: 400 });

  try {
    const supabase = createAdminClient();

    if (action === 'use') {
      const { data, error } = await supabase
        .from('client_loyalty_rewards')
        .update({
          status: 'used',
          used_at: new Date().toISOString(),
          ticket_ref: ticketRef ?? null,
          cashier_name: cashierName ?? null,
          notes: notes ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', rewardId)
        .eq('status', 'available')
        .select()
        .single();

      if (error) {
        console.error('[api/loyalty/client-rewards PATCH use]', error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json(data);
    }

    if (action === 'cancel') {
      const { data, error } = await supabase
        .from('client_loyalty_rewards')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('id', rewardId)
        .select()
        .single();

      if (error) {
        console.error('[api/loyalty/client-rewards PATCH cancel]', error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json(data);
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
