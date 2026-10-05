import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

const ALL_FIELDS = 'id, first_name, last_name, email, phone, role, status, pos_pin, avatar_initials, hire_date, notes, perm_cashier_access, perm_stock_access, perm_suppliers_access, perm_products_access, perm_stats_access, perm_discount_auth, perm_cancel_auth, perm_price_modify, perm_admin_access, monthly_objective, is_delivery_driver, portal_phone, portal_pin, driver_status, created_at, updated_at';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createAdminClient();
  const { data, error } = await supabase.from('employees').select(ALL_FIELDS).eq('id', id).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  return NextResponse.json(data);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  const supabase = createAdminClient();

  const u: any = { updated_at: new Date().toISOString() };
  if (body.first_name !== undefined) u.first_name = body.first_name;
  if (body.last_name !== undefined) u.last_name = body.last_name;
  if (body.email !== undefined) u.email = body.email;
  if (body.phone !== undefined) u.phone = body.phone;
  if (body.role !== undefined) u.role = body.role;
  if (body.status !== undefined) u.status = body.status;
  if (body.pos_pin !== undefined) u.pos_pin = body.pos_pin;
  if (body.hire_date !== undefined) u.hire_date = body.hire_date;
  if (body.notes !== undefined) u.notes = body.notes;
  if (body.monthly_objective !== undefined) u.monthly_objective = body.monthly_objective;
  if (body.is_delivery_driver !== undefined) u.is_delivery_driver = body.is_delivery_driver;
  if (body.portal_phone !== undefined) u.portal_phone = body.portal_phone;
  if (body.portal_pin !== undefined) u.portal_pin = body.portal_pin;
  if (body.perm_cashier_access !== undefined) u.perm_cashier_access = body.perm_cashier_access;
  if (body.perm_stock_access !== undefined) u.perm_stock_access = body.perm_stock_access;
  if (body.perm_suppliers_access !== undefined) u.perm_suppliers_access = body.perm_suppliers_access;
  if (body.perm_products_access !== undefined) u.perm_products_access = body.perm_products_access;
  if (body.perm_stats_access !== undefined) u.perm_stats_access = body.perm_stats_access;
  if (body.perm_discount_auth !== undefined) u.perm_discount_auth = body.perm_discount_auth;
  if (body.perm_cancel_auth !== undefined) u.perm_cancel_auth = body.perm_cancel_auth;
  if (body.perm_price_modify !== undefined) u.perm_price_modify = body.perm_price_modify;
  if (body.perm_admin_access !== undefined) u.perm_admin_access = body.perm_admin_access;
  if (body.avatar_initials !== undefined) u.avatar_initials = body.avatar_initials;

  const { data, error } = await supabase.from('employees').update(u).eq('id', id).select(ALL_FIELDS).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createAdminClient();
  const { error } = await supabase.from('employees').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
