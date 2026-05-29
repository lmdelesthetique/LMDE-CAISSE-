import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { createClient as createSupabase } from '@supabase/supabase-js';
import { updateLastSyncAt } from '@/lib/services/shopifyService';

const CLIENT_SECRET = process.env.SHOPIFY_CLIENT_SECRET!;

function getSupabase() {
  return createSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();

  // Verify Shopify HMAC signature
  const hmac = req.headers.get('x-shopify-hmac-sha256');
  const digest = crypto.createHmac('sha256', CLIENT_SECRET).update(rawBody).digest('base64');
  if (!hmac || digest !== hmac) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const topic = req.headers.get('x-shopify-topic');
  // Only process paid orders
  if (topic !== 'orders/paid') {
    return NextResponse.json({ ok: true });
  }

  let order: { order_number: number; line_items?: Array<{ variant_id: number; quantity: number }> };
  try {
    order = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const lineItems = order.line_items ?? [];
  if (!lineItems.length) return NextResponse.json({ ok: true });

  const supabase = getSupabase();

  for (const item of lineItems) {
    if (!item.variant_id || !item.quantity) continue;

    const { data: product } = await supabase
      .from('products')
      .select('id, name, stock')
      .eq('shopify_variant_id', String(item.variant_id))
      .maybeSingle();

    if (!product) continue;

    const stockBefore = Number(product.stock) || 0;
    const newStock = Math.max(0, stockBefore - item.quantity);

    await supabase
      .from('products')
      .update({ stock: newStock, updated_at: new Date().toISOString() })
      .eq('id', product.id);

    await supabase.from('stock_movements_log').insert({
      product_id: product.id,
      product_name: product.name,
      movement_type: 'sale',
      quantity_before: stockBefore,
      quantity_after: newStock,
      quantity_change: -item.quantity,
      reason: `Vente Shopify — commande #${order.order_number}`,
      reference: String(order.order_number),
      performed_by: 'Shopify',
      source: 'shopify_sale',
    });

    if (newStock === 0) {
      await supabase.from('products').update({ status: 'rupture' }).eq('id', product.id);
    }
  }

  updateLastSyncAt().catch(() => {});
  return NextResponse.json({ ok: true });
}
