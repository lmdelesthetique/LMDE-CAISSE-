import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// POST — mark a chat attachment as the final supplier invoice for this order
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { invoiceUrl, invoiceName } = await req.json();
  if (!invoiceUrl) return NextResponse.json({ error: 'invoiceUrl requis' }, { status: 400 });

  const supabase = createAdminClient();

  const { error } = await supabase
    .from('fo_orders')
    .update({
      supplier_invoice_url: invoiceUrl,
      invoice_received_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  try {
    const { data: order } = await supabase
      .from('fo_orders')
      .select('order_status, order_number')
      .eq('id', id)
      .single();

    await supabase.from('fo_status_history').insert({
      order_id: id,
      old_status: order?.order_status,
      new_status: order?.order_status,
      changed_by: 'Admin',
      comment: `Facture finale sélectionnée depuis la messagerie${invoiceName ? ` : ${invoiceName}` : ''}`,
      changed_at: new Date().toISOString(),
    });
  } catch { /* non-blocking */ }

  return NextResponse.json({ ok: true });
}
