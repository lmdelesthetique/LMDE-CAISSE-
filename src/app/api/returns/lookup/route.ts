import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(req: NextRequest) {
  const numero = req.nextUrl.searchParams.get('numero')?.trim();
  if (!numero) return NextResponse.json({ error: 'numero required' }, { status: 400 });

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('returns')
    .select('id, avoir_number, total_amount, avoir_used_amount, avoir_status, refund_type, client_id, product_name, clients(first_name, last_name)')
    .ilike('avoir_number', numero)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Avoir introuvable' }, { status: 404 });

  if (data.refund_type !== 'store_credit') {
    return NextResponse.json({ error: 'Cet avoir n\'est pas un avoir client (type: ' + data.refund_type + ')' }, { status: 400 });
  }
  if (data.avoir_status === 'used') {
    return NextResponse.json({ error: 'Cet avoir a déjà été utilisé' }, { status: 400 });
  }

  // Compute the remaining amount on this specific return record
  const originalAmount = parseFloat(data.total_amount ?? '0');
  const alreadyUsed = parseFloat(data.avoir_used_amount ?? '0');
  const returnRemaining = Math.max(0, originalAmount - alreadyUsed);

  // Cap against client's actual store_credit — prevents double-spending when avoir was
  // consumed via the POS button (which deducts store_credit but doesn't update avoir_used_amount).
  let applicableAmount = returnRemaining;
  if (data.client_id) {
    const { data: cl } = await supabase
      .from('clients')
      .select('store_credit')
      .eq('id', data.client_id)
      .maybeSingle();
    if (cl !== null) {
      const actualBalance = parseFloat(cl.store_credit ?? '0');
      applicableAmount = Math.min(returnRemaining, actualBalance);
    }
  }

  if (applicableAmount < 0.01) {
    return NextResponse.json({ error: 'Cet avoir a déjà été entièrement utilisé' }, { status: 400 });
  }

  const client = Array.isArray(data.clients) ? data.clients[0] : data.clients as any;
  return NextResponse.json({
    id: data.id,
    avoirNumber: data.avoir_number,
    amount: Math.round(applicableAmount * 100) / 100,
    avoirStatus: data.avoir_status,
    productName: data.product_name,
    clientName: client ? `${client.first_name} ${client.last_name}`.trim() : null,
    clientId: data.client_id,
  });
}
