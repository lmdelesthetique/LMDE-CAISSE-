import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// POST /api/admin/fix-client-totals
// 1. Backfills client_id on receipts that only have client_name (no client_id)
//    by matching the receipt's client_name against each client's last_name.
// 2. Recalculates total_spent and total_visits for every client from receipts.
export async function POST() {
  try {
    const supabase = createAdminClient();

    // Load all clients and all receipts with missing client_id in parallel
    const [clientsRes, orphanReceiptsRes] = await Promise.all([
      supabase.from('clients').select('id, first_name, last_name'),
      supabase
        .from('receipts')
        .select('id, client_name')
        .is('client_id', null)
        .not('client_name', 'is', null)
        .neq('client_name', '')
        .neq('status', 'cancelled')
        .limit(50000),
    ]);

    if (clientsRes.error) return NextResponse.json({ error: clientsRes.error.message }, { status: 500 });

    const clients: Array<{ id: string; first_name: string | null; last_name: string | null }> = clientsRes.data ?? [];
    const orphans: Array<{ id: string; client_name: string }> = orphanReceiptsRes.data ?? [];

    // Build a normalized last_name → client_id map (case-insensitive)
    const lastNameMap = new Map<string, string>();
    for (const c of clients) {
      if (c.last_name) lastNameMap.set(c.last_name.trim().toLowerCase(), c.id);
    }

    // Match each orphan receipt to a client by last_name substring
    const patchGroups = new Map<string, string[]>(); // clientId → receipt ids
    for (const r of orphans) {
      const name = (r.client_name ?? '').trim().toLowerCase();
      if (!name) continue;
      for (const [lastName, clientId] of lastNameMap.entries()) {
        if (name.includes(lastName) && lastName.length >= 3) {
          if (!patchGroups.has(clientId)) patchGroups.set(clientId, []);
          patchGroups.get(clientId)!.push(r.id);
          break;
        }
      }
    }

    // Backfill client_id in batches of 200
    let backfilled = 0;
    for (const [clientId, ids] of patchGroups.entries()) {
      for (let i = 0; i < ids.length; i += 200) {
        const chunk = ids.slice(i, i + 200);
        const { error } = await supabase
          .from('receipts')
          .update({ client_id: clientId })
          .in('id', chunk)
          .is('client_id', null); // safety: only update rows still missing client_id
        if (!error) backfilled += chunk.length;
      }
    }

    // Now recalculate total_spent and total_visits for ALL clients from receipts
    const { data: allReceipts, error: rcErr } = await supabase
      .from('receipts')
      .select('client_id, total_amount')
      .not('client_id', 'is', null)
      .neq('status', 'cancelled')
      .limit(200000);

    if (rcErr) return NextResponse.json({ error: rcErr.message }, { status: 500 });

    const aggMap = new Map<string, { spent: number; visits: number }>();
    for (const r of allReceipts ?? []) {
      if (!r.client_id) continue;
      const curr = aggMap.get(r.client_id) ?? { spent: 0, visits: 0 };
      curr.spent += Number(r.total_amount ?? 0);
      curr.visits += 1;
      aggMap.set(r.client_id, curr);
    }

    let updated = 0;
    const updates = [...aggMap.entries()].map(([id, agg]) => ({
      id,
      total_spent: Math.round(agg.spent * 100) / 100,
      total_visits: agg.visits,
    }));

    const CHUNK = 100;
    for (let i = 0; i < updates.length; i += CHUNK) {
      const chunk = updates.slice(i, i + CHUNK);
      const { error } = await supabase.from('clients').upsert(chunk, { onConflict: 'id' });
      if (!error) updated += chunk.length;
    }

    return NextResponse.json({
      success: true,
      orphanReceipts: orphans.length,
      backfilled,
      clientsUpdated: updated,
      message: `${backfilled} tickets reliés à leur client · ${updated} fiches client recalculées`,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
