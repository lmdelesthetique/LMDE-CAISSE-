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

    // If no tiers exist at all, seed the default 13-tier programme
    if (tiers.length === 0 && !tiersRes.error) {
      const defaultTiers = [
        { name: 'Palier 1 — Bienvenue',       points_required: 100,  reward_type: 'discount',       reward_description: 'Réduction -5% sur votre prochain achat',            reward_value: 5,  sort_order: 1 },
        { name: 'Palier 2 — Fidèle',          points_required: 200,  reward_type: 'free_product',   reward_description: 'Produit surprise offert',                           reward_value: 0,  sort_order: 2 },
        { name: 'Palier 3 — Régulière',       points_required: 320,  reward_type: 'double_points',  reward_description: 'Points doublés sur votre prochain achat',           reward_value: 0,  sort_order: 3 },
        { name: 'Palier 4 — Privilège',       points_required: 420,  reward_type: 'discount',       reward_description: 'Réduction -10% sur toute la boutique',             reward_value: 10, sort_order: 4 },
        { name: 'Palier 5 — Or',              points_required: 500,  reward_type: 'free_product',   reward_description: 'Ancienne collection offerte au choix',              reward_value: 0,  sort_order: 5 },
        { name: 'Palier 6 — Prestige',        points_required: 650,  reward_type: 'private_offer',  reward_description: 'Offre privée exclusive — accès avant tout le monde', reward_value: 0,  sort_order: 6 },
        { name: 'Palier 7 — VIP',             points_required: 700,  reward_type: 'vip_access',     reward_description: 'Accès offre VIP — pack fidélité premium',           reward_value: 0,  sort_order: 7 },
        { name: 'Palier 8 — Diamant',         points_required: 1000, reward_type: 'free_product',   reward_description: 'Cadeau surprise premium',                           reward_value: 0,  sort_order: 8 },
        { name: 'Palier 9 — Elite',           points_required: 1050, reward_type: 'discount',       reward_description: 'Remise catégorie spéciale -15%',                   reward_value: 15, sort_order: 9 },
        { name: 'Palier 10 — Légende',        points_required: 1500, reward_type: 'buy_one_get_one',reward_description: 'Offre 1 acheté = 1 offert sur sélection',           reward_value: 0,  sort_order: 10 },
        { name: 'Palier 11 — Ambassadrice',   points_required: 2000, reward_type: 'free_shipping',  reward_description: 'Livraison offerte + pack fidélité exclusif',        reward_value: 0,  sort_order: 11 },
        { name: 'Palier 12 — Icône',          points_required: 3000, reward_type: 'vip_access',     reward_description: 'Accès VIP illimité + remise permanente -20%',      reward_value: 20, sort_order: 12 },
        { name: 'Palier 13 — Légende Ultime', points_required: 5000, reward_type: 'private_offer',  reward_description: 'Programme ambassadrice — avantages sur mesure',     reward_value: 0,  sort_order: 13 },
      ];
      const { data: seeded } = await supabase.from('loyalty_tiers').insert(defaultTiers).select('*');
      if (seeded && seeded.length > 0) tiers = seeded;
    }

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
