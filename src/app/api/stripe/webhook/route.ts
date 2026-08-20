import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// Required: disable body parsing so Stripe signature verification works
export const config = { api: { bodyParser: false } };

export async function POST(req: NextRequest) {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!stripeKey || !webhookSecret) {
    console.error('[stripe/webhook] Missing STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET');
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 500 });
  }

  const body = await req.text();
  const signature = req.headers.get('stripe-signature');

  if (!signature) {
    return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 });
  }

  let event: any;
  try {
    const Stripe = (await import('stripe')).default;
    const stripe = new Stripe(stripeKey);
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err: any) {
    console.error('[stripe/webhook] Signature verification failed:', err.message);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  const supabase = createAdminClient();

  switch (event.type) {
    // ── 1. Paiement initial réussi → activer l'abonnement
    case 'checkout.session.completed': {
      const session = event.data.object;
      const email: string | undefined = session.customer_details?.email ?? session.customer_email ?? undefined;
      const stripeSubscriptionId: string | undefined = session.subscription;
      const stripeCustomerId: string | undefined = typeof session.customer === 'string' ? session.customer : session.customer?.id;

      if (!email && !stripeCustomerId) break;

      const activateUpdates = {
        status: 'active',
        ...(stripeSubscriptionId ? { stripe_subscription_id: stripeSubscriptionId } : {}),
        ...(email ? { payment_email: email } : {}),
      };

      // Tentative 1 (principale) : trouver l'abonnement pending directement par payment_email
      // C'est le chemin le plus fiable pour les abonnées Box Beauté
      if (email) {
        const { data: subByPaymentEmail } = await supabase
          .from('client_subscriptions')
          .select('id')
          .ilike('payment_email', email)
          .eq('status', 'pending')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (subByPaymentEmail) {
          await supabase.from('client_subscriptions').update(activateUpdates).eq('id', subByPaymentEmail.id);
          console.log('[stripe/webhook] Abonnement activé via payment_email:', subByPaymentEmail.id);
          break;
        }
      }

      // Tentative 2 : stripe_customer_id (abonnées existantes avec historique Stripe)
      if (stripeCustomerId) {
        const { data: subByCustomer } = await supabase
          .from('client_subscriptions')
          .select('id')
          .eq('stripe_customer_id', stripeCustomerId)
          .eq('status', 'pending')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (subByCustomer) {
          await supabase.from('client_subscriptions').update(activateUpdates).eq('id', subByCustomer.id);
          console.log('[stripe/webhook] Abonnement activé via stripe_customer_id:', subByCustomer.id);
          break;
        }
      }

      // Tentative 3 : email dans la table clients → client_id → abonnement pending
      if (email) {
        const { data: clientByEmail } = await supabase
          .from('clients')
          .select('id')
          .ilike('email', email)
          .maybeSingle();

        if (clientByEmail) {
          const { data: sub } = await supabase
            .from('client_subscriptions')
            .select('id')
            .eq('client_id', clientByEmail.id)
            .eq('status', 'pending')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (sub) {
            await supabase.from('client_subscriptions').update(activateUpdates).eq('id', sub.id);
            console.log('[stripe/webhook] Abonnement activé via clients.email:', sub.id);
            break;
          }
        }
      }

      console.warn('[stripe/webhook] checkout.session.completed: abonnement pending introuvable — email:', email, 'customer:', stripeCustomerId);
      break;
    }

    // ── 2. Renouvellement mensuel réussi → réactiver si suspendu (ou activer si pending avec stripe_subscription_id)
    case 'invoice.payment_succeeded': {
      const invoice = event.data.object;
      const stripeSubscriptionId: string | undefined = invoice.subscription;
      if (!stripeSubscriptionId) break;

      await supabase
        .from('client_subscriptions')
        .update({ status: 'active' })
        .eq('stripe_subscription_id', stripeSubscriptionId)
        .in('status', ['suspended', 'pending']);

      console.log('[stripe/webhook] Abonnement activé/réactivé après paiement:', stripeSubscriptionId);
      break;
    }

    // ── 3. Paiement échoué → suspendre uniquement les actifs (pas les pending non encore activés)
    case 'invoice.payment_failed': {
      const invoice = event.data.object;
      const stripeSubscriptionId: string | undefined = invoice.subscription;
      if (!stripeSubscriptionId) break;

      await supabase
        .from('client_subscriptions')
        .update({ status: 'suspended' })
        .eq('stripe_subscription_id', stripeSubscriptionId)
        .eq('status', 'active');

      console.log('[stripe/webhook] Abonnement suspendu — paiement échoué:', stripeSubscriptionId);
      break;
    }

    // ── 4. Abonnement annulé côté Stripe → désactiver
    case 'customer.subscription.deleted': {
      const stripeSub = event.data.object;
      await supabase
        .from('client_subscriptions')
        .update({ status: 'inactive' })
        .eq('stripe_subscription_id', stripeSub.id);

      console.log('[stripe/webhook] Abonnement désactivé (annulé Stripe):', stripeSub.id);
      break;
    }

    default:
      // Ignorer les autres événements
      break;
  }

  return NextResponse.json({ received: true });
}
