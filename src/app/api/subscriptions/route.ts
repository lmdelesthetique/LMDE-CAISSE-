import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Compute next billing date from a start date, handling months shorter than
 * the billing day (e.g. subscribing on the 31st → bill on last day of Feb).
 */
function computeNextBillingDate(from: Date, billingDay: number): string {
  const next = new Date(from);
  next.setMonth(next.getMonth() + 1);
  // Cap at last day of that month
  const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
  next.setDate(Math.min(billingDay, lastDay));
  return next.toISOString().split('T')[0];
}

// POST — create a new client subscription
export async function POST(req: NextRequest) {
  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { client_id, plan_id, portal_phone, pin_code, status, launch_offer, next_billing_date } = body;
  if (!client_id || !plan_id) {
    return NextResponse.json({ error: 'client_id and plan_id are required' }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Check duplicate active/suspended subscription
  const { data: existing } = await supabase
    .from('client_subscriptions')
    .select('id')
    .eq('client_id', client_id)
    .in('status', ['active', 'suspended'])
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ error: 'Ce client a déjà un abonnement actif ou suspendu.' }, { status: 409 });
  }

  // Resolve plan name for subscription_type field
  let planName = 'Box Beauté';
  const { data: plan } = await supabase
    .from('subscription_plans')
    .select('name, price')
    .eq('id', plan_id)
    .maybeSingle();
  if (plan?.name) planName = plan.name;

  // Compute billing date — use provided date or auto-compute 1 month from today
  const today = new Date();
  const billingDay = today.getDate(); // day of subscription = billing day every month
  const billingDate = next_billing_date || computeNextBillingDate(today, billingDay);

  const startDate = today.toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('client_subscriptions')
    .insert({
      client_id,
      plan_id,
      portal_phone: portal_phone || null,
      pin_code: pin_code || null,
      status: status || 'active',
      launch_offer: launch_offer ?? false,
      next_billing_date: billingDate,
      // Required legacy columns — prevent NOT NULL violations
      start_date: startDate,
      subscription_type: planName,
      discount_percent: 0,
      auto_renew: true,
    })
    .select()
    .single();

  if (error) {
    console.error('[POST /api/subscriptions]', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Generate Stripe payment link if key is configured
  let stripePaymentUrl: string | null = null;
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const planPrice = plan?.price ?? 0;
  if (stripeKey && !stripeKey.startsWith('your-') && planPrice > 0) {
    try {
      const Stripe = (await import('stripe')).default;
      const stripe = new Stripe(stripeKey);

      // Create a Stripe product price for this plan
      const stripeProduct = await stripe.products.create({
        name: `Box Beauté — ${planName}`,
        metadata: { plan_id, subscription_id: data.id },
      });
      const stripePrice = await stripe.prices.create({
        product: stripeProduct.id,
        unit_amount: Math.round(planPrice * 100),
        currency: 'eur',
        recurring: { interval: 'month' },
      });

      // Create Stripe Checkout session for recurring subscription
      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        line_items: [{ price: stripePrice.id, quantity: 1 }],
        success_url: `${process.env.NEXT_PUBLIC_SITE_URL ?? 'https://lmdecaisse.com'}/client-portal/login?subscribed=1`,
        cancel_url: `${process.env.NEXT_PUBLIC_SITE_URL ?? 'https://lmdecaisse.com'}/client-portal/login`,
        metadata: { subscription_id: data.id, client_id },
      });
      stripePaymentUrl = session.url;

      // Store Stripe session/price references for future cancellation
      await supabase
        .from('client_subscriptions')
        .update({ stripe_subscription_id: stripePrice.id })
        .eq('id', data.id);

    } catch (err: any) {
      console.warn('[POST /api/subscriptions] Stripe error (non-blocking):', err.message);
    }
  }

  return NextResponse.json({
    ...data,
    stripePaymentUrl,
    billingDay,
    billingDate,
  }, { status: 201 });
}
