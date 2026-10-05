import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// GET /api/app-reviews?subscriptionId=xxx
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const subscriptionId = searchParams.get('subscriptionId');
  if (!subscriptionId) return NextResponse.json({ error: 'Missing subscriptionId' }, { status: 400 });
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('app_reviews')
    .select('rating, comment, updated_at')
    .eq('subscription_id', subscriptionId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? null);
}
