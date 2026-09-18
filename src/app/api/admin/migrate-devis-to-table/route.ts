import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// POST /api/admin/migrate-devis-to-table
// One-time migration: reads all devis_history JSONB entries and inserts into devis_pro table
export async function POST() {
  const supabase = createAdminClient();

  // Get all pro profiles with devis_history
  const { data: profiles, error: profilesErr } = await supabase
    .from('client_pro_profiles')
    .select('client_id, devis_history')
    .not('devis_history', 'is', null);

  if (profilesErr) return NextResponse.json({ error: profilesErr.message }, { status: 500 });

  let migrated = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const profile of profiles ?? []) {
    const history = profile.devis_history;
    if (!Array.isArray(history) || history.length === 0) continue;

    for (const entry of history) {
      try {
        // Check if already migrated (by matching client_id + created_at)
        const entryDate = entry.date ?? entry.created_at ?? new Date().toISOString();
        const { count } = await supabase
          .from('devis_pro')
          .select('*', { count: 'exact', head: true })
          .eq('client_id', profile.client_id)
          .eq('created_at', new Date(entryDate).toISOString());

        if ((count ?? 0) > 0) { skipped++; continue; }

        const totalTtc = entry.totalValue ?? entry.total_ttc ?? 0;
        const clientPays = entry.clientPays ?? entry.client_pays ?? totalTtc;

        const { error: insertErr } = await supabase.from('devis_pro').insert({
          client_id: profile.client_id,
          items: entry.items ?? [],
          discount_pct: entry.discountPct ?? entry.discount_pct ?? 0,
          credit: entry.credit ?? 0,
          total_ttc: totalTtc,
          client_pays: clientPays,
          free_shipping: entry.freeShipping ?? entry.free_shipping ?? false,
          statut: 'livre',
          pdf_url: entry.pdfUrl ?? entry.pdf_url ?? null,
          paiements: [],
          paye_total: 0,
          sent_at: new Date(entryDate).toISOString(),
          delivered_at: new Date(entryDate).toISOString(),
          created_at: new Date(entryDate).toISOString(),
        });

        if (insertErr) {
          errors.push(`client ${profile.client_id}: ${insertErr.message}`);
        } else {
          migrated++;
        }
      } catch (e: any) {
        errors.push(`client ${profile.client_id}: ${e.message}`);
      }
    }
  }

  return NextResponse.json({ migrated, skipped, errors: errors.slice(0, 20) });
}
