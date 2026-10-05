import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// POST /api/price-change-log
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  const supabase = createAdminClient();
  const { error } = await supabase.from('price_change_log').insert({
    product_id: body.product_id,
    product_name: body.product_name,
    old_price: body.old_price,
    new_price: body.new_price,
    reason: body.reason ?? null,
    cashier_name: body.cashier_name,
    changed_at: body.changed_at ?? new Date().toISOString(),
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
