import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// POST /api/livraisons — create a delivery (from ticket or manually)
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: 'Corps JSON invalide' }, { status: 400 });

    const {
      client_name,
      client_phone,
      delivery_address,
      delivery_notes,
      products,
      total_amount,
      receipt_id,
      shopify_order_id,
      assigned_to_driver,
    } = body;

    if (!client_name || !delivery_address) {
      return NextResponse.json({ error: 'client_name et delivery_address requis' }, { status: 400 });
    }

    const supabase = createAdminClient();

    const insertData: Record<string, unknown> = {
      client_name,
      client_phone: client_phone || null,
      delivery_address,
      delivery_notes: delivery_notes || null,
      products: products || null,
      total_amount: total_amount ?? null,
      receipt_id: receipt_id || null,
      shopify_order_id: shopify_order_id || null,
      status: assigned_to_driver ? 'assigned' : 'pending',
    };

    if (assigned_to_driver) {
      insertData.assigned_to_driver = assigned_to_driver;
      insertData.assigned_at = new Date().toISOString();
    }

    const { data: delivery, error: delivError } = await supabase
      .from('deliveries')
      .insert(insertData)
      .select()
      .single();

    if (delivError) return NextResponse.json({ error: delivError.message }, { status: 500 });

    // Link receipt → delivery (non-blocking on failure)
    if (receipt_id) {
      const { error: linkErr } = await supabase
        .from('receipts')
        .update({ has_delivery: true, delivery_id: delivery.id })
        .eq('id', receipt_id);
      if (linkErr) console.error('[livraisons/POST] receipt link failed:', linkErr.message);
    }

    // Push notification to driver (fire-and-forget)
    if (assigned_to_driver) {
      const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
      fetch(`${baseUrl}/api/push/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          driverId: assigned_to_driver,
          title: '🚚 Nouvelle livraison !',
          pushBody: `${client_name} — ${delivery_address}`,
          url: '/livreur/dashboard',
        }),
      }).catch((err) => console.error('[livraisons/POST] push failed:', err));
    }

    return NextResponse.json({ delivery }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
