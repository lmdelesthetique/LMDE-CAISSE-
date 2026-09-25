import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

type Ctx = { params: Promise<{ token: string }> };

// GET /api/devis/by-token/[token]
// Initial load (no ?q): returns devis + top 50 in-stock products
// With ?q=term (≥ 2 chars): validates token, returns up to 50 matching products only
export async function GET(req: NextRequest, { params }: Ctx) {
  const { token } = await params;
  const q = req.nextUrl.searchParams.get('q')?.trim() ?? '';
  const supabase = createAdminClient();

  // Search-only mode — validate token then run server-side search
  if (q.length >= 2) {
    const { data: tokenCheck } = await supabase
      .from('devis_pro')
      .select('id')
      .eq('client_token', token)
      .maybeSingle();

    if (!tokenCheck) return NextResponse.json({ error: 'Devis introuvable' }, { status: 404 });

    const { data: products } = await supabase
      .from('products')
      .select('id, name, ref, sell_price_ttc, image_url, stock')
      .gt('stock', 0)
      .or(`name.ilike.%${q}%,ref.ilike.%${q}%`)
      .order('name')
      .limit(50);

    return NextResponse.json({ products: products ?? [] });
  }

  // Initial load: full devis + first 50 products alphabetically
  const { data: devis, error } = await supabase
    .from('devis_pro')
    .select(`
      id, numero, items, discount_pct, credit, total_ttc, client_pays,
      free_shipping, statut, client_response, client_responded_at, notes,
      client:clients(first_name, last_name)
    `)
    .eq('client_token', token)
    .maybeSingle();

  if (error || !devis) return NextResponse.json({ error: 'Devis introuvable' }, { status: 404 });

  const { data: products } = await supabase
    .from('products')
    .select('id, name, ref, sell_price_ttc, image_url, stock')
    .gt('stock', 0)
    .order('name')
    .limit(50);

  return NextResponse.json({ devis, products: products ?? [] });
}

// PATCH /api/devis/by-token/[token] — client submits their response
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { token } = await params;
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const supabase = createAdminClient();

  const { data: devis } = await supabase
    .from('devis_pro')
    .select('id, numero, statut, discount_pct, credit, client_pays, client_response, client:clients(first_name, last_name)')
    .eq('client_token', token)
    .maybeSingle();

  if (!devis) return NextResponse.json({ error: 'Devis introuvable' }, { status: 404 });

  // Already responded — idempotent, return OK
  if ((devis as any).client_response) return NextResponse.json({ ok: true });

  // Devis closed — friendly message
  if (['livre', 'annule'].includes(devis.statut)) {
    return NextResponse.json({ error: 'Ce devis a déjà été traité. Contactez-nous si vous avez une question.' }, { status: 400 });
  }

  const response: 'accepted' | 'modified' = body.response;
  const newStatut = response === 'accepted' ? 'client_valide' : 'client_modifie';

  const patch: Record<string, any> = {
    client_response: response,
    client_responded_at: new Date().toISOString(),
    statut: newStatut,
    updated_at: new Date().toISOString(),
  };

  if (response === 'modified' && Array.isArray(body.items)) {
    const items = body.items;
    patch.items = items;
    const discountPct = Number((devis as any).discount_pct) || 0;
    const rawTotal = items.reduce((s: number, i: any) => {
      if (i.isBonus) return s;
      return s + (Number(i.price) || 0) * (Number(i.qty) || 1);
    }, 0);
    const total = Math.round(rawTotal * (1 - discountPct / 100) * 100) / 100;
    // isBonus items already excluded — do not subtract credit (Budget Pro bonus ≠ monetary avoir)
    const clientPays = Math.max(0, Math.round(total * 100) / 100);
    patch.total_ttc = total;
    patch.client_pays = clientPays;
  }

  const { error } = await supabase.from('devis_pro').update(patch).eq('id', devis.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // ── Push notification to admin ─────────────────────────────────────────────
  try {
    if (process.env.VAPID_PRIVATE_KEY && process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_SUBJECT) {
      const webpush = (await import('web-push')).default;
      webpush.setVapidDetails(
        process.env.VAPID_SUBJECT,
        process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
        process.env.VAPID_PRIVATE_KEY
      );

      const { data: adminSubs } = await supabase
        .from('push_subscriptions')
        .select('endpoint, p256dh, auth')
        .eq('is_admin', true);

      const clientName = (() => {
        const c = (devis as any).client;
        if (!c) return 'Une cliente';
        const obj = Array.isArray(c) ? c[0] : c;
        return `${obj?.first_name || ''} ${obj?.last_name || ''}`.trim() || 'Une cliente';
      })();

      const responseLabel = response === 'accepted' ? 'a accepté' : 'a modifié';
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://lmdecaisse.com';

      const payload = JSON.stringify({
        title: `📬 ${clientName} ${responseLabel} son devis`,
        body: `Devis ${(devis as any).numero ?? ''} — ${(patch.client_pays ?? (devis as any).client_pays ?? 0).toFixed(2)} €`,
        url: `${siteUrl}/devis-pro`,
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
      });

      for (const sub of adminSubs ?? []) {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            payload
          );
        } catch {
          await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
        }
      }
    }
  } catch (pushErr: any) {
    console.warn('[devis/by-token] push notification failed (non-blocking):', pushErr.message);
  }

  return NextResponse.json({ ok: true });
}
