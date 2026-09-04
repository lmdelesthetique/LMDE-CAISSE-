import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

interface Movement {
  id: string;
  product_id: string;
  product_name: string;
  movement_type: string;
  quantity_change: number;
  quantity_before: number;
  quantity_after: number;
  reason: string;
  reference: string | null;
  created_at: string;
  performed_by: string;
}

interface DuplicateGroup {
  product_id: string;
  product_name: string;
  date: string;
  movements: Movement[];
  extra_qty: number;
  ids_to_cancel: string[];
}

// GET — analyze stock_movements_log to find suspected duplicates.
// Duplicates = multiple 'entry' or 'supplier_reception' movements for the same product
// with the same quantity_change within 24 hours.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const days = Math.min(parseInt(searchParams.get('days') ?? '90'), 365);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const supabase = createAdminClient();

  const { data: movements, error } = await supabase
    .from('stock_movements_log')
    .select('id, product_id, product_name, movement_type, quantity_change, quantity_before, quantity_after, reason, reference, created_at, performed_by')
    .in('movement_type', ['entry', 'supplier_reception'])
    .gte('created_at', since)
    .order('created_at', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Group movements by (product_id, movement_type, quantity_change) within a 24h window
  // and find groups with more than one entry — those are suspected duplicates.
  const suspectedGroups: DuplicateGroup[] = [];

  const processed = new Set<string>();
  const mvs = (movements ?? []) as Movement[];

  for (let i = 0; i < mvs.length; i++) {
    const m = mvs[i];
    if (processed.has(m.id)) continue;

    const windowMs = 24 * 60 * 60 * 1000;
    const mTime = new Date(m.created_at).getTime();

    // Find all movements for the same product with same quantity and movement type within 24h
    const matches: Movement[] = [m];
    for (let j = i + 1; j < mvs.length; j++) {
      const n = mvs[j];
      if (processed.has(n.id)) continue;
      if (n.product_id !== m.product_id) continue;
      if (n.movement_type !== m.movement_type) continue;
      if (n.quantity_change !== m.quantity_change) continue;

      const nTime = new Date(n.created_at).getTime();
      if (nTime - mTime > windowMs) continue;

      matches.push(n);
    }

    if (matches.length > 1) {
      // Keep the first one, the rest are duplicates
      const extras = matches.slice(1);
      extras.forEach(e => processed.add(e.id));
      processed.add(m.id);

      const extraQty = extras.reduce((s, e) => s + Number(e.quantity_change), 0);
      suspectedGroups.push({
        product_id: m.product_id,
        product_name: m.product_name || extras[0]?.product_name || '',
        date: m.created_at,
        movements: matches,
        extra_qty: extraQty,
        ids_to_cancel: extras.map(e => e.id),
      });
    } else {
      processed.add(m.id);
    }
  }

  return NextResponse.json({
    period_days: days,
    total_duplicates: suspectedGroups.length,
    total_extra_units: suspectedGroups.reduce((s, g) => s + g.extra_qty, 0),
    groups: suspectedGroups,
  });
}

// POST — apply corrections: subtract the extra quantities and log corrections.
// Body: { groups: DuplicateGroup[] } or { all: true } to fix all detected duplicates.
export async function POST(req: NextRequest) {
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const supabase = createAdminClient();
  const now = new Date().toISOString();

  // Re-detect duplicates (same logic as GET) to ensure we're working with fresh data
  const days = body.days ?? 90;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const { data: movements, error } = await supabase
    .from('stock_movements_log')
    .select('id, product_id, product_name, movement_type, quantity_change, quantity_before, quantity_after, reason, reference, created_at')
    .in('movement_type', ['entry', 'supplier_reception'])
    .gte('created_at', since)
    .order('created_at', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const windowMs = 24 * 60 * 60 * 1000;
  const processed = new Set<string>();
  const mvs = (movements ?? []) as Movement[];

  // Collect only the specific group ids if provided, otherwise fix all
  const specificProductIds: string[] | null = body.productIds ?? null;

  const toFix: { productId: string; productName: string; extraQty: number; ids: string[]; reason: string }[] = [];

  for (let i = 0; i < mvs.length; i++) {
    const m = mvs[i];
    if (processed.has(m.id)) continue;
    if (specificProductIds && !specificProductIds.includes(m.product_id)) { processed.add(m.id); continue; }

    const mTime = new Date(m.created_at).getTime();
    const matches: Movement[] = [m];
    for (let j = i + 1; j < mvs.length; j++) {
      const n = mvs[j];
      if (processed.has(n.id)) continue;
      if (n.product_id !== m.product_id) continue;
      if (n.movement_type !== m.movement_type) continue;
      if (n.quantity_change !== m.quantity_change) continue;
      if (new Date(n.created_at).getTime() - mTime > windowMs) continue;
      matches.push(n);
    }

    if (matches.length > 1) {
      const extras = matches.slice(1);
      extras.forEach(e => processed.add(e.id));
      processed.add(m.id);
      const extraQty = extras.reduce((s, e) => s + Number(e.quantity_change), 0);
      toFix.push({
        productId: m.product_id,
        productName: m.product_name || '',
        extraQty,
        ids: extras.map(e => e.id),
        reason: m.reason ?? '',
      });
    } else {
      processed.add(m.id);
    }
  }

  if (toFix.length === 0) {
    return NextResponse.json({ ok: true, fixed: 0, message: 'Aucun doublon détecté.' });
  }

  // Group by product_id (a product may appear in multiple groups)
  const byProduct: Record<string, { extraQty: number; ids: string[]; name: string; reason: string }> = {};
  for (const g of toFix) {
    if (!byProduct[g.productId]) byProduct[g.productId] = { extraQty: 0, ids: [], name: g.productName, reason: g.reason };
    byProduct[g.productId].extraQty += g.extraQty;
    byProduct[g.productId].ids.push(...g.ids);
  }

  const log: { name: string; removed: number; before: number; after: number }[] = [];
  let fixed = 0;

  for (const [productId, g] of Object.entries(byProduct)) {
    const { data: p } = await supabase.from('products').select('id, stock, product_status').eq('id', productId).maybeSingle();
    if (!p) continue;

    const currentStock = Number(p.stock) || 0;
    const newStock = Math.max(0, currentStock - g.extraQty);

    await supabase.from('products').update({ stock: newStock, updated_at: now }).eq('id', productId);

    if (newStock <= 0 && p.product_status !== 'inactive') {
      await supabase.from('products')
        .update({ status: 'rupture', product_status: 'rupture' })
        .eq('id', productId);
    }

    // Mark the duplicate log entries as cancelled
    await supabase.from('stock_movements_log')
      .update({ reason: `[DOUBLON ANNULÉ] ${g.reason}` })
      .in('id', g.ids);

    // Insert correction entry
    await supabase.from('stock_movements_log').insert({
      product_id: productId,
      product_name: g.name,
      movement_type: 'correction',
      quantity_before: currentStock,
      quantity_after: newStock,
      quantity_change: -g.extraQty,
      reason: `Correction doublons — ${g.extraQty} unités en doublon supprimées`,
      performed_by: 'Système',
    });

    log.push({ name: g.name, removed: g.extraQty, before: currentStock, after: newStock });
    fixed++;
  }

  return NextResponse.json({ ok: true, fixed, log });
}
