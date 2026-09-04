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
  type: 'time' | 'reference';
  product_id: string;
  product_name: string;
  date: string;
  movements: Movement[];
  extra_qty: number;
  ids_to_cancel: string[];
  description: string;
}

function detectDuplicates(mvs: Movement[], windowMs: number): DuplicateGroup[] {
  const groups: DuplicateGroup[] = [];
  const processedTime = new Set<string>();
  const processedRef = new Set<string>();

  // ── Type 1: time-based (same product, same type, same qty within window) ──
  for (let i = 0; i < mvs.length; i++) {
    const m = mvs[i];
    if (processedTime.has(m.id)) continue;

    const mTime = new Date(m.created_at).getTime();
    const matches: Movement[] = [m];

    for (let j = i + 1; j < mvs.length; j++) {
      const n = mvs[j];
      if (processedTime.has(n.id)) continue;
      if (n.product_id !== m.product_id) continue;
      if (n.movement_type !== m.movement_type) continue;
      if (n.quantity_change !== m.quantity_change) continue;
      if (new Date(n.created_at).getTime() - mTime > windowMs) continue;
      matches.push(n);
    }

    if (matches.length > 1) {
      matches.forEach(e => processedTime.add(e.id));
      const extras = matches.slice(1);
      const extraQty = extras.reduce((s, e) => s + Math.abs(Number(e.quantity_change)), 0);
      groups.push({
        type: 'time',
        product_id: m.product_id,
        product_name: m.product_name || extras[0]?.product_name || '',
        date: m.created_at,
        movements: matches,
        extra_qty: extraQty,
        ids_to_cancel: extras.map(e => e.id),
        description: `${matches.length}× même entrée de ${m.quantity_change} unité(s) dans ${Math.round(windowMs / 3600000)}h`,
      });
    } else {
      processedTime.add(m.id);
    }
  }

  // ── Type 2: reference-based (same invoice reference used twice for same product) ──
  // Group by (product_id + reference) — a non-null reference used more than once is a duplicate.
  const byRef = new Map<string, Movement[]>();
  for (const m of mvs) {
    if (!m.reference?.trim()) continue;
    const key = `${m.product_id}::${m.reference.trim().toLowerCase()}`;
    const bucket = byRef.get(key) ?? [];
    bucket.push(m);
    byRef.set(key, bucket);
  }
  for (const [, group] of byRef) {
    if (group.length < 2) continue;
    // Skip if already covered by time-based detection
    const allProcessed = group.every(m => processedRef.has(m.id));
    if (allProcessed) continue;
    group.forEach(m => processedRef.add(m.id));

    const sorted = [...group].sort((a, b) => a.created_at.localeCompare(b.created_at));
    const extras = sorted.slice(1);
    const extraQty = extras.reduce((s, e) => s + Math.abs(Number(e.quantity_change)), 0);
    groups.push({
      type: 'reference',
      product_id: sorted[0].product_id,
      product_name: sorted[0].product_name || '',
      date: sorted[0].created_at,
      movements: sorted,
      extra_qty: extraQty,
      ids_to_cancel: extras.map(e => e.id),
      description: `Facture/référence "${sorted[0].reference}" utilisée ${group.length}× pour ce produit`,
    });
  }

  return groups;
}

// GET — analyze stock_movements_log for duplicates.
// ?days=90&windowDays=1&productName=5+in+1
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const days = Math.min(parseInt(searchParams.get('days') ?? '180'), 365);
  const windowDays = Math.min(parseFloat(searchParams.get('windowDays') ?? '1'), 30);
  const productName = searchParams.get('productName')?.toLowerCase().trim() ?? '';
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const supabase = createAdminClient();

  let query = supabase
    .from('stock_movements_log')
    .select('id, product_id, product_name, movement_type, quantity_change, quantity_before, quantity_after, reason, reference, created_at, performed_by')
    .in('movement_type', ['entry', 'supplier_reception'])
    .not('reason', 'ilike', '[DOUBLON ANNULÉ]%')
    .gte('created_at', since)
    .order('created_at', { ascending: true });

  if (productName) {
    query = query.ilike('product_name', `%${productName}%`);
  }

  const { data: movements, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const mvs = (movements ?? []) as Movement[];
  const windowMs = windowDays * 24 * 60 * 60 * 1000;
  const groups = detectDuplicates(mvs, windowMs);

  return NextResponse.json({
    period_days: days,
    window_hours: Math.round(windowMs / 3600000),
    product_filter: productName || null,
    total_movements_checked: mvs.length,
    total_duplicates: groups.length,
    total_extra_units: groups.reduce((s, g) => s + g.extra_qty, 0),
    groups,
  });
}

// POST — apply corrections.
// Body: { days?: number; windowDays?: number; productIds?: string[]; productName?: string }
export async function POST(req: NextRequest) {
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const supabase = createAdminClient();
  const now = new Date().toISOString();

  const days = body.days ?? 180;
  const windowDays = Math.min(body.windowDays ?? 1, 30);
  const productName = body.productName?.toLowerCase().trim() ?? '';
  const specificProductIds: string[] | null = body.productIds ?? null;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  let query = supabase
    .from('stock_movements_log')
    .select('id, product_id, product_name, movement_type, quantity_change, quantity_before, quantity_after, reason, reference, created_at')
    .in('movement_type', ['entry', 'supplier_reception'])
    .not('reason', 'ilike', '[DOUBLON ANNULÉ]%')
    .gte('created_at', since)
    .order('created_at', { ascending: true });

  if (productName) query = query.ilike('product_name', `%${productName}%`);
  if (specificProductIds?.length) query = query.in('product_id', specificProductIds);

  const { data: movements, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const mvs = (movements ?? []) as Movement[];
  const windowMs = windowDays * 24 * 60 * 60 * 1000;
  const groups = detectDuplicates(mvs, windowMs);

  if (groups.length === 0) {
    return NextResponse.json({ ok: true, fixed: 0, message: 'Aucun doublon détecté.' });
  }

  // Merge by product_id
  const byProduct: Record<string, { extraQty: number; ids: string[]; name: string; reason: string; descriptions: string[] }> = {};
  for (const g of groups) {
    if (!byProduct[g.product_id]) {
      byProduct[g.product_id] = { extraQty: 0, ids: [], name: g.product_name, reason: g.movements[0]?.reason ?? '', descriptions: [] };
    }
    byProduct[g.product_id].extraQty += g.extra_qty;
    byProduct[g.product_id].ids.push(...g.ids_to_cancel);
    byProduct[g.product_id].descriptions.push(g.description);
  }

  const log: { name: string; removed: number; before: number; after: number; details: string }[] = [];
  let fixed = 0;

  for (const [productId, g] of Object.entries(byProduct)) {
    const { data: p } = await supabase.from('products').select('id, stock, product_status').eq('id', productId).maybeSingle();
    if (!p) continue;

    const currentStock = Number(p.stock) || 0;
    const newStock = Math.max(0, currentStock - g.extraQty);

    await supabase.from('products').update({ stock: newStock, updated_at: now }).eq('id', productId);

    if (newStock <= 0 && p.product_status !== 'inactive') {
      await supabase.from('products').update({ status: 'rupture', product_status: 'rupture' }).eq('id', productId);
    }

    // Mark duplicates as cancelled (deduplicate ids first)
    const uniqueIds = [...new Set(g.ids)];
    await supabase.from('stock_movements_log')
      .update({ reason: `[DOUBLON ANNULÉ] ${g.reason}` })
      .in('id', uniqueIds);

    await supabase.from('stock_movements_log').insert({
      product_id: productId,
      product_name: g.name,
      movement_type: 'correction',
      quantity_before: currentStock,
      quantity_after: newStock,
      quantity_change: -g.extraQty,
      reason: `Correction doublons — ${g.extraQty} unité(s) supprimée(s) : ${g.descriptions.join('; ')}`,
      performed_by: 'Système',
    });

    log.push({ name: g.name, removed: g.extraQty, before: currentStock, after: newStock, details: g.descriptions.join('; ') });
    fixed++;
  }

  return NextResponse.json({ ok: true, fixed, log });
}
