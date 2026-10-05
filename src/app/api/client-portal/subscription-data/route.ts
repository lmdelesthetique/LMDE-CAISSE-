import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyClientSession } from '@/lib/api/verifyClientSession';

export const runtime = 'nodejs';

// GET /api/client-portal/subscription-data?subscriptionId=... — subscription + plan data
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const subscriptionId = searchParams.get('subscriptionId');
  const sessionToken = req.headers.get('x-session-token');

  const authErr = await verifyClientSession(subscriptionId, sessionToken);
  if (authErr) return authErr;

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('client_subscriptions')
    .select('next_billing_date, status, payment_email, plan:subscription_plans(id, name, price, quota_amount, shipping_free, shipping_cost, description, is_active)')
    .eq('id', subscriptionId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? null);
}
