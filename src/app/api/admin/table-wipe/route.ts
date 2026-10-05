import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

const ALLOWED_TABLES = new Set([
  'products', 'clients', 'receipts', 'reservations',
  'employee_sales', 'inventory_movements',
]);

function validateTable(table: string | null): table is string {
  return !!table && ALLOWED_TABLES.has(table);
}

// GET /api/admin/table-wipe?table=products — count rows
export async function GET(req: NextRequest) {
  const table = req.nextUrl.searchParams.get('table');
  if (!validateTable(table)) return NextResponse.json({ error: 'Invalid table' }, { status: 400 });
  const supabase = createAdminClient();
  const { count, error } = await supabase
    .from(table)
    .select('*', { count: 'exact', head: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ count: count ?? 0 });
}

// DELETE /api/admin/table-wipe?table=products — wipe all rows
export async function DELETE(req: NextRequest) {
  const table = req.nextUrl.searchParams.get('table');
  if (!validateTable(table)) return NextResponse.json({ error: 'Invalid table' }, { status: 400 });
  const supabase = createAdminClient();
  const { error } = await supabase
    .from(table)
    .delete()
    .gte('created_at', '2000-01-01');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
