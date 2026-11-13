import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// POST /api/admin/recalculate-avoir
// Recomputes store_credit for EVERY client from scratch based on:
//   - Credits: returns with refund_type = 'store_credit' (deleted = cancelled, so all remaining are valid)
//   - Debits POS: receipts.store_credit_used where status != 'cancelled'
//   - Debits Devis: devis_pro paiements with method='avoir' where statut = 'livre'
export async function POST() {
  try {
    const supabase = createAdminClient();

    // 1. Fetch all data sources in parallel
    const [returnsRes, receiptsRes, devisRes] = await Promise.all([
      supabase
        .from('returns')
        .select('client_id, total_amount')
        .eq('refund_type', 'store_credit')
        .not('client_id', 'is', null),
      supabase
        .from('receipts')
        .select('client_id, store_credit_used')
        .not('client_id', 'is', null)
        .neq('status', 'cancelled')
        .gt('store_credit_used', 0),
      supabase
        .from('devis_pro')
        .select('client_id, paiements')
        .eq('statut', 'livre')
        .not('client_id', 'is', null)
        .not('paiements', 'is', null),
    ]);

    if (returnsRes.error) return NextResponse.json({ error: `returns: ${returnsRes.error.message}` }, { status: 500 });
    if (receiptsRes.error) return NextResponse.json({ error: `receipts: ${receiptsRes.error.message}` }, { status: 500 });
    if (devisRes.error) return NextResponse.json({ error: `devis_pro: ${devisRes.error.message}` }, { status: 500 });

    // 2. Aggregate per client
    const credits = new Map<string, number>();
    const debits = new Map<string, number>();

    // Returns = credits
    for (const r of returnsRes.data ?? []) {
      if (!r.client_id) continue;
      credits.set(r.client_id, (credits.get(r.client_id) ?? 0) + Number(r.total_amount ?? 0));
    }

    // Receipts store_credit_used = POS debits
    for (const r of receiptsRes.data ?? []) {
      if (!r.client_id) continue;
      debits.set(r.client_id, (debits.get(r.client_id) ?? 0) + Number(r.store_credit_used ?? 0));
    }

    // Devis avoir paiements = Devis debits
    for (const d of devisRes.data ?? []) {
      if (!d.client_id) continue;
      const paiements: any[] = Array.isArray(d.paiements) ? d.paiements : [];
      const avoirTotal = paiements
        .filter((p: any) => p.method === 'avoir')
        .reduce((sum: number, p: any) => sum + Number(p.amount ?? 0), 0);
      if (avoirTotal > 0) {
        debits.set(d.client_id, (debits.get(d.client_id) ?? 0) + avoirTotal);
      }
    }

    // 3. Build set of all affected client IDs
    const allClientIds = new Set([...credits.keys(), ...debits.keys()]);

    if (allClientIds.size === 0) {
      return NextResponse.json({ success: true, updated: 0, message: 'Aucun avoir trouvé' });
    }

    // 4. Fetch current store_credit values
    const clientIds = [...allClientIds];
    const { data: clients, error: cErr } = await supabase
      .from('clients')
      .select('id, store_credit')
      .in('id', clientIds);

    if (cErr) return NextResponse.json({ error: `clients: ${cErr.message}` }, { status: 500 });

    // 5. Build updates
    const updates: Array<{ id: string; store_credit: number }> = [];
    let skipped = 0;

    for (const client of clients ?? []) {
      const totalCredits = credits.get(client.id) ?? 0;
      const totalDebits = debits.get(client.id) ?? 0;
      const correct = Math.max(0, Math.round((totalCredits - totalDebits) * 100) / 100);
      const current = Math.round(Number(client.store_credit ?? 0) * 100) / 100;

      if (correct !== current) {
        updates.push({ id: client.id, store_credit: correct });
      } else {
        skipped++;
      }
    }

    // 6. Apply updates in chunks of 100
    let updated = 0;
    const CHUNK = 100;
    for (let i = 0; i < updates.length; i += CHUNK) {
      const chunk = updates.slice(i, i + CHUNK);
      const { error: uErr } = await supabase
        .from('clients')
        .upsert(chunk.map(u => ({ ...u, updated_at: new Date().toISOString() })), { onConflict: 'id' });
      if (uErr) console.error('[recalculate-avoir] upsert error:', uErr.message);
      else updated += chunk.length;
    }

    return NextResponse.json({
      success: true,
      clientsWithAvoir: allClientIds.size,
      clientsUpdated: updated,
      clientsAlreadyCorrect: skipped,
      returnsCredits: returnsRes.data?.length ?? 0,
      receiptsDebits: receiptsRes.data?.length ?? 0,
      devisDebits: devisRes.data?.length ?? 0,
    });
  } catch (e: any) {
    console.error('[api/admin/recalculate-avoir]', e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
