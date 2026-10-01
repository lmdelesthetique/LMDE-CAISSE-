import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

type Ctx = { params: Promise<{ id: string }> };

// POST /api/reservations/[id]/mark-completed
// Returns both the updated reservation and the previous status so the caller can decide whether to deduct stock
export async function POST(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const supabase = createAdminClient();

  const { data: existing } = await supabase
    .from('reservations')
    .select('items, reservation_status')
    .eq('id', id)
    .maybeSingle();

  const { data, error } = await supabase
    .from('reservations')
    .update({ reservation_status: 'completed', completed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ...data, previousStatus: existing?.reservation_status ?? null });
}
