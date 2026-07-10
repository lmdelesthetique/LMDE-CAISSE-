import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// GET — return all messages for this supplier (admin client bypasses RLS)
export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  const supabase = createAdminClient();

  // Verify token
  const { data: supplier } = await supabase
    .from('suppliers')
    .select('id')
    .eq('portal_login', params.token)
    .maybeSingle();

  if (!supplier) return NextResponse.json({ error: 'Token invalide' }, { status: 404 });

  const { data, error } = await supabase
    .from('supplier_messages')
    .select('id, created_at, content, sender, sender_type, message_type, is_read, order_id, attachment_url, attachment_name, attachment_type')
    .eq('supplier_id', supplier.id)
    .order('created_at', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Mark admin messages as read
  const unread = (data ?? []).filter((m: any) => m.sender === 'store' && !m.is_read).map((m: any) => m.id);
  if (unread.length > 0) {
    await supabase.from('supplier_messages').update({ is_read: true }).in('id', unread);
  }

  return NextResponse.json({ messages: data ?? [], supplierId: supplier.id });
}
