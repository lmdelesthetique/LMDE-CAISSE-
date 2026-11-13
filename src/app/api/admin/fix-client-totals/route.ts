import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// POST /api/admin/fix-client-totals
// 1. Backfills client_id on receipts that only have client_name (no client_id)
// 2. Recalculates total_spent and total_visits from BOTH receipts AND client_purchases,
//    deduplicating by ticket number so the same sale isn't counted twice.
export async function POST() {
  try {
    const supabase = createAdminClient();

    // Load everything in parallel
    const [clientsRes, orphanReceiptsRes, allReceiptsRes, allPurchasesRes] = await Promise.all([
      supabase.from('clients').select('id, first_name, last_name'),
      supabase
        .from('receipts')
        .select('id, client_name')
        .is('client_id', null)
        .not('client_name', 'is', null)
        .neq('client_name', '')
        .neq('status', 'cancelled')
        .limit(50000),
      supabase
        .from('receipts')
        .select('client_id, total_amount, ticket_number')
        .not('client_id', 'is', null)
        .neq('status', 'cancelled')
        .limit(200000),
      supabase
        .from('client_purchases')
        .select('client_id, total_ttc, receipt_number')
        .not('client_id', 'is', null)
        .limit(200000),
    ]);

    if (clientsRes.error) return NextResponse.json({ error: clientsRes.error.message }, { status: 500 });

    const clients = clientsRes.data ?? [];
    const orphans: Array<{ id: string; client_name: string }> = orphanReceiptsRes.data ?? [];

    // ── 1. Backfill client_id on orphan receipts ──────────────────────────────
    const lastNameMap = new Map<string, string>();
    for (const c of clients) {
      if (c.last_name) lastNameMap.set(c.last_name.trim().toLowerCase(), c.id);
    }

    const patchGroups = new Map<string, string[]>();
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

    let backfilled = 0;
    for (const [clientId, ids] of patchGroups.entries()) {
      for (let i = 0; i < ids.length; i += 200) {
        const chunk = ids.slice(i, i + 200);
        const { error } = await supabase
          .from('receipts')
          .update({ client_id: clientId })
          .in('id', chunk)
          .is('client_id', null);
        if (!error) backfilled += chunk.length;
      }
    }

    // ── 2. Merge receipts + client_purchases per client ───────────────────────
    // Build per-client set of ticket numbers already in receipts
    const receiptsByClient = new Map<string, { spent: number; visits: number; ticketNums: Set<string> }>();
    for (const r of allReceiptsRes.data ?? []) {
      if (!r.client_id) continue;
      const curr = receiptsByClient.get(r.client_id) ?? { spent: 0, visits: 0, ticketNums: new Set() };
      curr.spent += Number(r.total_amount ?? 0);
      curr.visits += 1;
      if (r.ticket_number) curr.ticketNums.add(r.ticket_number);
      receiptsByClient.set(r.client_id, curr);
    }

    // Add client_purchases entries NOT already counted via receipts
    const aggMap = new Map<string, { spent: number; visits: number }>(
      [...receiptsByClient.entries()].map(([id, v]) => [id, { spent: v.spent, visits: v.visits }])
    );

    for (const p of allPurchasesRes.data ?? []) {
      if (!p.client_id) continue;
      const existing = receiptsByClient.get(p.client_id);
      // Skip if this purchase's receipt_number is already in the receipts table for this client
      if (existing?.ticketNums.has(p.receipt_number)) continue;
      const curr = aggMap.get(p.client_id) ?? { spent: 0, visits: 0 };
      curr.spent += Number(p.total_ttc ?? 0);
      curr.visits += 1;
      aggMap.set(p.client_id, curr);
    }

    // ── 3. Upsert all clients ─────────────────────────────────────────────────
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
      message: `${backfilled} tickets reliés à leur client · ${updated} fiches client recalculées (receipts + client_purchases fusionnés)`,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
