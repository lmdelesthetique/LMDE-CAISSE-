import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

function generateReservationNumber(): string {
  const year = new Date().getFullYear();
  const rand = Math.floor(Math.random() * 90000) + 10000;
  return `RES-${year}-${rand}`;
}

// GET /api/reservations?status=xxx&type=xxx&recovery=xxx&search=xxx
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const status = searchParams.get('status') ?? '';
  const type = searchParams.get('type') ?? '';
  const recovery = searchParams.get('recovery') ?? '';
  const search = searchParams.get('search') ?? '';

  const supabase = createAdminClient();
  let q = supabase.from('reservations').select('*').order('created_at', { ascending: false });

  if (status && status !== 'all') q = q.eq('reservation_status', status);
  if (type && type !== 'all') q = q.eq('reservation_type', type);
  if (recovery && recovery !== 'all') q = q.eq('recovery_mode', recovery);
  if (search.trim()) {
    q = q.or(`client_name.ilike.%${search}%,client_phone.ilike.%${search}%,reservation_number.ilike.%${search}%`);
    q = q.limit(20);
  }

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

// POST /api/reservations — create a reservation (standard or fromPOS)
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('reservations')
    .insert({ ...body, reservation_number: body.reservation_number ?? generateReservationNumber() })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
