import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// Count active products where stock is at or below the alert threshold (min_stock)
export async function GET() {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('products')
    .select('id, stock, min_stock')
    .neq('is_suspended', true)
    .not('stock', 'is', null);
  if (error) return NextResponse.json({ count: 0 });
  const threshold = 3;
  const count = (data ?? []).filter(p => (p.stock ?? 0) <= (p.min_stock ?? threshold)).length;
  return NextResponse.json({ count });
}
