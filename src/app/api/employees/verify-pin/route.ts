import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// POST /api/employees/verify-pin  { pin: string }
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body?.pin) return NextResponse.json({ employee: null }, { status: 200 });
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('employees')
    .select('*')
    .eq('pos_pin', body.pin)
    .in('status', ['active', 'Actif'])
    .single();
  if (error || !data) return NextResponse.json({ employee: null });
  return NextResponse.json({ employee: data });
}
