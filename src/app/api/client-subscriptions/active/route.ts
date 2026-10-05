import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// GET /api/client-subscriptions/active — returns client_ids with active subscriptions
export async function GET() {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('client_subscriptions')
    .select('client_id')
    .eq('status', 'active');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}
