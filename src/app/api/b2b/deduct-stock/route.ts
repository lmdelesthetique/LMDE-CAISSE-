import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function makeClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

interface LineItem {
  productId?: string;
  description: string;
  quantity: number;
}

export async function POST(req: NextRequest) {
  let body: { factureId: string; lines: LineItem[]; clientName?: string; numero?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { factureId, lines, clientName, numero } = body;
  if (!factureId || !Array.isArray(lines)) {
    return NextResponse.json({ error: 'factureId and lines required' }, { status: 400 });
  }

  const supabase = makeClient();
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

    const { error: updateErr } = await supabase
      .from('products')
      .update({ stock: newStock, updated_at: new Date().toISOString() })
      .eq('id', line.productId);

    if (updateErr) {
      errors.push(`Erreur décompte stock: ${product.name}`);
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
    });
  }

  return NextResponse.json({ success: true, errors });
}
