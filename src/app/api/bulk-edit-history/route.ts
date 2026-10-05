import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// POST /api/bulk-edit-history
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  const supabase = createAdminClient();
  const { error } = await supabase.from('bulk_edit_history').insert({
    edit_type: body.edit_type,
    product_ids: body.product_ids,
    product_count: body.product_count,
    old_values: body.old_values ?? null,
    new_value: body.new_value ?? null,
    notes: body.notes ?? null,
    edited_by: body.edited_by ?? 'admin',
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
