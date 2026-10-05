import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// GET /api/expenses/structure-fee?month=YYYY-MM
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const month = searchParams.get('month');
  if (!month) return NextResponse.json({ error: 'Missing month' }, { status: 400 });
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('structure_fee_config')
    .select('*')
    .eq('month_year', month)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? null);
}

// POST /api/expenses/structure-fee — upsert
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body?.month_year) return NextResponse.json({ error: 'Missing month_year' }, { status: 400 });
  const supabase = createAdminClient();
  const { error } = await supabase
    .from('structure_fee_config')
    .upsert(body, { onConflict: 'month_year' });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
