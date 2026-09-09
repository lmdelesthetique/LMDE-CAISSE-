import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export interface StockVerifyLine {
  lineId: string;
  productId: string | null;
  productRef: string;
  productName: string;
  qtyOrdered: number;
  qtyReceived: number;
  stockBeforeReception: number; // stock that already existed before this order arrived
  currentStock: number;
  soldSinceReception: number;
  manualAdjustmentsSince: number;
  expectedStock: number; // stockBefore + received - sold + adjustments
  discrepancy: number; // positive = over-stocked, negative = under-stocked
  status: 'ok' | 'over' | 'under' | 'no_product';
}

export interface StockVerifyResult {
  orderId: string;
  orderNumber: string;
  referenceDate: string | null;
  lines: StockVerifyLine[];
  hasDiscrepancies: boolean;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createAdminClient();

  const { data: order } = await supabase
    .from('fo_orders')
    .select('id, order_number, received_at, stock_updated_at')
    .eq('id', id)
    .single();

  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });

  const { data: lines } = await supabase
    .from('fo_order_lines')
    .select('id, product_id, product_ref, product_name, qty_ordered, qty_received')
    .eq('order_id', id);

  if (!lines?.length) return NextResponse.json({ error: 'No lines' }, { status: 400 });

  // Use received_at if set, else fall back to stock_updated_at
  const referenceDate: string | null = order.received_at || order.stock_updated_at || null;

  // Collect all product IDs
  const productIds: string[] = lines
    .map((l) => l.product_id)
    .filter((pid): pid is string => !!pid);

  // Get current stock for all products at once
  const stockMap = new Map<string, number>();
  if (productIds.length > 0) {
    const { data: products } = await supabase
      .from('products')
      .select('id, stock')
      .in('id', productIds);
    (products ?? []).forEach((p) => stockMap.set(p.id, Number(p.stock || 0)));
  }

  // Get POS sales since referenceDate for these product IDs
  const salesMap = new Map<string, number>();
  if (referenceDate && productIds.length > 0) {
    const { data: receipts } = await supabase
      .from('receipts')
      .select('items, created_at')
      .gte('created_at', referenceDate)
      .order('created_at', { ascending: true });

    (receipts ?? []).forEach((r) => {
      const items: Array<{ product_id?: string; qty?: number; quantity?: number }> = Array.isArray(r.items) ? r.items : [];
      items.forEach((item) => {
        if (!item.product_id || !productIds.includes(item.product_id)) return;
        const qty = Number(item.qty ?? item.quantity ?? 0);
        salesMap.set(item.product_id, (salesMap.get(item.product_id) ?? 0) + qty);
      });
    });
  }

  // Get manual stock adjustments since referenceDate (exclude supplier_reception)
  const manualMap = new Map<string, number>();
  if (referenceDate && productIds.length > 0) {
    const { data: movements } = await supabase
      .from('stock_movements_log')
      .select('product_id, quantity_change, movement_type')
      .in('product_id', productIds)
      .neq('movement_type', 'supplier_reception')
      .gte('created_at', referenceDate);

    (movements ?? []).forEach((m) => {
      if (!m.product_id) return;
      manualMap.set(m.product_id, (manualMap.get(m.product_id) ?? 0) + Number(m.quantity_change || 0));
    });
  }

  // Get stock BEFORE this order's reception using movements log
  // The reception log stores quantity_before = stock at the moment of reception
  // This allows us to compute: expected = stockBefore + received - sold + adjustments
  const preReceptionMap = new Map<string, number>();
  if (productIds.length > 0 && order.order_number) {
    const { data: receptionMovements } = await supabase
      .from('stock_movements_log')
      .select('product_id, quantity_before, created_at')
      .in('product_id', productIds)
      .eq('movement_type', 'supplier_reception')
      .ilike('reason', `%${order.order_number}%`)
      .order('created_at', { ascending: true });

    // Take the FIRST entry per product — that's the stock before any reception from this order
    (receptionMovements ?? []).forEach((m) => {
      if (!m.product_id || preReceptionMap.has(m.product_id)) return;
      preReceptionMap.set(m.product_id, Number(m.quantity_before ?? 0));
    });
  }

  const result: StockVerifyLine[] = lines.map((line) => {
    const productId = line.product_id ?? null;
    const qtyOrdered = Number(line.qty_ordered || 0);
    const qtyReceived = Number(line.qty_received || 0);

    if (!productId) {
      return {
        lineId: line.id,
        productId: null,
        productRef: line.product_ref || '',
        productName: line.product_name || line.product_ref || '',
        qtyOrdered,
        qtyReceived,
        stockBeforeReception: 0,
        currentStock: 0,
        soldSinceReception: 0,
        manualAdjustmentsSince: 0,
        expectedStock: 0,
        discrepancy: 0,
        status: 'no_product' as const,
      };
    }

    const currentStock = stockMap.get(productId) ?? 0;
    const soldSinceReception = salesMap.get(productId) ?? 0;
    const manualAdjustmentsSince = manualMap.get(productId) ?? 0;

    // Stock before reception: from movements log if available, else estimate from current - received
    const stockBeforeReception = preReceptionMap.has(productId)
      ? preReceptionMap.get(productId)!
      : Math.max(0, currentStock - qtyReceived + soldSinceReception - manualAdjustmentsSince);

    // Correct formula: stock before + received - sold since + manual adjustments since
    const expectedStock = stockBeforeReception + qtyReceived - soldSinceReception + manualAdjustmentsSince;
    const discrepancy = currentStock - expectedStock;

    let status: StockVerifyLine['status'] = 'ok';
    if (Math.abs(discrepancy) > 0) status = discrepancy > 0 ? 'over' : 'under';

    return {
      lineId: line.id,
      productId,
      productRef: line.product_ref || '',
      productName: line.product_name || line.product_ref || '',
      qtyOrdered,
      qtyReceived,
      stockBeforeReception,
      currentStock,
      soldSinceReception,
      manualAdjustmentsSince,
      expectedStock,
      discrepancy,
      status,
    };
  });

  const hasDiscrepancies = result.some((l) => l.status !== 'ok' && l.status !== 'no_product');

  return NextResponse.json({
    orderId: order.id,
    orderNumber: order.order_number,
    referenceDate,
    lines: result,
    hasDiscrepancies,
  } satisfies StockVerifyResult);
}
