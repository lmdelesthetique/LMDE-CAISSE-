import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// POST — corrects stock based on verified audit discrepancies.
// For each line passed:
//   discrepancy > 0 → stock is too high → subtract the excess
//   discrepancy < 0 → stock is too low  → add the missing qty
// Body: { lines: Array<{ productId, productRef, productName, discrepancy }>, orderNumber? }
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  let body: { lines: Array<{ productId: string | null; productRef: string; productName: string; discrepancy: number }>; orderNumber?: string };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { lines = [], orderNumber = id } = body;
  const actionableLines = lines.filter(l => l.discrepancy !== 0 && (l.productId || l.productRef));

  if (!actionableLines.length) {
    return NextResponse.json({ ok: true, fixed: 0, log: [], message: 'Aucun écart à corriger' });
  }

  const supabase = createAdminClient();
  const now = new Date().toISOString();
  let fixed = 0;
  const log: { name: string; adjustment: number; before: number; after: number; reason: string }[] = [];
  const errors: string[] = [];

  for (const line of actionableLines) {
    let productId: string | null = line.productId ?? null;
    let currentStock = 0;
    let productName = line.productName || line.productRef || '';

    // Resolve product
    if (productId) {
      const { data: p } = await supabase.from('products').select('id, stock, name').eq('id', productId).maybeSingle();
      if (p) { currentStock = Number(p.stock || 0); productName = p.name || productName; }
    } else if (line.productRef) {
      const { data: rows } = await supabase.from('products').select('id, stock, name').eq('ref', line.productRef).limit(1);
      const p = rows?.[0];
      if (p) { productId = p.id; currentStock = Number(p.stock || 0); productName = p.name || productName; }
    }

    if (!productId) {
      errors.push(`Produit non trouvé : ${line.productRef || line.productId}`);
      continue;
    }

    // Apply correction: subtract if over, add if under
    const adjustment = -line.discrepancy; // discrepancy=+60 → adjustment=-60 (remove excess)
    const newStock = Math.max(0, currentStock + adjustment);

    const { error: updateErr } = await supabase
      .from('products')
      .update({ stock: newStock, updated_at: now })
      .eq('id', productId);

    if (updateErr) {
      errors.push(`${productName}: ${updateErr.message}`);
      continue;
    }

    // Update rupture/active status
    if (newStock <= 0) {
      await supabase.from('products')
        .update({ status: 'rupture', product_status: 'rupture' })
        .eq('id', productId)
        .neq('product_status', 'inactive');
    } else if (currentStock <= 0 && newStock > 0) {
      await supabase.from('products')
        .update({ status: 'active', product_status: 'active' })
        .eq('id', productId)
        .neq('product_status', 'inactive');
    }

    const reason = line.discrepancy > 0
      ? `Correction doublon réception — commande ${orderNumber} (−${line.discrepancy} excédentaire)`
      : `Correction stock manquant — commande ${orderNumber} (+${Math.abs(line.discrepancy)} non intégré)`;

    await supabase.from('stock_movements_log').insert({
      product_id: productId,
      product_name: productName,
      movement_type: 'correction',
      quantity_before: currentStock,
      quantity_after: newStock,
      quantity_change: adjustment,
      reason,
      performed_by: 'Admin',
      source: 'stock_discrepancy_fix',
    }).then(({ error: logErr }) => { if (logErr) console.error('[fix-stock-discrepancies log]', logErr.message); });

    log.push({ name: productName, adjustment, before: currentStock, after: newStock, reason });
    fixed++;
  }

  return NextResponse.json({ ok: true, fixed, log, errors: errors.length ? errors : undefined });
}
