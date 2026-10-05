import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// POST /api/pos-action-log
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  const supabase = createAdminClient();
  const { error } = await supabase.from('pos_action_log').insert({
    session_id: body.session_id ?? null,
    employee_id: body.employee_id,
    action_type: body.action_type,
    description: body.description,
    amount: body.amount ?? null,
    meta: body.meta ?? null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
