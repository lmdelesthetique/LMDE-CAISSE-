import { NextResponse } from 'next/server';

export async function GET() {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey || stripeKey.startsWith('your-')) {
    return NextResponse.json({ error: 'Stripe non configuré' }, { status: 500 });
  }

  try {
    const Stripe = (await import('stripe')).default;
    const stripe = new Stripe(stripeKey);

    // Fetch last 100 invoices (covers payments + failures)
    const [invoicesRes, subsRes] = await Promise.all([
      stripe.invoices.list({ limit: 100, expand: ['data.subscription', 'data.customer'] }),
      stripe.subscriptions.list({ limit: 100, status: 'all', expand: ['data.customer'] }),
    ]);

    const now = Math.floor(Date.now() / 1000);
    const startOfMonth = Math.floor(new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime() / 1000);

    // Map invoices to a clean format
    const payments = invoicesRes.data.map((inv: any) => {
      const customer = inv.customer as any;
      const sub = inv.subscription as any;
      return {
        id: inv.id,
        status: inv.status, // paid | open | void | uncollectible
        amount: inv.amount_paid / 100,
        amountDue: inv.amount_due / 100,
        currency: inv.currency,
        date: inv.created,
        periodStart: inv.period_start,
        periodEnd: inv.period_end,
        email: customer?.email ?? inv.customer_email ?? '—',
        customerName: customer?.name ?? '—',
        description: inv.description ?? sub?.metadata?.plan ?? '—',
        hostedUrl: inv.hosted_invoice_url,
        attempt: inv.attempt_count,
        nextAttempt: inv.next_payment_attempt,
        subscriptionId: typeof inv.subscription === 'string' ? inv.subscription : sub?.id,
      };
    });

    // Map active/past_due subscriptions
    const subscriptions = subsRes.data.map((sub: any) => {
      const customer = sub.customer as any;
      const item = sub.items?.data?.[0];
      return {
        id: sub.id,
        status: sub.status, // active | past_due | canceled | trialing | unpaid
        email: customer?.email ?? '—',
        customerName: customer?.name ?? '—',
        amount: item ? item.price.unit_amount / 100 : 0,
        currency: item?.price.currency ?? 'eur',
        interval: item?.price.recurring?.interval ?? 'month',
        currentPeriodEnd: sub.current_period_end,
        createdAt: sub.created,
        cancelAtPeriodEnd: sub.cancel_at_period_end,
      };
    });

    // Stats
    const paidThisMonth = payments.filter(p => p.status === 'paid' && p.date >= startOfMonth);
    const failedThisMonth = payments.filter(p => p.status === 'open' && p.date >= startOfMonth && p.attempt > 0);
    const revenueThisMonth = paidThisMonth.reduce((s, p) => s + p.amount, 0);
    const activeCount = subscriptions.filter(s => s.status === 'active').length;
    const pastDueCount = subscriptions.filter(s => s.status === 'past_due').length;
    const newThisMonth = subscriptions.filter(s => s.createdAt >= startOfMonth).length;

    return NextResponse.json({
      stats: {
        activeCount,
        pastDueCount,
        revenueThisMonth,
        newThisMonth,
        paidThisMonthCount: paidThisMonth.length,
        failedThisMonthCount: failedThisMonth.length,
      },
      payments: payments.slice(0, 60),
      subscriptions,
    });
  } catch (e: any) {
    console.error('[stripe/dashboard]', e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
