import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const maxDuration = 60;

// GET  — preview: list inactive subs with their Stripe status
// POST — execute: cancel all active Stripe subs that are inactive in DB
export async function GET(req: NextRequest) {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) return NextResponse.json({ error: 'STRIPE_SECRET_KEY manquant' }, { status: 500 });

  const supabase = createAdminClient();
  const Stripe = (await import('stripe')).default;
  const stripe = new Stripe(stripeKey);

  const { data: subs, error } = await supabase
    .from('client_subscriptions')
    .select(`
      id, status, stripe_subscription_id,
      client:clients(first_name, last_name, email)
    `)
    .not('stripe_subscription_id', 'is', null)
    .in('status', ['inactive', 'cancelled']);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const results = await Promise.all((subs ?? []).map(async (sub: any) => {
    const client = Array.isArray(sub.client) ? sub.client[0] : sub.client;
    try {
      const stripeSub = await stripe.subscriptions.retrieve(sub.stripe_subscription_id);
      return {
        id: sub.id,
        client_name: client ? `${client.first_name ?? ''} ${client.last_name ?? ''}`.trim() : '—',
        stripe_subscription_id: sub.stripe_subscription_id,
        db_status: sub.status,
        stripe_status: stripeSub.status,
        needs_cancel: stripeSub.status === 'active' || stripeSub.status === 'trialing',
      };
    } catch (err: any) {
      return {
        id: sub.id,
        client_name: client ? `${client.first_name ?? ''} ${client.last_name ?? ''}`.trim() : '—',
        stripe_subscription_id: sub.stripe_subscription_id,
        db_status: sub.status,
        stripe_status: 'error',
        stripe_error: err.message,
        needs_cancel: false,
      };
    }
  }));

  const toCancel = results.filter(r => r.needs_cancel);
  return NextResponse.json({ total: results.length, to_cancel: toCancel.length, results });
}

export async function POST(req: NextRequest) {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) return NextResponse.json({ error: 'STRIPE_SECRET_KEY manquant' }, { status: 500 });

  const supabase = createAdminClient();
  const Stripe = (await import('stripe')).default;
  const stripe = new Stripe(stripeKey);

  // Load all inactive subs with a Stripe ID
  const { data: subs, error } = await supabase
    .from('client_subscriptions')
    .select('id, status, stripe_subscription_id, client:clients(first_name, last_name)')
    .not('stripe_subscription_id', 'is', null)
    .in('status', ['inactive', 'cancelled']);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const cancelled: string[] = [];
  const already_cancelled: string[] = [];
  const errors: { id: string; stripe_id: string; error: string }[] = [];

  for (const sub of subs ?? []) {
    const stripeId = (sub as any).stripe_subscription_id;
    try {
      const stripeSub = await stripe.subscriptions.retrieve(stripeId);
      if (stripeSub.status === 'active' || stripeSub.status === 'trialing') {
        await stripe.subscriptions.cancel(stripeId);
        cancelled.push(stripeId);
        console.log('[sync-stripe-cancellations] cancelled:', stripeId, 'sub:', sub.id);
      } else {
        already_cancelled.push(stripeId);
      }
    } catch (err: any) {
      // "No such subscription" means already deleted — not an error
      if (err.code === 'resource_missing') {
        already_cancelled.push(stripeId);
      } else {
        errors.push({ id: sub.id, stripe_id: stripeId, error: err.message });
        console.error('[sync-stripe-cancellations] error:', stripeId, err.message);
      }
    }
  }

  return NextResponse.json({
    ok: true,
    cancelled: cancelled.length,
    already_cancelled: already_cancelled.length,
    errors: errors.length,
    cancelled_ids: cancelled,
    error_details: errors,
  });
}
