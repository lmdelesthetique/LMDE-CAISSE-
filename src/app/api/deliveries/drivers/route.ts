import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('drivers')
    .insert({
      first_name: body.first_name ?? body.firstName ?? '',
      last_name: body.last_name ?? body.lastName ?? '',
      phone: body.phone ?? '',
      pin_code: body.pin_code ?? body.pinCode ?? '',
      notes: body.notes ?? null,
      status: 'active',
      driver_status: 'off',
    })
    .select('*')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

// GET /api/deliveries/drivers — list drivers (?all=true to include inactive, ?full=true for all fields)
export async function GET(req: NextRequest) {
  const supabase = createAdminClient();
  const allStatuses = req.nextUrl.searchParams.get('all') === 'true';
  const fullFields = req.nextUrl.searchParams.get('full') === 'true';
  let q = supabase
    .from('drivers')
    .select(fullFields ? '*' : 'id, first_name, last_name, phone, driver_status, status, pin_code, notes, created_at')
    .order('created_at', { ascending: false });
  if (!allStatuses) q = q.eq('status', 'active');
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (fullFields) return NextResponse.json(data ?? []);
  return NextResponse.json(
    (data ?? []).map((r: any) => ({
      id: r.id,
      name: `${r.first_name ?? ''} ${r.last_name ?? ''}`.trim(),
      phone: r.phone ?? null,
      driverStatus: r.driver_status ?? 'off',
    }))
  );
}
