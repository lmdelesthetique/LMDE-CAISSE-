import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function makeClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase env vars not configured');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

// POST /api/auth/verify-employee-pin
// Body: { employeeId: string, pin: string }
export async function POST(req: NextRequest) {
  let body: { employeeId?: string; pin?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ valid: false }, { status: 400 });
  }

  const { employeeId, pin } = body;
  if (!employeeId) return NextResponse.json({ valid: false });

  let supabase: ReturnType<typeof makeClient>;
  try {
    supabase = makeClient();
  } catch (e: any) {
    console.error('[verify-employee-pin] client init:', e.message);
    return NextResponse.json({ valid: false }, { status: 500 });
  }

  const { data: emp, error } = await supabase
    .from('employees')
    .select('id, first_name, last_name, role, pos_pin, status, avatar_initials, perm_cashier_access')
    .eq('id', employeeId)
    .eq('status', 'active')
    .maybeSingle();

  if (error) {
    console.error('[verify-employee-pin] query error:', error.message);
    return NextResponse.json({ valid: false }, { status: 500 });
  }
  if (!emp) return NextResponse.json({ valid: false });

  // Only check pos_pin column
  const stored   = (emp.pos_pin ?? '').toString().trim();
  const provided = (pin ?? '').toString().trim();

  // No PIN configured = open access
  if (!stored) {
    const initials = emp.avatar_initials ||
      `${(emp.first_name ?? '')[0] ?? ''}${(emp.last_name ?? '')[0] ?? ''}`.toUpperCase();
    return NextResponse.json({
      valid: true,
      employee: {
        id: emp.id,
        firstName: emp.first_name ?? '',
        lastName: emp.last_name ?? '',
        fullName: `${emp.first_name ?? ''} ${emp.last_name ?? ''}`.trim(),
        avatarInitials: initials || '?',
        role: emp.role ?? 'cashier',
        permCashierAccess: emp.perm_cashier_access !== false,
      },
    });
  }

  if (stored !== provided) return NextResponse.json({ valid: false });

  const initials = emp.avatar_initials ||
    `${(emp.first_name ?? '')[0] ?? ''}${(emp.last_name ?? '')[0] ?? ''}`.toUpperCase();

  return NextResponse.json({
    valid: true,
    employee: {
      id: emp.id,
      firstName: emp.first_name ?? '',
      lastName: emp.last_name ?? '',
      fullName: `${emp.first_name ?? ''} ${emp.last_name ?? ''}`.trim(),
      avatarInitials: initials || '?',
      role: emp.role ?? 'cashier',
      permCashierAccess: emp.perm_cashier_access !== false,
    },
  });
}
