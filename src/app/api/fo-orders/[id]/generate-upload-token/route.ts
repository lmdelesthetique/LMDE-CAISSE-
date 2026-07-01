import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { generateInvoiceToken } from '@/lib/utils/invoiceToken';

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const supabase = createAdminClient();

  // Fetch order number (no need for invoice_upload_token column)
  const { data: order, error } = await supabase
    .from('fo_orders')
    .select('order_number')
    .eq('id', id)
    .maybeSingle();

  if (error || !order) {
    return NextResponse.json({ error: 'Commande introuvable' }, { status: 404 });
  }

  // Token is deterministically derived — always the same for a given order ID
  const token = await generateInvoiceToken(id);

  // Best-effort: save token to DB column if it exists (migration applied)
  try {
    await supabase
      .from('fo_orders')
      .update({ invoice_upload_token: token })
      .eq('id', id);
  } catch { /* column not yet migrated — non-blocking */ }

  return NextResponse.json({ token, orderNumber: order.order_number });
}
