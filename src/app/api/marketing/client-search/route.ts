import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim() ?? '';
  if (q.length < 2) return NextResponse.json([]);

  const supabase = createAdminClient();
  const { data } = await supabase
    .from('clients')
    .select('id, first_name, last_name, phone, email')
    .or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,phone.ilike.%${q}%`)
    .not('phone', 'is', null)
    .neq('phone', '')
    .limit(30);

  return NextResponse.json(data ?? []);
}
