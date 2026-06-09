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

  // Use select * to avoid failing on missing columns
  const { data: emp, error } = await supabase
    .from('employees')
    .select('*')
    .eq('id', employeeId)
    .maybeSingle();

  if (error) {
    console.error('[verify-employee-pin] query error:', error.message);
    return NextResponse.json({ valid: false }, { status: 500 });
  }
  if (!emp) return NextResponse.json({ valid: false });

  // Support both English and French column names for PIN
  const stored = String(emp.pos_pin ?? emp.pin ?? emp.code ?? '').trim();
  const provided = String(pin ?? '').trim();

  // Blank PIN = open access (no PIN configured)
  const valid = stored === '' || stored === provided;

  if (!valid) return NextResponse.json({ valid: false });

  const firstName = emp.first_name ?? emp.prenom ?? emp.firstName ?? '';
  const lastName  = emp.last_name  ?? emp.nom    ?? emp.lastName  ?? '';
  const initials  = emp.avatar_initials ??
    `${String(firstName)[0] ?? ''}${String(lastName)[0] ?? ''}`.toUpperCase();

  return NextResponse.json({
    valid: true,
    employee: {
      id: emp.id,
      firstName: String(firstName),
      lastName:  String(lastName),
      fullName:  `${firstName} ${lastName}`.trim(),
      avatarInitials: initials || '?',
      role: emp.role ?? 'cashier',
      permCashierAccess: emp.perm_cashier_access !== false,
    },
  });
}
