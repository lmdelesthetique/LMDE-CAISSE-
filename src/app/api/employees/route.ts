import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function makeClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase env vars not configured');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

// GET /api/employees?status=active
export async function GET(req: NextRequest) {
  const status = new URL(req.url).searchParams.get('status') ?? 'active';

  let supabase: ReturnType<typeof makeClient>;
  try {
    supabase = makeClient();
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }

  let query = supabase
    .from('employees')
    .select('id, first_name, last_name, role, status, avatar_initials, perm_cashier_access')
    .order('first_name', { ascending: true });

  if (status !== 'all') {
    // Accept both English ('active') and French ('Actif') status values
    query = query.in('status', [status, status === 'active' ? 'Actif' : status]);
  }

  const { data, error } = await query;
  if (error) {
    console.error('[api/employees GET]', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const employees = (data ?? []).map((r: any) => ({
    id: r.id,
    firstName: r.first_name ?? '',
    lastName: r.last_name ?? '',
    fullName: `${r.first_name ?? ''} ${r.last_name ?? ''}`.trim(),
    avatarInitials: r.avatar_initials || `${(r.first_name ?? '')[0] ?? ''}${(r.last_name ?? '')[0] ?? ''}`.toUpperCase(),
    role: r.role ?? 'cashier',
    status: r.status ?? 'active',
    permCashierAccess: r.perm_cashier_access !== false,
  }));

  return NextResponse.json({ employees });
}
