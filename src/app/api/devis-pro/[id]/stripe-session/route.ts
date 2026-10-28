import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

type Ctx = { params: Promise<{ id: string }> };

export const runtime = 'nodejs';

export async function POST(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) return NextResponse.json({ error: 'Stripe non configuré' }, { status: 500 });

  const supabase = createAdminClient();

  const { data: devis, error } = await supabase
    .from('devis_pro')
    .select('id, numero, client_pays, paye_total, statut, client:clients(id, first_name, last_name, email)')
    .eq('id', id)
    .single();

  if (error || !devis) return NextResponse.json({ error: 'Devis introuvable' }, { status: 404 });
  if (['livre', 'annule'].includes(devis.statut)) {
    return NextResponse.json({ error: 'Ce devis est clôturé — impossible de créer un lien de paiement.' }, { status: 400 });
  }

  const clientPays = Number(devis.client_pays) || 0;
  const payeTotal = Number(devis.paye_total) || 0;
  const remaining = Math.max(0, clientPays - payeTotal);

  if (remaining < 0.50) {
    return NextResponse.json({ error: 'Ce devis est déjà entièrement payé.' }, { status: 400 });
  }

  const client = devis.client as any;
  const clientEmail = client?.email ?? undefined;
  const clientName = client
    ? `${client.first_name ?? ''} ${client.last_name ?? ''}`.trim()
    : undefined;

  const Stripe = (await import('stripe')).default;
  const stripe = new Stripe(stripeKey);

  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://lmdecaisse.com').replace(/\/$/, '');
  const cents = Math.round(remaining * 100);

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
            name: `Commande ${devis.numero ?? id} — Le Monde de l'Esthétique`,
            description: clientName ? `Devis professionnel pour ${clientName}` : 'Devis professionnel',
          },
        },
        quantity: 1,
      }],
      success_url: `${siteUrl}/devis-pro?stripe=success&devis=${id}`,
      cancel_url: `${siteUrl}/devis-pro?stripe=cancelled&devis=${id}`,
      metadata: {
        type: 'devis-pro',
        devis_id: id,
        devis_numero: devis.numero ?? '',
        amount: String(remaining),
      },
    });

    return NextResponse.json({ url: session.url, amount: remaining });
  } catch (err: any) {
    console.error('[devis-pro/stripe-session]', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
