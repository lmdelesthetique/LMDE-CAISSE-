import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// GET /api/inventory/history — Returns all inventory adjustment movements
export async function GET() {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('stock_movements_log')
    .select('id, product_id, product_name, quantity_before, quantity_after, quantity_change, performed_by, created_at')
    .eq('performed_by', 'Inventaire')
    .eq('movement_type', 'adjustment')
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}
