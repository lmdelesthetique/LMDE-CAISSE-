import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// POST /api/auth/verify-manager-pin
// Body: { pin: string }
// Returns: { valid: boolean, employee?: { name: string } }
// Checks all active admin/manager employees against pos_pin / pin_code / pin columns.
export async function POST(req: NextRequest) {
  let body: { pin?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ valid: false }, { status: 400 }); }

  const pin = (body.pin ?? '').toString().trim();
  if (!pin || pin.length < 4) return NextResponse.json({ valid: false });

  try {
    const supabase = createAdminClient();

    // Fetch all employees (not terminated/inactive) so we can check PIN locally
    const { data: employees, error } = await supabase
      .from('employees')
      .select('id, first_name, last_name, role, status, pos_pin, pin_code, pin')
      .not('status', 'in', '(inactive,terminated)');

    if (error) {
      console.error('[verify-manager-pin] DB error:', error.message);
      // Fallback: check localStorage-style PIN so old behaviour still works
      return NextResponse.json({ valid: false, error: error.message }, { status: 500 });
    }

    for (const emp of employees ?? []) {
      // Only admin / manager can authorise sensitive actions
      const role = (emp.role ?? '').toLowerCase();
      if (!['admin', 'manager'].includes(role)) continue;

      // Check all possible PIN column names (plain-text only)
      const candidates: string[] = [emp.pos_pin, emp.pin_code, emp.pin]
        .filter((v): v is string => v != null && v !== '')
        .map((v) => v.toString().trim());

      if (candidates.some((c) => c === pin)) {
        return NextResponse.json({
          valid: true,
          employee: { name: [emp.first_name, emp.last_name].filter(Boolean).join(' ') },
        });
      }
    }

    return NextResponse.json({ valid: false });
  } catch (e: any) {
    console.error('[verify-manager-pin] exception:', e.message);
    return NextResponse.json({ valid: false }, { status: 500 });
  }
}
