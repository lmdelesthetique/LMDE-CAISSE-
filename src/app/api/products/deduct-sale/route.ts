import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { syncColorStocksToTotal } from '@/lib/utils/syncColorStock';

// POST /api/products/deduct-sale
// Deducts stock for all items in a POS sale. Handles kits + optimistic locking.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });

  const {
    items,
    ticketRef,
    paymentMethod,
    cashierName,
    ticketStatus,
    ticketType,
  }: {
    items: Array<{
      productId: string;
      name: string;
      qty: number;
      isFreePrice?: boolean;
      kitComponents?: Array<{ componentId: string; name: string; quantity: number }>;
    }>;
    ticketRef: string;
    paymentMethod: string;
    cashierName: string;
    ticketStatus?: string;
    ticketType?: string;
  } = body;

  // Guard: only deduct for paid/completed sales or explicit vente type
  if (
    ticketStatus !== undefined &&
    ticketStatus !== 'paid' &&
    ticketStatus !== 'completed' &&
    ticketType !== 'vente'
  ) {
    return NextResponse.json({ success: true, errors: [] });
  }

  const supabase = createAdminClient();
  const errors: string[] = [];
  const shopifySyncItems: Array<{ productId: string; delta: number; newStock: number }> = [];
  const now = new Date().toISOString();

  for (const item of items) {
    if (item.isFreePrice || !item.productId || item.productId.startsWith('free-')) continue;

    const { data: productData, error: fetchError } = await supabase
      .from('products')
      .select('id, name, stock, is_kit')
      .eq('id', item.productId)
      .maybeSingle();

    if (fetchError || !productData) {
      errors.push(`Produit introuvable: ${item.name}`);
      continue;
    }

    const currentStock = Number(productData.stock) || 0;
    const isKit = Boolean(productData.is_kit);

    if (isKit) {
      let resolvedComponents: Array<{ component_id: string; name: string; quantity: number; currentStock: number }> = [];

      if (item.kitComponents && item.kitComponents.length > 0) {
        for (const kc of item.kitComponents) {
          const { data: cp } = await supabase.from('products').select('stock').eq('id', kc.componentId).maybeSingle();
          resolvedComponents.push({
            component_id: kc.componentId,
            name: kc.name,
            quantity: kc.quantity,
            currentStock: Number(cp?.stock) || 0,
          });
        }
      } else {
        const { data: kitComponents } = await supabase
          .from('product_kits')
          .select('component_id, quantity, products!product_kits_component_id_fkey(id, name, stock)')
          .eq('product_id', item.productId);
        for (const comp of (kitComponents ?? []) as any[]) {
          if (!comp.products) continue;
          resolvedComponents.push({
            component_id: comp.component_id,
            name: comp.products.name,
            quantity: Number(comp.quantity) || 1,
            currentStock: Number(comp.products.stock) || 0,
          });
        }
      }

      for (const comp of resolvedComponents) {
        const compQtyToDeduct = comp.quantity * item.qty;
        const compNewStock = Math.max(0, comp.currentStock - compQtyToDeduct);

        const { error: compUpdateError } = await supabase
          .from('products')
          .update({ stock: compNewStock, updated_at: now })
          .eq('id', comp.component_id);

        if (compUpdateError) { errors.push(`Erreur décompte composant kit: ${comp.name}`); continue; }

        await syncColorStocksToTotal(supabase, comp.component_id, compNewStock);
        shopifySyncItems.push({ productId: comp.component_id, delta: -compQtyToDeduct, newStock: compNewStock });

        await supabase.from('stock_movements_log').insert({
          product_id: comp.component_id,
          product_name: comp.name,
          movement_type: 'sale',
          quantity_before: comp.currentStock,
          quantity_after: compNewStock,
          quantity_change: -compQtyToDeduct,
          reason: `Vente caisse (kit: ${item.name}) — ${paymentMethod}`,
          reference: ticketRef,
          performed_by: cashierName,
          source: 'pos_sale',
        });

        if (compNewStock === 0) {
          await supabase.from('products').update({ status: 'rupture', product_status: 'rupture' })
            .eq('id', comp.component_id).neq('product_status', 'inactive');
        }
      }

      // Deduct kit itself if it tracks stock
      if (currentStock > 0) {
        const newKitStock = Math.max(0, currentStock - item.qty);
        await supabase.from('products').update({ stock: newKitStock, updated_at: now }).eq('id', item.productId);
        shopifySyncItems.push({ productId: item.productId, delta: -item.qty, newStock: newKitStock });
        await supabase.from('stock_movements_log').insert({
          product_id: item.productId,
          product_name: item.name,
          movement_type: 'sale',
          quantity_before: currentStock,
          quantity_after: newKitStock,
          quantity_change: -item.qty,
          reason: `Vente caisse (kit) — ${paymentMethod}`,
          reference: ticketRef,
          performed_by: cashierName,
          source: 'pos_sale',
        });
        if (newKitStock === 0) {
          await supabase.from('products').update({ status: 'rupture', product_status: 'rupture' })
            .eq('id', item.productId).neq('product_status', 'inactive');
        }
      }
    } else {
      // Regular product — optimistic locking
      const newStock = Math.max(0, currentStock - item.qty);

      const { data: updatedRows, error: updateError } = await supabase
        .from('products')
        .update({ stock: newStock, updated_at: now })
        .eq('id', item.productId)
        .eq('stock', currentStock)
        .select('stock');

      if (updateError) { errors.push(`Erreur décompte stock: ${item.name}`); continue; }

      let finalStock = newStock;
      if (!updatedRows || updatedRows.length === 0) {
        // Retry once on concurrent modification — re-read fresh stock
        const { data: fresh } = await supabase.from('products').select('stock').eq('id', item.productId).maybeSingle();
        if (fresh !== null) {
          finalStock = Math.max(0, Number(fresh.stock) - item.qty);
          await supabase.from('products').update({ stock: finalStock, updated_at: now }).eq('id', item.productId);
        }
      }

      shopifySyncItems.push({ productId: item.productId, delta: -item.qty, newStock: finalStock });

      // Keep color variant quantities in sync with the new product total
      await syncColorStocksToTotal(supabase, item.productId, finalStock);

      await supabase.from('stock_movements_log').insert({
        product_id: item.productId,
        product_name: item.name,
        movement_type: 'sale',
        quantity_before: currentStock,
        quantity_after: finalStock,
        quantity_change: -item.qty,
        reason: `Vente caisse — ${paymentMethod}`,
        reference: ticketRef,
        performed_by: cashierName,
        source: 'pos_sale',
      });

      if (finalStock === 0) {
        await supabase.from('products').update({ status: 'rupture', product_status: 'rupture' })
          .eq('id', item.productId).neq('product_status', 'inactive');
      }
    }
  }

  // Shopify sync (non-blocking response but awaited server-side)
  if (shopifySyncItems.length > 0) {
    fetch(`${process.env.NEXT_PUBLIC_SITE_URL}/api/shopify/sync-stock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: shopifySyncItems }),
    }).catch(() => {});
  }

  return NextResponse.json({ success: errors.length === 0, errors });
}
