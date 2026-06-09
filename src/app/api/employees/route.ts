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
  let supabase: ReturnType<typeof makeClient>;
  try {
    supabase = makeClient();
  } catch (e: any) {
    return NextResponse.json({ error: e.message, employees: [] }, { status: 500 });
  }

  // Step 1: fetch everything from employees table, no column assumptions
  const { data: raw, error } = await supabase
    .from('employees')
    .select('*')
    .order('id', { ascending: true });

  if (error) {
    console.error('[api/employees] query error:', error.message, error.code);
    return NextResponse.json({ error: error.message, employees: [] }, { status: 500 });
  }

  const all = raw ?? [];

  // Step 2: filter out inactive — accept any "active-like" status, or no status column at all
  const ACTIVE_VALUES = new Set(['active', 'actif', 'Actif', 'Active', 'ACTIF', 'ACTIVE', '1', 'true', null, undefined, '']);
  const filtered = all.filter((r: any) => {
    const s = r.status ?? r.statut ?? r.etat ?? null;
    if (s === null || s === undefined || s === '') return true; // no status column → include
    const val = String(s).toLowerCase();
    return val !== 'inactive' && val !== 'inactif' && val !== 'disabled' && val !== 'deleted' && val !== 'supprimé';
  });

  const employees = (filtered.length > 0 ? filtered : all).map((r: any) => {
    // Support both English (first_name/last_name) and French (prenom/nom) column names
    const firstName = r.first_name ?? r.prenom ?? r.firstName ?? '';
    const lastName  = r.last_name  ?? r.nom    ?? r.lastName  ?? '';
    const initials  = r.avatar_initials ??
      `${String(firstName)[0] ?? ''}${String(lastName)[0] ?? ''}`.toUpperCase();

    return {
      id: r.id,
      firstName: String(firstName),
      lastName:  String(lastName),
      fullName:  `${firstName} ${lastName}`.trim(),
      avatarInitials: initials || '?',
      role:   r.role ?? 'cashier',
      status: r.status ?? r.statut ?? 'active',
      // pos_pin included so EmployeePINModal can do blank-PIN bypass
      posPin: r.pos_pin ?? r.pin ?? r.code ?? null,
      permCashierAccess: r.perm_cashier_access !== false,
    };
  });

  return NextResponse.json({ employees });
}
