import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function makeClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase env vars not configured');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

function mapEmployee(r: any) {
  return {
    id: r.id,
    firstName: r.first_name ?? '',
    lastName: r.last_name ?? '',
    fullName: `${r.first_name ?? ''} ${r.last_name ?? ''}`.trim(),
    avatarInitials: r.avatar_initials || `${(r.first_name ?? '')[0] ?? ''}${(r.last_name ?? '')[0] ?? ''}`.toUpperCase(),
    role: r.role ?? 'cashier',
    status: r.status ?? 'active',
    permCashierAccess: r.perm_cashier_access !== false,
  };
}

// GET /api/employees?status=active
export async function GET(req: NextRequest) {
  const statusParam = new URL(req.url).searchParams.get('status') ?? 'active';

  let supabase: ReturnType<typeof makeClient>;
  try {
    supabase = makeClient();
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }

  const baseQuery = () =>
    supabase
      .from('employees')
      .select('id, first_name, last_name, role, status, avatar_initials, perm_cashier_access, pos_pin')
      .order('first_name', { ascending: true });

  // Try filtered query first (active / Actif / actif)
  let { data, error } = await baseQuery().in('status', [
    statusParam,
    'active',
    'Actif',
    'actif',
    'Active',
  ]);

  if (error) {
    console.error('[api/employees GET] filtered query error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Fallback: if no employees found with status filter, return ALL (inactive excluded only if explicitly named)
  if (!data || data.length === 0) {
    console.log('[api/employees] No active employees found — falling back to all employees');
    const fallback = await baseQuery().not('status', 'eq', 'deleted');
    if (fallback.error) {
      console.error('[api/employees GET] fallback error:', fallback.error.message);
      // Last resort: return everything
      const all = await baseQuery();
      data = all.data ?? [];
    } else {
      data = fallback.data ?? [];
    }
  }

  return NextResponse.json({ employees: (data ?? []).map(mapEmployee) });
}
