import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

function generateTicketNumber(): string {
  const now = new Date();
  const yy = now.getFullYear().toString().slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const rand = Math.floor(Math.random() * 9000) + 1000;
  return `TKT-${yy}${mm}${dd}-${rand}`;
}

export async function POST() {
  const supabase = createAdminClient();

  // Load all existing Shopify receipts notes to avoid duplicates
  const { data: existingReceipts } = await supabase
    .from('receipts')
    .select('notes')
    .eq('cashier_name', 'Shopify');

  const existingNotes = new Set((existingReceipts ?? []).map((r: any) => r.notes));

  // Collect all Shopify orders from the three fulfillment tables
  const [deliveriesRes, expeditionsRes, pickupsRes] = await Promise.all([
    supabase.from('deliveries').select('shopify_order_number, client_name, total_amount, created_at').not('shopify_order_number', 'is', null),
    supabase.from('expeditions').select('shopify_order_number, client_name, total_amount, created_at').not('shopify_order_number', 'is', null),
    supabase.from('pickup_notifications').select('shopify_order_number, client_name, total_amount, created_at').not('shopify_order_number', 'is', null),
  ]);

  const allOrders = [
    ...(deliveriesRes.data ?? []),
    ...(expeditionsRes.data ?? []),
    ...(pickupsRes.data ?? []),
  ];

  const toInsert: Record<string, unknown>[] = [];
  const seen = new Set<string>();

  for (const order of allOrders) {
    const orderNumber = order.shopify_order_number as string;
    if (!orderNumber) continue;

    const noteKey = `Commande Shopify ${orderNumber}`;
    if (existingNotes.has(noteKey) || seen.has(orderNumber)) continue;
    seen.add(orderNumber);

    const amount = Number(order.total_amount) || 0;
    if (amount <= 0) continue;

    const subtotalHT = Math.round((amount / 1.085) * 100) / 100;
    const totalTVA = Math.round((amount - subtotalHT) * 100) / 100;

    toInsert.push({
      ticket_number: generateTicketNumber(),
      items: [],
      items_count: 0,
      subtotal_ht: subtotalHT,
      total_tva: totalTVA,
      total_amount: amount,
      discount_amount: 0,
      payment_method: 'CB',
      payment_type: 'sale',
      client_name: (order.client_name as string) || 'Client Shopify',
      cashier_name: 'Shopify',
      notes: noteKey,
      status: 'completed',
      is_demo: false,
      created_at: order.created_at as string,
    });
  }

  if (toInsert.length === 0) {
    return NextResponse.json({ created: 0, skipped: allOrders.length, message: 'Tous les reçus Shopify existent déjà.' });
  }

  const { data: inserted, error } = await supabase
    .from('receipts')
    .insert(toInsert)
    .select('id');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    created: inserted?.length ?? 0,
    skipped: allOrders.length - toInsert.length,
    total_orders_found: allOrders.length,
  });
}
