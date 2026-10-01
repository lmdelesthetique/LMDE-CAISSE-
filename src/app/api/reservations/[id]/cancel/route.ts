import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

type Ctx = { params: Promise<{ id: string }> };

// POST /api/reservations/[id]/cancel
// Body: { reason?: string }
// Returns the updated reservation and items so caller can reinject stock
export async function POST(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const supabase = createAdminClient();

  const { data: existing } = await supabase
    .from('reservations')
    .select('items, reservation_status')
    .eq('id', id)
    .maybeSingle();

  const { data, error } = await supabase
    .from('reservations')
    .update({
      reservation_status: 'cancelled',
      cancelled_at: new Date().toISOString(),
      cancellation_reason: body.reason ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ...data, previousStatus: existing?.reservation_status ?? null });
}
