import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

async function fetchAll<T>(
  queryFn: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }>
): Promise<T[]> {
  const PAGE = 1000;
  const all: T[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await queryFn(from, from + PAGE - 1);
    if (error || !data?.length) break;
    all.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

const REWARD_TYPE_LABELS: Record<string, string> = {
  discount: 'Réduction',
  free_product: 'Produit offert',
  double_points: 'Points doublés',
  private_offer: 'Offre privée',
  vip_access: 'Accès VIP',
  buy_one_get_one: '1 acheté = 1 offert',
  free_shipping: 'Livraison offerte',
  surprise_gift: 'Cadeau surprise',
  category_discount: 'Remise catégorie',
  gift_category_pick: 'Produit par catégorie',
};

export async function GET() {
  try {
    const supabase = createAdminClient();

    const { count: clientCount } = await supabase
      .from('clients')
      .select('*', { count: 'exact', head: true })
      .eq('is_active', true);
    const totalClients = clientCount ?? 0;

    const { data: topRaw } = await supabase
      .from('clients')
      .select('id, first_name, last_name, loyalty_points, loyalty_tier, phone')
      .eq('is_active', true)
      .order('loyalty_points', { ascending: false })
      .limit(10);

    const allPointsRows = await fetchAll<{ loyalty_points: number }>((from, to) =>
      supabase.from('clients').select('loyalty_points').eq('is_active', true).range(from, to)
    );
    const totalPointsIssued = allPointsRows.reduce((s, c) => s + (c.loyalty_points ?? 0), 0);

    const negTx = await fetchAll<{ points_change: number }>((from, to) =>
      supabase
        .from('loyalty_transactions')
        .select('points_change')
        .lt('points_change', 0)
        .range(from, to)
    );
    const totalPointsUsed = negTx.reduce((s, t) => s + Math.abs(t.points_change ?? 0), 0);

    const { data: redemptions } = await supabase
      .from('loyalty_redemptions')
      .select('*')
      .order('redeemed_at', { ascending: false })
      .limit(200);
    const allRedemptions = redemptions ?? [];

    const receiptTotals = await fetchAll<{ total_amount: number }>((from, to) =>
      supabase
        .from('receipts')
        .select('total_amount')
        .eq('payment_type', 'sale')
        .gt('total_amount', 0)
        .range(from, to)
    );
    const avgBasket = receiptTotals.length > 0
      ? receiptTotals.reduce((s, r) => s + parseFloat(String(r.total_amount ?? 0)), 0) / receiptTotals.length
      : 0;

    const topClientIds = (topRaw ?? []).map((c: any) => c.id);
    const receiptsByClient: Record<string, { total: number; count: number }> = {};
    if (topClientIds.length > 0) {
      const { data: clientReceipts } = await supabase
        .from('receipts')
        .select('client_id, total_amount')
        .in('client_id', topClientIds)
        .eq('payment_type', 'sale');
      for (const r of clientReceipts ?? []) {
        if (!r.client_id) continue;
        if (!receiptsByClient[r.client_id]) receiptsByClient[r.client_id] = { total: 0, count: 0 };
        receiptsByClient[r.client_id].total += parseFloat(String(r.total_amount ?? 0));
        receiptsByClient[r.client_id].count += 1;
      }
    }

    const topClients = (topRaw ?? []).map((c: any) => {
      const stats = receiptsByClient[c.id];
      return {
        id: c.id,
        fullName: `${c.first_name} ${c.last_name}`,
        phone: c.phone ?? null,
        loyaltyPoints: c.loyalty_points ?? 0,
        totalSpent: stats?.total ?? 0,
        totalVisits: stats?.count ?? 0,
        loyaltyTier: c.loyalty_tier || null,
      };
    });

    const rewardMap: Record<string, number> = {};
    for (const r of allRedemptions) {
      rewardMap[r.reward_type] = (rewardMap[r.reward_type] ?? 0) + 1;
    }
    const rewardBreakdown = Object.entries(rewardMap).map(([type, count]) => ({
      rewardType: type,
      count,
      label: REWARD_TYPE_LABELS[type] ?? type,
    }));

    const redemptionClientIds = [...new Set(allRedemptions.slice(0, 20).map((r: any) => r.client_id).filter(Boolean))];
    const missingIds = redemptionClientIds.filter((id) => !(topRaw ?? []).some((c: any) => c.id === id));
    const clientNameMap: Record<string, string> = {};
    for (const c of topRaw ?? []) clientNameMap[c.id] = `${c.first_name} ${c.last_name}`;
    if (missingIds.length > 0) {
      const { data: extraClients } = await supabase
        .from('clients')
        .select('id, first_name, last_name')
        .in('id', missingIds);
      for (const c of extraClients ?? []) clientNameMap[c.id] = `${c.first_name} ${c.last_name}`;
    }

    const recentRedemptions = allRedemptions.slice(0, 20).map((r: any) => ({
      id: r.id,
      clientName: clientNameMap[r.client_id] ?? 'Client inconnu',
      rewardDescription: r.reward_description,
      rewardType: r.reward_type,
      pointsAtRedemption: r.points_at_redemption,
      redeemedAt: r.redeemed_at,
      status: r.status ?? 'pending',
    }));

    return NextResponse.json({
      totalClients,
      totalPointsIssued,
      totalPointsUsed,
      totalRedemptions: allRedemptions.length,
      avgBasket,
      topClients,
      rewardBreakdown,
      recentRedemptions,
    });
  } catch (e: any) {
    console.error('[api/loyalty/dashboard-stats]', e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
