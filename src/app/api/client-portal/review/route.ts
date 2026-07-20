import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const subscriptionId = searchParams.get('subscriptionId');
  if (!subscriptionId) return NextResponse.json({ review: null });

  const supabase = createAdminClient();
  const { data } = await supabase
    .from('app_reviews')
    .select('rating, comment, updated_at')
    .eq('subscription_id', subscriptionId)
    .maybeSingle();

  return NextResponse.json({ review: data ?? null });
}

export async function POST(request: Request) {
  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { subscriptionId, rating, comment } = body;
  if (!subscriptionId || !rating) return NextResponse.json({ error: 'subscriptionId and rating required' }, { status: 400 });
  if (rating < 1 || rating > 5) return NextResponse.json({ error: 'Rating must be 1-5' }, { status: 400 });

  const supabase = createAdminClient();
  const { error } = await supabase
    .from('app_reviews')
    .upsert({ subscription_id: subscriptionId, rating, comment: comment ?? null, updated_at: new Date().toISOString() }, { onConflict: 'subscription_id' });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
