import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// POST /api/auth/verify-manager-pin
// Body: { pin: string }
// Returns: { valid: boolean, employee?: { name: string } }
export async function POST(req: NextRequest) {
  let body: { pin?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ valid: false }, { status: 400 }); }

  const pin = (body.pin ?? '').toString().trim();
  if (!pin || pin.length < 4) return NextResponse.json({ valid: false });

  let supabase: ReturnType<typeof createAdminClient>;
  try {
    supabase = createAdminClient();
  } catch (e: any) {
    console.error('[verify-manager-pin] client init:', e.message);
    return NextResponse.json({ valid: false }, { status: 500 });
  }

  // Fetch admin/manager employees. Use neq('terminated') instead of not-in so that
  // rows with status = NULL are still included (null NOT IN (...) = null in SQL → excluded).
  const { data: employees, error } = await supabase
    .from('employees')
    .select('id, first_name, last_name, role, status, pos_pin')
    .neq('status', 'terminated');

  if (error) {
    console.error('[verify-manager-pin] DB error:', error.code, error.message);
    // Don't return 500 — caller just needs to know pin is invalid
    return NextResponse.json({ valid: false });
  }

  for (const emp of employees ?? []) {
    const role = (emp.role ?? '').toLowerCase();
    if (!['admin', 'manager'].includes(role)) continue;

    const storedPin = emp.pos_pin?.toString().trim();
    if (storedPin && storedPin === pin) {
      const name = [emp.first_name, emp.last_name].filter(Boolean).join(' ');
      return NextResponse.json({ valid: true, employee: { name } });
    }
  }

  return NextResponse.json({ valid: false });
}
