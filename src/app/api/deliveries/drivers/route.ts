import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// GET /api/deliveries/drivers — list all active drivers
export async function GET() {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('drivers')
    .select('id, first_name, last_name, phone, driver_status')
    .eq('status', 'active');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(
    (data ?? []).map((r: any) => ({
      id: r.id,
      name: `${r.first_name ?? ''} ${r.last_name ?? ''}`.trim(),
      phone: r.phone ?? null,
      driverStatus: r.driver_status ?? 'off',
    }))
  );
}
