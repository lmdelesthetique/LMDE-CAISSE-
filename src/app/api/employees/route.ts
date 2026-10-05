import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// GET /api/employees?status=active
export async function GET(req: NextRequest) {
  let supabase: ReturnType<typeof createAdminClient>;
  try {
    supabase = createAdminClient();
  } catch (e: any) {
    return NextResponse.json({ error: e.message, employees: [] }, { status: 500 });
  }

  const statusFilter = req.nextUrl.searchParams.get('status') ?? 'active';
  const allFields = req.nextUrl.searchParams.get('all') === 'true';

  let q = supabase
    .from('employees')
    .select(allFields
      ? 'id, first_name, last_name, role, status, avatar_initials, pos_pin, perm_cashier_access, monthly_objective'
      : 'id, first_name, last_name, role, status, avatar_initials, pos_pin, perm_cashier_access')
    .order('first_name', { ascending: true });
  if (statusFilter !== 'all') q = q.eq('status', statusFilter);
  const { data, error } = await q;

  if (error) {
    console.error('[api/employees] query error:', error.message, error.code);
    return NextResponse.json({ error: error.message, employees: [] }, { status: 500 });
  }

  const employees = (data ?? []).map((r: any) => ({
    id: r.id,
    firstName: r.first_name ?? '',
    lastName: r.last_name ?? '',
    fullName: `${r.first_name ?? ''} ${r.last_name ?? ''}`.trim(),
    avatarInitials: r.avatar_initials ||
      `${(r.first_name ?? '')[0] ?? ''}${(r.last_name ?? '')[0] ?? ''}`.toUpperCase(),
    role: r.role ?? 'cashier',
    status: r.status ?? 'active',
    permCashierAccess: r.perm_cashier_access !== false,
    monthly_objective: r.monthly_objective ?? 0,
  }));

  return NextResponse.json({ employees });
}
