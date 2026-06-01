import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

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

    const totalAmount = (body.quantity || 1) * (body.unitPrice || 0);
    const isLoss = body.productCondition === 'damaged' && !body.returnToStock;

    // 2. Insert return as completed immediately
    const { data: ret, error: retError } = await supabase
      .from('returns')
      .insert({
        avoir_number: avoirNumber,
        client_id: body.clientId || null,
        product_id: body.productId || null,
        product_name: body.productName,
        product_ref: body.productRef || null,
        quantity: body.quantity || 1,
        unit_price: body.unitPrice || 0,
        total_amount: totalAmount,
        reason: body.reason,
        reason_notes: body.reasonNotes || null,
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

    // 3. Restock if product is in good condition and returnToStock
    if (body.returnToStock && body.productCondition !== 'damaged' && body.productId) {
      const { data: prod } = await supabase
        .from('products')
        .select('stock')
        .eq('id', body.productId)
        .maybeSingle();
      if (prod) {
        const newStock = (prod.stock || 0) + (body.quantity || 1);
        await supabase
          .from('products')
          .update({ stock: newStock, updated_at: new Date().toISOString() })
          .eq('id', body.productId);
        await supabase.from('stock_movements_log').insert({
          product_id: body.productId,
          product_name: body.productName,
          movement_type: 'entry',
          quantity_before: prod.stock || 0,
          quantity_after: newStock,
          quantity_change: body.quantity || 1,
          reason: 'Retour client — bon état',
          performed_by: body.processedBy || 'Admin',
        });
        stockUpdated = true;
      }
    } else if (isLoss || body.productCondition === 'damaged') {
      await supabase.from('return_losses').insert({
        return_id: ret.id,
        product_id: body.productId || null,
        product_name: body.productName,
        quantity: body.quantity || 1,
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
