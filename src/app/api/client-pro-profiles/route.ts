import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// GET /api/client-pro-profiles — returns all pro profiles
export async function GET() {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('client_pro_profiles')
    .select('client_id, statut_commercial');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}
