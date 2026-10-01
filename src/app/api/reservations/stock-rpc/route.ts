import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// POST /api/reservations/stock-rpc
// Executes stock RPCs (deduct_stock_on_reservation / reinject_stock_on_cancel)
// using admin client to bypass RLS.
// body: { action: 'deduct' | 'reinject', productId: string, qty: number }

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });

  const { action, productId, qty } = body as { action: 'deduct' | 'reinject'; productId: string; qty: number };
  if (!action || !productId || !qty) return NextResponse.json({ error: 'action, productId, qty requis' }, { status: 400 });

  const supabase = createAdminClient();

  if (action === 'deduct') {
    const { error } = await supabase.rpc('deduct_stock_on_reservation', { p_product_id: productId, p_qty: qty });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else if (action === 'reinject') {
    const { error } = await supabase.rpc('reinject_stock_on_cancel', { p_product_id: productId, p_qty: qty });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else {
    return NextResponse.json({ error: 'action invalide' }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
