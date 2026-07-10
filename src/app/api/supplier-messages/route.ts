import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// POST — send a message from the supplier (used by token-based portal)
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { supplierId, content, messageType, attachmentUrl, attachmentName, attachmentType, orderId } = body;

  if (!supplierId) return NextResponse.json({ error: 'supplierId requis' }, { status: 400 });
  if (!content && !attachmentUrl) return NextResponse.json({ error: 'content ou attachmentUrl requis' }, { status: 400 });

  const supabase = createAdminClient();

  const { error } = await supabase.from('supplier_messages').insert({
    supplier_id: supplierId,
    sender: 'supplier',
    sender_type: 'supplier',
    content: content || null,
    message_type: messageType || 'text',
    attachment_url: attachmentUrl || null,
    attachment_name: attachmentName || null,
    attachment_type: attachmentType || null,
    order_id: orderId || null,
    is_read: false,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
