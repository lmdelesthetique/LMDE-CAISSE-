import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { adjustInventoryLevel, getInventoryItemId } from '@/lib/services/shopifyService';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const from = searchParams.get('from');
  const to = searchParams.get('to');

  try {
    const supabase = createAdminClient();
    let query = supabase
      .from('returns')
      .select('*, clients(first_name, last_name)')
      .order('created_at', { ascending: false });
    if (from) query = query.gte('created_at', from);
    if (to) query = query.lte('created_at', to);
    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data ?? []);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  try {
    const supabase = createAdminClient();

    // 1. Generate avoir number
    const { data: avoirNumber, error: avoirError } = await supabase.rpc('generate_avoir_number');
    if (avoirError) {
      console.error('[api/returns POST] generate_avoir_number:', avoirError.message);
      return NextResponse.json({ error: `Génération numéro avoir: ${avoirError.message}` }, { status: 500 });
    }

    // Support for multi-product line items
    const lineItems: Array<{
      productId?: string;
      productName: string;
      productRef?: string;
      qty: number;
      unitPrice: number;
      discountPct: number;
      lineTotal: number;
    }> = body.lineItems ?? [];

    const hasMultipleItems = lineItems.length > 0;

    // Compute total from lineItems if provided, otherwise from legacy fields
    const totalAmount = hasMultipleItems
      ? lineItems.reduce((s, li) => s + (li.lineTotal ?? li.qty * li.unitPrice), 0)
      : (body.quantity || 1) * (body.unitPrice || 0);

    // Primary product from first line item or legacy fields
    const primaryProductId = hasMultipleItems ? (lineItems[0]?.productId || null) : (body.productId || null);
    const primaryProductName = hasMultipleItems
      ? lineItems.length === 1
        ? lineItems[0].productName
        : `${lineItems[0].productName} + ${lineItems.length - 1} autre(s)`
      : body.productName;
    const primaryProductRef = hasMultipleItems ? (lineItems[0]?.productRef || null) : (body.productRef || null);
    const primaryQty = hasMultipleItems
      ? lineItems.reduce((s, li) => s + li.qty, 0)
      : (body.quantity || 1);
    const primaryUnitPrice = hasMultipleItems
      ? (lineItems[0]?.lineTotal ?? lineItems[0]?.qty * lineItems[0]?.unitPrice) / (lineItems[0]?.qty || 1)
      : (body.unitPrice || 0);

    const isLoss = body.productCondition === 'damaged' && !body.returnToStock;

    // Build structured reason_notes (JSON) with items + payment method + user notes
    let storedReasonNotes: string | null = null;
    if (hasMultipleItems || body.paymentMethod) {
      storedReasonNotes = JSON.stringify({
        __v: 1,
        line_items: hasMultipleItems ? lineItems : undefined,
        payment_method: body.paymentMethod || undefined,
        user_notes: body.reasonNotes || undefined,
      });
    } else {
      storedReasonNotes = body.reasonNotes || null;
    }

    // 2. Insert return as completed immediately
    const { data: ret, error: retError } = await supabase
      .from('returns')
      .insert({
        avoir_number: avoirNumber,
        client_id: body.clientId || null,
        client_name: body.clientName || null,
        product_id: primaryProductId,
        product_name: primaryProductName,
        product_ref: primaryProductRef,
        quantity: primaryQty,
        unit_price: primaryUnitPrice,
        total_amount: totalAmount,
        reason: body.reason,
        reason_notes: storedReasonNotes,
        refund_type: body.refundType,
        return_status: 'completed',
        product_condition: body.productCondition,
        return_to_stock: body.returnToStock,
        is_internal_loss: isLoss || Boolean(body.isInternalLoss),
        loss_amount: isLoss ? totalAmount : 0,
        avoir_status: 'available',
        exchange_product_id: body.exchangeProductId || null,
        exchange_product_name: body.exchangeProductName || null,
        exchange_price_diff: body.exchangePriceDiff || 0,
        decision: body.decision || null,
        stock_updated: false,
        credit_applied: false,
        original_receipt: body.originalReceipt || null,
        processed_by: body.processedBy || 'Admin',
      })
      .select('*')
      .single();

    if (retError) {
      console.error('[api/returns POST] insert:', retError.message);
      return NextResponse.json({ error: retError.message }, { status: 500 });
    }

    let stockUpdated = false;
    let creditApplied = false;

    // 3. Restock products
    const itemsToRestock = hasMultipleItems
      ? lineItems.filter(li => li.productId)
      : (body.returnToStock && body.productCondition !== 'damaged' && body.productId
          ? [{ productId: body.productId, productName: body.productName, qty: body.quantity || 1 }]
          : []);

    if (body.returnToStock && body.productCondition !== 'damaged' && itemsToRestock.length > 0) {
      for (const li of itemsToRestock) {
        const pid = (li as any).productId;
        if (!pid) continue;
        const { data: prod } = await supabase
          .from('products')
          .select('stock')
          .eq('id', pid)
          .maybeSingle();
        if (prod) {
          const newStock = (prod.stock || 0) + ((li as any).qty || 1);
          await supabase
            .from('products')
            .update({ stock: newStock, updated_at: new Date().toISOString() })
            .eq('id', pid);
          await supabase.from('stock_movements_log').insert({
            product_id: pid,
            product_name: (li as any).productName,
            movement_type: 'entry',
            quantity_before: prod.stock || 0,
            quantity_after: newStock,
            quantity_change: (li as any).qty || 1,
            reason: 'Retour client — bon état',
            performed_by: body.processedBy || 'Admin',
          });
          stockUpdated = true;
          getInventoryItemId(pid).then(async (invItemId) => {
            if (invItemId) await adjustInventoryLevel(invItemId, (li as any).qty || 1);
          }).catch(e => console.error('[returns] shopify sync error:', e.message));
        }
      }
    } else if (isLoss || body.productCondition === 'damaged') {
      await supabase.from('return_losses').insert({
        return_id: ret.id,
        product_id: primaryProductId,
        product_name: primaryProductName,
        quantity: primaryQty,
        total_loss: totalAmount,
        loss_reason: 'damaged_return',
        is_boutique_fault: Boolean(body.isInternalLoss),
        recorded_by: body.processedBy || 'Admin',
      });
    }

    // 4. Apply store credit to client if refund type is store_credit
    if (body.clientId && body.refundType === 'store_credit') {
      const { data: clientData } = await supabase
        .from('clients')
        .select('store_credit')
        .eq('id', body.clientId)
        .maybeSingle();
      if (clientData !== null) {
        const newCredit = parseFloat(clientData?.store_credit ?? 0) + totalAmount;
        const { error: creditError } = await supabase
          .from('clients')
          .update({ store_credit: newCredit, updated_at: new Date().toISOString() })
          .eq('id', body.clientId);
        if (!creditError) creditApplied = true;
      }
    }

    // 5. Finalise return record with actual outcomes
    await supabase
      .from('returns')
      .update({ stock_updated: stockUpdated, credit_applied: creditApplied })
      .eq('id', ret.id);

    return NextResponse.json({ ...ret, stock_updated: stockUpdated, credit_applied: creditApplied }, { status: 201 });
  } catch (e: any) {
    console.error('[api/returns POST] exception:', e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
