import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// POST /api/deliveries/driver-login — authenticates a driver by phone + PIN
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body?.phone || !body?.pin) return NextResponse.json(null, { status: 400 });
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('drivers')
    .select('id, first_name, last_name')
    .eq('phone', body.phone)
    .eq('pin_code', body.pin)
    .eq('status', 'active')
    .maybeSingle();
  if (error || !data) return NextResponse.json(null, { status: 401 });
  return NextResponse.json({
    id: data.id,
    name: `${data.first_name ?? ''} ${data.last_name ?? ''}`.trim(),
  });
}
