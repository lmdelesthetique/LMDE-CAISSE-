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

  // Use exact enum value 'active' — do NOT use .in() with non-enum values like 'Actif'
  const { data, error } = await supabase
    .from('employees')
    .select('id, first_name, last_name, role, status, avatar_initials, pos_pin, perm_cashier_access')
    .eq('status', 'active')
    .order('first_name', { ascending: true });

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
  }));

  return NextResponse.json({ employees });
}
