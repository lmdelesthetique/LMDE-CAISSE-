import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import webpush from 'web-push';

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT!,
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
);

// GET — read all messages for a supplier (admin side, bypasses RLS)
export async function GET(req: NextRequest) {
  const supplierId = req.nextUrl.searchParams.get('supplierId');
  if (!supplierId) return NextResponse.json({ error: 'supplierId requis' }, { status: 400 });

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('supplier_messages')
    .select('id, created_at, content, sender, sender_type, message_type, is_read, order_id, attachment_url, attachment_name, attachment_type')
    .eq('supplier_id', supplierId)
    .order('created_at', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Mark supplier messages as read
  const unread = (data ?? []).filter((m: any) => m.sender === 'supplier' && !m.is_read).map((m: any) => m.id);
  if (unread.length > 0) {
    await supabase.from('supplier_messages').update({ is_read: true }).in('id', unread);
  }

  return NextResponse.json({ messages: data ?? [] });
}

// POST — send a message (supplier portal or admin)
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { supplierId, content, messageType, attachmentUrl, attachmentName, attachmentType, orderId, sender } = body;

  if (!supplierId) return NextResponse.json({ error: 'supplierId requis' }, { status: 400 });
  if (!content && !attachmentUrl) return NextResponse.json({ error: 'content ou attachmentUrl requis' }, { status: 400 });

  const supabase = createAdminClient();
  const isAdmin = sender === 'store';

  const { error } = await supabase.from('supplier_messages').insert({
    supplier_id: supplierId,
    sender: isAdmin ? 'store' : 'supplier',
    sender_type: isAdmin ? 'admin' : 'supplier',
    content: content || null,
    message_type: messageType || 'text',
    attachment_url: attachmentUrl || null,
    attachment_name: attachmentName || null,
    attachment_type: attachmentType || null,
    order_id: orderId || null,
    is_read: false,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Send push notification to supplier when admin sends a message
  if (isAdmin) {
    const { data: subs } = await supabase
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth')
      .eq('supplier_id', supplierId);

    const { data: supplierRow } = await supabase
      .from('suppliers')
      .select('portal_login')
      .eq('id', supplierId)
      .maybeSingle();

    const portalUrl = supplierRow?.portal_login
      ? `${process.env.NEXT_PUBLIC_SITE_URL}/supplier-portal/${supplierRow.portal_login}`
      : `${process.env.NEXT_PUBLIC_SITE_URL}/supplier-portal/login`;

    const payload = JSON.stringify({
      title: '💬 Nouveau message boutique',
      body: content
        ? content.length > 80 ? content.slice(0, 80) + '…' : content
        : attachmentName || 'Nouveau fichier reçu',
      url: portalUrl,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
    });

    for (const sub of subs ?? []) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload
        );
      } catch {
        // Subscription expirée — la supprimer
        await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
      }
    }
  }

  return NextResponse.json({ ok: true });
}
