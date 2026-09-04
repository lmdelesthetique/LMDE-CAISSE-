import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(req: NextRequest) {
  let body: { factureId: string; lines: Array<{ productId?: string; description: string; quantity: number }>; clientName?: string; numero?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { factureId, lines, clientName, numero } = body;
  if (!factureId || !Array.isArray(lines)) {
    return NextResponse.json({ error: 'factureId and lines required' }, { status: 400 });
  }

  const supabase = createAdminClient();
  const errors: string[] = [];
  const reference = numero ?? factureId;
  const reason = `Facture B2B payée — ${clientName ?? 'Client'}`;

  for (const line of lines) {
    if (!line.productId || line.quantity <= 0) continue;

    const { data: product, error: fetchErr } = await supabase
      .from('products')
      .select('id, name, stock')
      .eq('id', line.productId)
      .maybeSingle();

    if (fetchErr || !product) {
      errors.push(`Produit introuvable: ${line.description}`);
      continue;
    }

    const currentStock = Number(product.stock) || 0;
    const newStock = Math.max(0, currentStock - line.quantity);

    // Atomic conditional update — only succeeds if stock hasn't changed since we read it
    const { error: updateErr, data: updated } = await supabase
      .from('products')
      .update({ stock: newStock, updated_at: new Date().toISOString() })
      .eq('id', line.productId)
      .eq('stock', currentStock)
      .select('id');

    if (updateErr || !updated || updated.length === 0) {
      errors.push(`Stock modifié concurrent: ${product.name} — réessayez`);
      continue;
    }

    await supabase.from('stock_movements_log').insert({
      product_id: line.productId,
      product_name: product.name,
      movement_type: 'sale',
      quantity_before: currentStock,
      quantity_after: newStock,
      quantity_change: -line.quantity,
      reason,
      reference,
      performed_by: clientName ?? 'B2B',
      source: 'b2b_sale',
    }).then(({ error }) => { if (error) console.error('[b2b deduct-stock log]', error.message); });
  }

  return NextResponse.json({ success: true, errors });
}
