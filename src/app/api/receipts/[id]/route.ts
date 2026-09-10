import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// ─── GET /api/receipts/[id] ───────────────────────────────────────────────────
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let supabase;
  try {
    supabase = createAdminClient();
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[api/receipts/[id] GET] client init failed:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  // Try by UUID first
  let { data, error } = await supabase
    .from('receipts')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  // Fall back to ticket_number lookup
  if (!data && !error) {
    const fallback = await supabase
      .from('receipts')
      .select('*')
      .eq('ticket_number', id)
      .maybeSingle();
    data = fallback.data;
    error = fallback.error;
  }

  if (error) {
    console.error('[api/receipts/[id] GET] query error:', error.code, error.message);
    return NextResponse.json({ error: error.message, code: error.code }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

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

  let supabase;
  try {
    supabase = createAdminClient();
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }

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

  // Cancellation: reverse stock, loyalty points and store credit
  if (changes.status === 'cancelled') {
    updateData.status = 'cancelled';
    auditEntries.push({ receipt_id: id, modified_by: modifiedBy, field_changed: 'status', old_value: 'completed', new_value: 'cancelled', reason });

    // Fetch full receipt to reverse its effects
    const { data: fullReceipt } = await supabase
      .from('receipts')
      .select('items, client_id, loyalty_points_earned, store_credit_used, total_amount')
      .eq('id', id)
      .maybeSingle();

    if (fullReceipt) {
      // Reverse stock for each item sold
      const items: Array<{ productId?: string; product_id?: string; qty?: number; quantity?: number }> =
        Array.isArray(fullReceipt.items) ? fullReceipt.items : [];
      for (const item of items) {
        const productId = item.productId ?? item.product_id;
        const qty = Number(item.qty ?? item.quantity ?? 0);
        if (!productId || qty <= 0) continue;
        const { data: prod } = await supabase.from('products').select('stock, name').eq('id', productId).maybeSingle();
        if (prod) {
          const newStock = (prod.stock || 0) + qty;
          await supabase.from('products').update({ stock: newStock, updated_at: new Date().toISOString() }).eq('id', productId);
          await supabase.from('stock_movements_log').insert({
            product_id: productId,
            product_name: prod.name,
            movement_type: 'return',
            quantity_before: prod.stock || 0,
            quantity_after: newStock,
            quantity_change: qty,
            reason: `Annulation ticket #${id}`,
            performed_by: modifiedBy || 'Admin',
            source: 'receipt_cancellation',
          }).then(({ error: logErr }) => { if (logErr) console.error('[receipts/cancel] stock log:', logErr.message); });
        }
      }

      // Reverse loyalty points earned on this receipt
      const pointsToReverse = Number(fullReceipt.loyalty_points_earned ?? 0);
      if (pointsToReverse > 0 && fullReceipt.client_id) {
        const { data: clientData } = await supabase.from('clients').select('loyalty_points').eq('id', fullReceipt.client_id).maybeSingle();
        if (clientData) {
          const newPoints = Math.max(0, Number(clientData.loyalty_points ?? 0) - pointsToReverse);
          await supabase.from('clients').update({ loyalty_points: newPoints, updated_at: new Date().toISOString() }).eq('id', fullReceipt.client_id);
        }
      }

      // Reverse store credit used on this receipt (re-credit the client)
      const creditUsed = parseFloat(String(fullReceipt.store_credit_used ?? 0));
      if (creditUsed > 0 && fullReceipt.client_id) {
        const { data: clientData } = await supabase.from('clients').select('store_credit').eq('id', fullReceipt.client_id).maybeSingle();
        if (clientData) {
          const newCredit = parseFloat(String(clientData.store_credit ?? 0)) + creditUsed;
          await supabase.from('clients').update({ store_credit: newCredit, updated_at: new Date().toISOString() }).eq('id', fullReceipt.client_id);
        }
      }
    }
  }

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
  // Acquisition source — set silently after payment, no audit entry needed
  if (changes.acquisitionSource !== undefined) {
    updateData.acquisition_source = changes.acquisitionSource || null;
  }

  if (Object.keys(updateData).length === 0) return NextResponse.json({ ok: true });

  const { error: updateError } = await supabase.from('receipts').update(updateData).eq('id', id);
  if (updateError) {
    console.error('[api/receipts/[id] PATCH] update error:', updateError);
    return NextResponse.json({ ok: false, error: updateError.message }, { status: 500 });
  }

  if (auditEntries.length > 0) {
    await supabase.from('ticket_modifications').insert(auditEntries);
  }

  return NextResponse.json({ ok: true });
}
