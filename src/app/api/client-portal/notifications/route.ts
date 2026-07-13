import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// GET — fetch notifications for a client
// ?countOnly=true → returns only unreadCount (no mark-as-read)
export async function GET(req: NextRequest) {
  const clientId = req.nextUrl.searchParams.get('clientId');
  const countOnly = req.nextUrl.searchParams.get('countOnly') === 'true';
  if (!clientId) return NextResponse.json({ error: 'clientId requis' }, { status: 400 });

  const supabase = createAdminClient();

  if (countOnly) {
    const { count } = await supabase
      .from('client_notifications')
      .select('id', { count: 'exact', head: true })
      .eq('client_id', clientId)
      .eq('is_read', false);
    return NextResponse.json({ unreadCount: count ?? 0 });
  }

  const { data, error } = await supabase
    .from('client_notifications')
    .select('id, created_at, title, message, type, is_read')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Mark all as read
  const unread = (data ?? []).filter(n => !n.is_read).map(n => n.id);
  if (unread.length > 0) {
    await supabase.from('client_notifications').update({ is_read: true }).in('id', unread);
  }

  return NextResponse.json({ notifications: data ?? [], unreadCount: unread.length });
}

// POST — create a notification for a client (called from admin actions)
export async function POST(req: NextRequest) {
  const { clientId, title, message, type } = await req.json();
  if (!clientId || !message) return NextResponse.json({ error: 'clientId et message requis' }, { status: 400 });

  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('client_notifications')
    .insert({ client_id: clientId, title: title || 'Information', message, type: type || 'info' })
    .select('id')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Send push notification if client has a subscription
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
  fetch(`${baseUrl}/api/push/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      clientId,
      title: title || 'Information',
      pushBody: message,
      url: `${baseUrl}/client-portal/dashboard`,
    }),
  }).catch(() => {});

  return NextResponse.json({ ok: true, id: data.id });
}
