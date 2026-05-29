import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { createClient as createSupabase } from '@supabase/supabase-js';
import { updateLastSyncAt } from '@/lib/services/shopifyService';

const CLIENT_SECRET = process.env.SHOPIFY_CLIENT_SECRET!;

function getSupabase() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createSupabase(process.env.NEXT_PUBLIC_SUPABASE_URL!, key);
}

interface ShopifyAddress {
  name?: string;
  address1?: string;
  address2?: string;
  city?: string;
  zip?: string;
  country?: string;
  phone?: string;
}

interface ShopifyLineItem {
  variant_id: number;
  quantity: number;
  title?: string;
  name?: string;
  sku?: string;
  price?: string;
  image?: { src?: string } | null;
}

interface ShopifyOrder {
  id: number;
  name: string;
  order_number: number;
  phone?: string | null;
  note?: string | null;
  total_price?: string;
  shipping_address?: ShopifyAddress | null;
  billing_address?: ShopifyAddress | null;
  shipping_lines?: Array<{ code?: string; title?: string }>;
  line_items?: ShopifyLineItem[];
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

  let order: ShopifyOrder;
  try {
    order = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const lineItems = order.line_items ?? [];
  if (!lineItems.length) return NextResponse.json({ ok: true });

  const supabase = getSupabase();

  // ── Stock deduction ────────────────────────────────────────────────────────
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

  // ── Create delivery if order has a shipping address (not pickup) ───────────
  const ship = order.shipping_address;
  const isPickup = !ship ||
    !ship.address1 ||
    (order.shipping_lines ?? []).some((sl) =>
      sl.code?.toLowerCase().includes('pickup') ||
      sl.title?.toLowerCase().includes('pickup') ||
      sl.title?.toLowerCase().includes('retrait')
    );

  if (!isPickup && ship) {
    // Avoid duplicate deliveries for the same Shopify order
    const shopifyOrderId = String(order.id);
    const { data: existing } = await supabase
      .from('deliveries')
      .select('id')
      .eq('shopify_order_id', shopifyOrderId)
      .maybeSingle();

    if (!existing) {
      const addressParts = [
        ship.address1,
        ship.address2,
        ship.city,
        ship.zip,
        ship.country,
      ].filter(Boolean);
      const deliveryAddress = addressParts.join(', ');

      const clientPhone =
        order.phone ||
        ship.phone ||
        order.billing_address?.phone ||
        null;

      const products = lineItems.map((item) => ({
        name: item.name || item.title || '',
        qty: item.quantity,
        sku: item.sku || undefined,
        price: item.price ? parseFloat(item.price) : undefined,
        imageUrl: item.image?.src || undefined,
      }));

      await supabase.from('deliveries').insert({
        shopify_order_id: shopifyOrderId,
        shopify_order_number: order.name,
        client_name: ship.name || '',
        client_phone: clientPhone,
        delivery_address: deliveryAddress,
        delivery_notes: order.note || null,
        products,
        total_amount: order.total_price ? parseFloat(order.total_price) : null,
        status: 'pending',
        created_at: new Date().toISOString(),
      });
    }
  }

  updateLastSyncAt().catch(() => {});
  return NextResponse.json({ ok: true });
}
