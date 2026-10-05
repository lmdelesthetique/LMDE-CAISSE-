import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  const supabase = createAdminClient();

  const u: any = { updated_at: new Date().toISOString() };
  if (body.status !== undefined) u.status = body.status;
  if (body.tracking_number !== undefined) u.tracking_number = body.tracking_number;
  if (body.label_printed !== undefined) u.label_printed = body.label_printed;
  if (body.shipped_at !== undefined) u.shipped_at = body.shipped_at;
  if (body.carrier !== undefined) u.carrier = body.carrier;
  if (body.notes !== undefined) u.notes = body.notes;

  const { error } = await supabase.from('expeditions').update(u).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
