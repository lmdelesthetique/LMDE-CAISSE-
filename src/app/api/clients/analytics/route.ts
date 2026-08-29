import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { fetchAll } from '@/lib/utils/fetchAll';

const DAY_MS = 86_400_000;

function rfmSegment(daysSince: number, visits: number, spent: number): string {
  if (daysSince > 180) return 'perdue';
  if (daysSince > 90)  return 'a_risque';
  if (daysSince <= 30 && visits >= 7 && spent >= 400) return 'championne';
  if (daysSince <= 60 && visits >= 3 && spent >= 100) return 'fidele';
  if (daysSince <= 45 && visits <= 2) return 'nouvelle';
  return 'occasionnelle';
}

export async function GET() {
  try {
    const supabase = createAdminClient();

    // ── 1. All active clients ─────────────────────────────────────────────────
    const clients = await fetchAll<any>((from, to) =>
      supabase
        .from('clients')
        .select('id, first_name, last_name, email, phone, whatsapp, city, country, client_type, loyalty_points, loyalty_tier, total_spent, total_visits, last_purchase_at, balance_due, created_at, is_active, is_demo')
        .neq('is_active', false)
        .range(from, to)
    );

    // ── 2. Receipts last 12 months → category preference per client ───────────
    const since = new Date(Date.now() - 365 * DAY_MS).toISOString();
    const receipts = await fetchAll<any>((from, to) =>
      supabase
        .from('receipts')
        .select('client_id, items, total_amount, created_at')
        .not('client_id', 'is', null)
        .eq('status', 'completed')
        .gte('created_at', since)
        .range(from, to)
    );

    // Build per-client category revenue map
    const catByClient = new Map<string, Record<string, number>>();
    const monthlyByClient = new Map<string, Record<string, number>>(); // YYYY-MM → revenue
    for (const r of receipts) {
      if (!r.client_id) continue;
      const items = Array.isArray(r.items) ? r.items : [];
      // category map
      if (!catByClient.has(r.client_id)) catByClient.set(r.client_id, {});
      const cm = catByClient.get(r.client_id)!;

      const rawTotal = items.reduce((s: number, i: any) => {
        const qty = Number(i?.qty ?? i?.quantity ?? 1);
        return s + (Number(i?.total ?? 0) || Number(i?.price ?? 0) * qty);
      }, 0);
      const receiptTotal = parseFloat(r.total_amount ?? 0);
      const scale = rawTotal > 0 ? receiptTotal / rawTotal : 1;

      for (const item of items) {
        const cat = item?.category || 'Non catégorisé';
        const qty = Number(item?.qty ?? item?.quantity ?? 1);
        const lineRaw = Number(item?.total ?? 0) || Number(item?.price ?? 0) * qty;
        cm[cat] = (cm[cat] ?? 0) + lineRaw * scale;
      }
      if (items.length === 0 && receiptTotal > 0) {
        cm['Non ventilé'] = (cm['Non ventilé'] ?? 0) + receiptTotal;
      }

      // monthly trend
      if (!monthlyByClient.has(r.client_id)) monthlyByClient.set(r.client_id, {});
      const mm = monthlyByClient.get(r.client_id)!;
      const month = r.created_at?.slice(0, 7) ?? '';
      if (month) mm[month] = (mm[month] ?? 0) + receiptTotal;
    }

    // ── 3. Process each client ───────────────────────────────────────────────
    const now = Date.now();

    const processed = clients
      .filter((c: any) => !c.is_demo && c.first_name)
      .map((c: any) => {
        const lastTs = c.last_purchase_at ? new Date(c.last_purchase_at).getTime() : 0;
        const daysSince = lastTs ? Math.floor((now - lastTs) / DAY_MS) : 999;
        const spent = parseFloat(c.total_spent ?? 0);
        const visits = c.total_visits ?? 0;
        const cats = catByClient.get(c.id) ?? {};
        const topCat = Object.entries(cats).sort(([, a], [, b]) => (b as number) - (a as number))[0]?.[0] ?? null;
        const segment = rfmSegment(daysSince, visits, spent);

        return {
          id: c.id,
          firstName: c.first_name,
          lastName: c.last_name,
          email: c.email ?? null,
          phone: c.phone ?? null,
          whatsapp: c.whatsapp ?? null,
          city: c.city ?? null,
          country: c.country ?? null,
          clientType: c.client_type ?? 'particulier',
          loyaltyPoints: c.loyalty_points ?? 0,
          loyaltyTier: c.loyalty_tier ?? 'bronze',
          totalSpent: Math.round(spent * 100) / 100,
          totalVisits: visits,
          avgBasket: visits > 0 ? Math.round((spent / visits) * 100) / 100 : 0,
          lastPurchaseAt: c.last_purchase_at ?? null,
          daysSincePurchase: daysSince,
          balanceDue: parseFloat(c.balance_due ?? 0),
          createdAt: c.created_at,
          segment,
          topCategory: topCat,
          categoryRevenue: cats,
        };
      });

    // ── 4. Aggregations ──────────────────────────────────────────────────────
    const segCounts: Record<string, number> = {};
    const typeCounts: Record<string, number> = {};
    const cityRev: Record<string, number> = {};
    const catRev: Record<string, number> = {};

    for (const c of processed) {
      segCounts[c.segment] = (segCounts[c.segment] ?? 0) + 1;
      typeCounts[c.clientType] = (typeCounts[c.clientType] ?? 0) + 1;
      if (c.city) cityRev[c.city] = (cityRev[c.city] ?? 0) + c.totalSpent;
      for (const [cat, rev] of Object.entries(c.categoryRevenue)) {
        catRev[cat] = (catRev[cat] ?? 0) + (rev as number);
      }
    }

    const activeClients = processed.filter((c) => c.daysSincePurchase <= 90).length;
    const withPurchase = processed.filter((c) => c.totalVisits > 0);
    const totalRevenue = processed.reduce((s, c) => s + c.totalSpent, 0);
    const avgSpent = withPurchase.length > 0 ? totalRevenue / withPurchase.length : 0;

    return NextResponse.json({
      clients: processed,
      stats: {
        total: processed.length,
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        avgSpentPerClient: Math.round(avgSpent * 100) / 100,
        activeClients,
        withBalanceDue: processed.filter((c) => c.balanceDue > 0).length,
      },
      segments: segCounts,
      clientTypes: typeCounts,
      topCities: Object.entries(cityRev)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 8)
        .map(([city, revenue]) => ({ city, revenue: Math.round(revenue * 100) / 100 })),
      topCategories: Object.entries(catRev)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 12)
        .map(([name, revenue]) => ({ name, revenue: Math.round(revenue * 100) / 100 })),
    });
  } catch (e: any) {
    console.error('[api/clients/analytics]', e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
