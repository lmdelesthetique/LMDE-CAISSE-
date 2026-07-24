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

      // Tentative 1 : trouver la cliente par email exact
      let clientId: string | null = null;
      if (email) {
        const { data: clientByEmail } = await supabase
          .from('clients')
          .select('id')
          .ilike('email', email)
          .maybeSingle();
        if (clientByEmail) clientId = clientByEmail.id;
      }

      // Tentative 2 : si email ne correspond pas, chercher l'abonnement pending avec le même stripe_customer_id
      if (!clientId && stripeCustomerId) {
        const { data: subByCustomer } = await supabase
          .from('client_subscriptions')
          .select('id, client_id')
          .eq('stripe_customer_id', stripeCustomerId)
          .eq('status', 'pending')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (subByCustomer) {
          // Activer directement
          await supabase
            .from('client_subscriptions')
            .update({
              status: 'active',
              ...(stripeSubscriptionId ? { stripe_subscription_id: stripeSubscriptionId } : {}),
              ...(email ? { payment_email: email } : {}),
            })
            .eq('id', subByCustomer.id);
          console.log('[stripe/webhook] Abonnement activé via customer_id:', subByCustomer.id);
          break;
        }
      }

      // Tentative 3 : si toujours pas trouvé, activer le dernier abonnement pending global
      // (dernier recours quand email Stripe ≠ email admin — évite de rater le paiement)
      if (!clientId && email) {
        // Essayer une correspondance partielle : prénom/nom dans clients
        const nameParts = (session.customer_details?.name ?? '').trim().split(/\s+/);
        if (nameParts.length >= 1) {
          const { data: clientByName } = await supabase
            .from('clients')
            .select('id')
            .ilike('name', `%${nameParts[0]}%`)
            .maybeSingle();
          if (clientByName) clientId = clientByName.id;
        }
      }

      if (!clientId) {
        console.warn('[stripe/webhook] checkout.session.completed: client introuvable — email:', email, 'customer:', stripeCustomerId);
        break;
      }

      // Trouver son abonnement en attente (le plus récent)
      const { data: sub } = await supabase
        .from('client_subscriptions')
        .select('id')
        .eq('client_id', clientId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!sub) {
        console.warn('[stripe/webhook] checkout.session.completed: aucun abonnement pending pour client', clientId);
        break;
      }

      // Activer + stocker l'ID Stripe subscription pour le suivi des renouvellements
      await supabase
        .from('client_subscriptions')
        .update({
          status: 'active',
          ...(stripeSubscriptionId ? { stripe_subscription_id: stripeSubscriptionId } : {}),
          ...(email ? { payment_email: email } : {}),
        })
        .eq('id', sub.id);

      console.log('[stripe/webhook] Abonnement activé:', sub.id, '→ stripe sub:', stripeSubscriptionId, '→ email Stripe:', email);
      break;
    }

    // ── 2. Renouvellement mensuel réussi → réactiver si suspendu
    case 'invoice.payment_succeeded': {
      const invoice = event.data.object;
      const stripeSubscriptionId: string | undefined = invoice.subscription;
      if (!stripeSubscriptionId) break;

      const { error } = await supabase
        .from('client_subscriptions')
        .update({ status: 'active' })
        .eq('stripe_subscription_id', stripeSubscriptionId)
        .eq('status', 'suspended');

      if (!error) console.log('[stripe/webhook] Abonnement réactivé après paiement réussi:', stripeSubscriptionId);
      break;
    }

    // ── 3. Paiement échoué → suspendre
    case 'invoice.payment_failed': {
      const invoice = event.data.object;
      const stripeSubscriptionId: string | undefined = invoice.subscription;
      if (!stripeSubscriptionId) break;

      await supabase
        .from('client_subscriptions')
        .update({ status: 'suspended' })
        .eq('stripe_subscription_id', stripeSubscriptionId)
        .in('status', ['active', 'pending']);

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
