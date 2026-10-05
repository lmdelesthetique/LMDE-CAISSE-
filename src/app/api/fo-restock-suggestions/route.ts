import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(req: NextRequest) {
  const status = req.nextUrl.searchParams.get('status');
  const supabase = createAdminClient();
  let q = supabase
    .from('fo_restock_suggestions')
    .select('*, suppliers(company_name)')
    .order('recent_sales', { ascending: false });
  if (status) q = q.eq('restock_status', status);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}
