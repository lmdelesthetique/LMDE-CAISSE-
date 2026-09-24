import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyClientSession } from '@/lib/api/verifyClientSession';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const subscriptionId = req.headers.get('x-subscription-id');
  const sessionToken = req.headers.get('x-session-token');
  const authErr = await verifyClientSession(subscriptionId, sessionToken);
  if (authErr) return authErr;

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { orderId, productId, productName, colorVariant, quantity, unitSellPrice, unitBuyPrice, surplusAmount } = body;
  if (!orderId || !productId || !surplusAmount || !productName) {
    return NextResponse.json({ error: 'orderId, productId, productName, surplusAmount requis' }, { status: 400 });
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) return NextResponse.json({ error: 'Stripe non configuré' }, { status: 500 });

  const supabase = createAdminClient();

  // Get client email for Stripe prefill
  const { data: sub } = await supabase
    .from('client_subscriptions')
    .select('client_id')
    .eq('id', subscriptionId)
    .maybeSingle();

  let clientEmail: string | undefined;
  if (sub?.client_id) {
    const { data: client } = await supabase
      .from('clients')
      .select('email')
      .eq('id', sub.client_id)
      .maybeSingle();
    clientEmail = (client as any)?.email ?? undefined;
  }

  const Stripe = (await import('stripe')).default;
  const stripe = new Stripe(stripeKey);

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://lmdecaisse.com';
  const cents = Math.max(50, Math.round(Number(surplusAmount) * 100));

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      customer_email: clientEmail,
      line_items: [{
        price_data: {
          currency: 'eur',
          unit_amount: cents,
          product_data: {
            name: `Surplus Ma Box Beauté — ${productName}${colorVariant ? ` (${colorVariant})` : ''}`,
            description: 'Supplément au-delà de votre quota mensuel',
          },
        },
        quantity: 1,
      }],
      success_url: `${siteUrl}/client-portal/dashboard?surplus=success`,
      cancel_url: `${siteUrl}/client-portal/dashboard?surplus=cancelled`,
      metadata: {
        type: 'surplus',
        subscription_id: subscriptionId!,
        order_id: orderId,
        product_id: productId,
        color_variant: colorVariant ?? '',
        quantity: String(quantity ?? 1),
        unit_sell_price: String(unitSellPrice ?? 0),
        unit_buy_price: String(unitBuyPrice ?? 0),
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (err: any) {
    console.error('[create-surplus-session]', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
