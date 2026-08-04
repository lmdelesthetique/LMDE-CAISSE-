import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// POST — fixes reservations where total payments cover full amount but status is not 'completed'
// Idempotent; called automatically on reservations page load.
export async function POST() {
  const supabase = createAdminClient();
  const now = new Date().toISOString();

  const { data: rows, error: fetchErr } = await supabase
    .from('reservations')
    .select('id, total_amount, deposit_paid, balance_paid')
    .neq('reservation_status', 'completed')
    .neq('reservation_status', 'cancelled')
    .limit(500);

  if (fetchErr) {
    return NextResponse.json({ fixed: 0, error: fetchErr.message }, { status: 500 });
  }

  const ids = (rows ?? [])
    .filter((r) => {
      const total = parseFloat(r.total_amount ?? 0);
      const paid = parseFloat(r.deposit_paid ?? 0) + parseFloat(r.balance_paid ?? 0);
      return total > 0 && paid >= total - 0.01;
    })
    .map((r) => r.id);

  if (ids.length === 0) return NextResponse.json({ fixed: 0 });

  const { error: updateErr } = await supabase
    .from('reservations')
    .update({ reservation_status: 'completed', completed_at: now, updated_at: now })
    .in('id', ids);

  if (updateErr) {
    return NextResponse.json({ fixed: 0, error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({ fixed: ids.length });
}
