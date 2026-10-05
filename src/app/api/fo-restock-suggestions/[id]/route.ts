import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  const supabase = createAdminClient();
  const u: any = { restock_status: body.status, last_updated: new Date().toISOString() };
  if (body.status === 'suspended') {
    u.suspension_reason = body.reason ?? null;
    u.suspension_note = body.note ?? null;
    u.suspended_at = new Date().toISOString();
  }
  const { error } = await supabase.from('fo_restock_suggestions').update(u).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
