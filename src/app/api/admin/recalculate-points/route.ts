import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// POST /api/admin/recalculate-points
// Recomputes loyalty_points, total_spent, and total_visits for EVERY client
// by aggregating their receipts. Safe to run multiple times (idempotent).
// Does NOT overwrite clients who have more points than their receipts total —
// it always takes the MAX of the receipt-derived total and the current DB value,
// unless ?force=true is passed, which sets the receipt-derived total absolutely.
export async function POST(req: Request) {
  const force = new URL(req.url).searchParams.get('force') === 'true';

  try {
    const supabase = createAdminClient();

    // 1. Fetch all non-cancelled receipts that have a client_id
    const { data: receipts, error: rErr } = await supabase
      .from('receipts')
      .select('client_id, loyalty_points_earned, total_amount')
      .not('client_id', 'is', null)
      .neq('status', 'cancelled');

    if (rErr) return NextResponse.json({ error: `receipts: ${rErr.message}` }, { status: 500 });

    // 2. Aggregate per client
    const map = new Map<string, { points: number; spent: number; visits: number }>();
    for (const r of receipts ?? []) {
      if (!r.client_id) continue;
      const curr = map.get(r.client_id) ?? { points: 0, spent: 0, visits: 0 };
      curr.points += Number(r.loyalty_points_earned ?? 0);
      curr.spent  += Number(r.total_amount ?? 0);
      curr.visits += 1;
      map.set(r.client_id, curr);
    }

    if (map.size === 0) {
      return NextResponse.json({ success: true, updated: 0, message: 'No receipts with client_id found' });
    }

    // 3. Fetch current client values to compare
    const clientIds = [...map.keys()];
    const { data: clients, error: cErr } = await supabase
      .from('clients')
      .select('id, loyalty_points')
      .in('id', clientIds);

    if (cErr) return NextResponse.json({ error: `clients: ${cErr.message}` }, { status: 500 });

    const currentMap = new Map((clients ?? []).map((c: any) => [c.id, c.loyalty_points ?? 0]));

    // 4. Build update list
    const updates: Array<{ id: string; loyalty_points: number; total_spent: number; total_visits: number }> = [];
    for (const [clientId, agg] of map.entries()) {
      const currentPts = currentMap.get(clientId) ?? 0;
      // Use MAX so we never reduce existing manually-added points, unless force=true
      const newPts = force ? agg.points : Math.max(currentPts, agg.points);
      updates.push({
        id: clientId,
        loyalty_points: newPts,
        total_spent: Math.round(agg.spent * 100) / 100,
        total_visits: agg.visits,
      });
    }

    // 5. Apply updates in chunks of 100 via individual PATCH calls (PostgREST bulk upsert)
    let updated = 0;
    const CHUNK = 100;
    for (let i = 0; i < updates.length; i += CHUNK) {
      const chunk = updates.slice(i, i + CHUNK);
      // upsert with onConflict='id' handles both INSERT (new clients) and UPDATE
      const { error: uErr } = await supabase
        .from('clients')
        .upsert(chunk, { onConflict: 'id' });
      if (uErr) {
        console.error('[recalculate-points] upsert chunk error:', uErr.message);
        // Continue with remaining chunks
      } else {
        updated += chunk.length;
      }
    }

    // 6. Log a transaction record for each updated client (best-effort, non-blocking)
    const txInserts = updates.map((u) => ({
      client_id: u.id,
      points_change: 0, // net change unknown without previous snapshot
      reason: 'Recalcul depuis les tickets caisse',
      balance_after: u.loyalty_points,
    }));
    for (let i = 0; i < txInserts.length; i += CHUNK) {
      await supabase.from('loyalty_transactions').insert(txInserts.slice(i, i + CHUNK));
    }

    return NextResponse.json({
      success: true,
      clientsWithReceipts: map.size,
      clientsUpdated: updated,
      force,
    });
  } catch (e: any) {
    console.error('[api/admin/recalculate-points]', e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
