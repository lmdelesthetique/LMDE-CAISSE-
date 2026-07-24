import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

function computeNextBillingDate(from: Date, billingDay: number): string {
  const next = new Date(from);
  next.setMonth(next.getMonth() + 1);
  const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
  next.setDate(Math.min(billingDay, lastDay));
  return next.toISOString().split('T')[0];
}

// Static Stripe Payment Links — permanent URLs, no API calls needed
const STRIPE_PAYMENT_LINKS: Record<string, string> = {
  starter: 'https://buy.stripe.com/14A4gAdjtgy3cb89pJ7IY06',
  pro:     'https://buy.stripe.com/aFa28sdjt95B2Ay45p7IY08',
  elite:   'https://buy.stripe.com/6oUdRaa7h3Lh8YWeK37IY07',
};

function resolveStripePaymentLink(planName: string, email?: string | null): string | null {
  const lower = planName.toLowerCase();
  let baseUrl: string | null = null;
  for (const [key, url] of Object.entries(STRIPE_PAYMENT_LINKS)) {
    if (lower.includes(key)) { baseUrl = url; break; }
  }
  if (!baseUrl) return null;
  // Pre-fill client email in Stripe checkout if available
  return email ? `${baseUrl}?prefilled_email=${encodeURIComponent(email)}` : baseUrl;
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
      status: status || 'pending',
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

  // Resolve static Stripe Payment Link — fetch client email for pre-fill
  let stripePaymentUrl: string | null = null;
  try {
    const { data: client } = await supabase
      .from('clients')
      .select('email')
      .eq('id', client_id)
      .maybeSingle();
    stripePaymentUrl = resolveStripePaymentLink(planName, client?.email);
  } catch {
    stripePaymentUrl = resolveStripePaymentLink(planName, null);
  }

  return NextResponse.json({
    ...data,
    stripePaymentUrl,
    billingDay,
    billingDate,
  }, { status: 201 });
}
