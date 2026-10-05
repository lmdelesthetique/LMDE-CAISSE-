import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

const ALL_FIELDS = 'id, first_name, last_name, email, phone, role, status, pos_pin, avatar_initials, hire_date, notes, perm_cashier_access, perm_stock_access, perm_suppliers_access, perm_products_access, perm_stats_access, perm_discount_auth, perm_cancel_auth, perm_price_modify, perm_admin_access, monthly_objective, is_delivery_driver, portal_phone, portal_pin, driver_status, created_at, updated_at';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  const supabase = createAdminClient();

  const fn = body.first_name ?? '';
  const ln = body.last_name ?? '';
  const initials = body.avatar_initials ?? `${fn.charAt(0)}${ln.charAt(0)}`.toUpperCase();

  const { data, error } = await supabase
    .from('employees')
    .insert({
      first_name: fn,
      last_name: ln,
      email: body.email ?? null,
      phone: body.phone ?? null,
      role: body.role ?? 'cashier',
      status: body.status ?? 'active',
      pos_pin: body.pos_pin ?? null,
      avatar_initials: initials,
      hire_date: body.hire_date ?? null,
      notes: body.notes ?? null,
      perm_cashier_access: body.perm_cashier_access ?? true,
      perm_stock_access: body.perm_stock_access ?? false,
      perm_suppliers_access: body.perm_suppliers_access ?? false,
      perm_products_access: body.perm_products_access ?? false,
      perm_stats_access: body.perm_stats_access ?? false,
      perm_discount_auth: body.perm_discount_auth ?? false,
      perm_cancel_auth: body.perm_cancel_auth ?? false,
      perm_price_modify: body.perm_price_modify ?? false,
      perm_admin_access: body.perm_admin_access ?? false,
      monthly_objective: body.monthly_objective ?? 0,
      is_delivery_driver: body.is_delivery_driver ?? false,
      portal_phone: body.portal_phone ?? null,
      portal_pin: body.portal_pin ?? null,
    })
    .select(ALL_FIELDS)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

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
  const search = req.nextUrl.searchParams.get('search')?.trim();

  let q = supabase
    .from('employees')
    .select(allFields
      ? 'id, first_name, last_name, role, status, avatar_initials, pos_pin, perm_cashier_access, monthly_objective'
      : 'id, first_name, last_name, role, status, avatar_initials, pos_pin, perm_cashier_access')
    .order('first_name', { ascending: true });
  if (statusFilter !== 'all') q = q.eq('status', statusFilter);
  if (search) {
    const like = `%${search}%`;
    q = q.or(`first_name.ilike.${like},last_name.ilike.${like},email.ilike.${like},phone.ilike.${like}`);
  }
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
