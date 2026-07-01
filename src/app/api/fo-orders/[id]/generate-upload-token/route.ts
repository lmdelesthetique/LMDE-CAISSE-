import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const supabase = createAdminClient();

  // Reuse existing token if already generated
  const { data: existing } = await supabase
    .from('fo_orders')
    .select('invoice_upload_token, order_number')
    .eq('id', id)
    .single();

  if (existing?.invoice_upload_token) {
    return NextResponse.json({
      token: existing.invoice_upload_token,
      orderNumber: existing.order_number,
    });
  }

  const token = crypto.randomUUID();
  const { error } = await supabase
    .from('fo_orders')
    .update({ invoice_upload_token: token })
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ token, orderNumber: existing?.order_number });
}
