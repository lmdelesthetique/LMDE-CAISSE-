import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// GET /api/reservations/stats
export async function GET() {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('reservations')
    .select('reservation_status, deposit_paid, balance_paid, total_amount, reservation_type, recovery_mode');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}
