import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// Paliers 14-20 — high-point extension (6 000 → 15 000 pts).
// Only inserts paliers whose sort_order doesn't already exist in the DB.
const EXTENDED_TIERS = [
  { sort_order: 14, name: 'Palier 14 — Éclat Royal',     points_required: 6000,  reward_type: 'discount',       reward_description: 'Remise permanente -25% sur toute la boutique',         reward_value: 25 },
  { sort_order: 15, name: 'Palier 15 — Diamant Noir',    points_required: 7000,  reward_type: 'vip_access',     reward_description: 'Accès VIP illimité + pack exclusif ambassadrice',      reward_value: 0  },
  { sort_order: 16, name: 'Palier 16 — Éternelle',       points_required: 8000,  reward_type: 'buy_one_get_one',reward_description: 'Offre 1 acheté = 1 offert — sélection premium',         reward_value: 0  },
  { sort_order: 17, name: 'Palier 17 — Mythique',        points_required: 9000,  reward_type: 'free_product',   reward_description: 'Cadeau surprise ultra-premium au choix',               reward_value: 0  },
  { sort_order: 18, name: 'Palier 18 — Transcendante',   points_required: 10000, reward_type: 'private_offer',  reward_description: 'Offre privée sur mesure — avantages ambassadrice',     reward_value: 0  },
  { sort_order: 19, name: 'Palier 19 — Suprême',         points_required: 12000, reward_type: 'discount',       reward_description: 'Remise -30% + livraison offerte permanente',           reward_value: 30 },
  { sort_order: 20, name: 'Palier 20 — LMDE Royale',     points_required: 15000, reward_type: 'private_offer',  reward_description: 'Programme ambassadrice Royale — avantages exclusifs sur mesure', reward_value: 0 },
];

// GET — preview which tiers would be added
export async function GET() {
  const supabase = createAdminClient();
  const { data: existing } = await supabase.from('loyalty_tiers').select('sort_order');
  const existingSortOrders = new Set((existing ?? []).map((t: any) => t.sort_order));
  const toAdd = EXTENDED_TIERS.filter((t) => !existingSortOrders.has(t.sort_order));
  return NextResponse.json({ to_add: toAdd.length, tiers: toAdd, existing_count: existing?.length ?? 0 });
}

// POST — insert missing tiers
export async function POST() {
  const supabase = createAdminClient();
  const { data: existing } = await supabase.from('loyalty_tiers').select('sort_order');
  const existingSortOrders = new Set((existing ?? []).map((t: any) => t.sort_order));
  const toAdd = EXTENDED_TIERS.filter((t) => !existingSortOrders.has(t.sort_order));

  if (toAdd.length === 0) {
    return NextResponse.json({ ok: true, added: 0, message: 'Tous les paliers étendus existent déjà.' });
  }

  const inserts = toAdd.map((t) => ({
    ...t,
    is_active: true,
    reward_product_id: null,
  }));

  const { data, error } = await supabase.from('loyalty_tiers').insert(inserts).select('id, name, sort_order');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, added: data?.length ?? 0, tiers: data });
}
