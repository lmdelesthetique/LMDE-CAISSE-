import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// ─── GET /api/receipts/[id] ───────────────────────────────────────────────────
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('receipts')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    console.error('[api/receipts GET id]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json(data);
}

// ─── PATCH /api/receipts/[id] — modify ticket ─────────────────────────────────
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: { changes: Record<string, unknown>; modifiedBy: string; reason: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Fetch current values for audit trail
  const { data: current } = await supabase
    .from('receipts')
    .select('client_id, client_name, payment_method, notes')
    .eq('id', id)
    .maybeSingle();

  if (!current) return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 });

  const { changes, modifiedBy, reason } = body;
  const updateData: Record<string, unknown> = {};
  const auditEntries: Array<Record<string, unknown>> = [];

  if (changes.clientName !== undefined && changes.clientName !== current.client_name) {
    updateData.client_name = changes.clientName;
    updateData.client_id = changes.clientId ?? null;
    auditEntries.push({ receipt_id: id, modified_by: modifiedBy, field_changed: 'client_name', old_value: current.client_name, new_value: changes.clientName, reason });
  }
  if (changes.paymentMethod !== undefined && changes.paymentMethod !== current.payment_method) {
    updateData.payment_method = changes.paymentMethod;
    auditEntries.push({ receipt_id: id, modified_by: modifiedBy, field_changed: 'payment_method', old_value: current.payment_method, new_value: changes.paymentMethod, reason });
  }
  if (changes.notes !== undefined && changes.notes !== current.notes) {
    updateData.notes = changes.notes;
    auditEntries.push({ receipt_id: id, modified_by: modifiedBy, field_changed: 'notes', old_value: current.notes, new_value: changes.notes, reason });
  }

  if (Object.keys(updateData).length === 0) return NextResponse.json({ ok: true });

  const { error: updateError } = await supabase.from('receipts').update(updateData).eq('id', id);
  if (updateError) {
    console.error('[api/receipts PATCH]', updateError);
    return NextResponse.json({ ok: false, error: updateError.message }, { status: 500 });
  }

  if (auditEntries.length > 0) {
    await supabase.from('ticket_modifications').insert(auditEntries);
  }

  return NextResponse.json({ ok: true });
}
