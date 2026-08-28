import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// POST /api/admin/recalculate-points
// Recomputes loyalty_points, total_spent, and total_visits for EVERY client
// from both receipts AND client_purchases (old system). Takes MAX to never reduce points.
// force=true: sets receipt-derived total absolutely (dangerous — avoid in production).
export async function POST(req: Request) {
  const force = new URL(req.url).searchParams.get('force') === 'true';

  try {
    const supabase = createAdminClient();

    // 1. Fetch from both receipts (new) and client_purchases (old) in parallel
    const [receiptsRes, purchasesRes] = await Promise.all([
      supabase
        .from('receipts')
        .select('client_id, loyalty_points_earned, total_amount')
        .not('client_id', 'is', null)
        .neq('status', 'cancelled'),
      supabase
        .from('client_purchases')
        .select('client_id, loyalty_points_earned, total_ttc')
        .not('client_id', 'is', null),
    ]);

    if (receiptsRes.error) return NextResponse.json({ error: `receipts: ${receiptsRes.error.message}` }, { status: 500 });

    // 2. Aggregate per client (merge both sources)
    const map = new Map<string, { points: number; spent: number; visits: number }>();

    for (const r of receiptsRes.data ?? []) {
      if (!r.client_id) continue;
      const curr = map.get(r.client_id) ?? { points: 0, spent: 0, visits: 0 };
      curr.points += Number(r.loyalty_points_earned ?? 0);
      curr.spent  += Number(r.total_amount ?? 0);
      curr.visits += 1;
      map.set(r.client_id, curr);
    }

    // Merge client_purchases — only add if receipt data is absent or lower
    for (const p of purchasesRes.data ?? []) {
      if (!p.client_id) continue;
      const curr = map.get(p.client_id) ?? { points: 0, spent: 0, visits: 0 };
      // Only add purchases data if this client has no receipt-based records
      // to avoid double-counting when both tables exist for the same client
      const hasReceiptData = (receiptsRes.data ?? []).some(r => r.client_id === p.client_id);
      if (!hasReceiptData) {
        curr.points += Number(p.loyalty_points_earned ?? 0);
        curr.spent  += Number(p.total_ttc ?? 0);
        curr.visits += 1;
        map.set(p.client_id, curr);
      }
    }

    if (map.size === 0) {
      return NextResponse.json({ success: true, updated: 0, message: 'No receipts or purchases with client_id found' });
    }

    // 3. Fetch current client values to compare
    const clientIds = [...map.keys()];
    const { data: clients, error: cErr } = await supabase
      .from('clients')
      .select('id, loyalty_points')
      .in('id', clientIds);

    if (cErr) return NextResponse.json({ error: `clients: ${cErr.message}` }, { status: 500 });

    const currentMap = new Map((clients ?? []).map((c: any) => [c.id, c.loyalty_points ?? 0]));

    // 4. Build update list — always take MAX to never reduce legitimate points
    const updates: Array<{ id: string; loyalty_points: number; total_spent: number; total_visits: number }> = [];
    for (const [clientId, agg] of map.entries()) {
      const currentPts = currentMap.get(clientId) ?? 0;
      const newPts = force ? agg.points : Math.max(currentPts, agg.points);
      updates.push({
        id: clientId,
        loyalty_points: newPts,
        total_spent: Math.round(agg.spent * 100) / 100,
        total_visits: agg.visits,
      });
    }

    // 5. Apply updates in chunks
    let updated = 0;
    const CHUNK = 100;
    for (let i = 0; i < updates.length; i += CHUNK) {
      const chunk = updates.slice(i, i + CHUNK);
      const { error: uErr } = await supabase.from('clients').upsert(chunk, { onConflict: 'id' });
      if (uErr) console.error('[recalculate-points] upsert chunk error:', uErr.message);
      else updated += chunk.length;
    }

    return NextResponse.json({ success: true, clientsWithReceipts: map.size, clientsUpdated: updated, force });
  } catch (e: any) {
    console.error('[api/admin/recalculate-points]', e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
