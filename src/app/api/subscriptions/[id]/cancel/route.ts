import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// POST — cancel a client subscription (admin or client-initiated)
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  let body: any = {};
  try { body = await req.json(); } catch { /* reason is optional */ }

  const reason: string | null = body.reason ?? null;
  const cancelledBy: string = body.cancelledBy ?? 'admin';

  const supabase = createAdminClient();

  // Fetch subscription to verify it exists
  const { data: sub, error: fetchErr } = await supabase
    .from('client_subscriptions')
    .select('id, client_id, status, stripe_subscription_id')
    .eq('id', id)
    .maybeSingle();

  if (fetchErr || !sub) {
    return NextResponse.json({ error: 'Subscription not found' }, { status: 404 });
  }

  // Build update payload — cancelled_at and cancellation_reason may not exist yet
  const updatePayload: any = { status: 'inactive' };
  try {
    updatePayload.cancelled_at = new Date().toISOString();
    updatePayload.cancellation_reason = reason;
    updatePayload.cancelled_by = cancelledBy;
  } catch { /* ignore if columns don't exist */ }

  const { error: updateErr } = await supabase
    .from('client_subscriptions')
    .update(updatePayload)
    .eq('id', id);

  if (updateErr) {
    // Retry with just status update if extra columns don't exist
    const { error: retryErr } = await supabase
      .from('client_subscriptions')
      .update({ status: 'inactive' })
      .eq('id', id);
    if (retryErr) return NextResponse.json({ error: retryErr.message }, { status: 500 });
  }

  // Cancel Stripe subscription if ID is stored
  if (sub.stripe_subscription_id) {
    try {
      const stripeKey = process.env.STRIPE_SECRET_KEY;
      if (stripeKey) {
        const Stripe = (await import('stripe')).default;
        const stripe = new Stripe(stripeKey);
        await stripe.subscriptions.cancel(sub.stripe_subscription_id);
      }
    } catch (err: any) {
      console.warn('[cancel subscription] Stripe cancel failed (non-blocking):', err.message);
    }
  }

  // Notify admin via portal notification if client-initiated
  if (cancelledBy === 'client' && sub.client_id) {
    try {
      const { data: client } = await supabase
        .from('clients')
        .select('first_name, last_name')
        .eq('id', sub.client_id)
        .maybeSingle();
      const name = client ? `${client.first_name} ${client.last_name}` : 'Une cliente';
      console.log(`[cancel subscription] ${name} cancelled — reason: ${reason ?? 'none'}`);
    } catch { /* non-blocking */ }
  }

  return NextResponse.json({ ok: true });
}
