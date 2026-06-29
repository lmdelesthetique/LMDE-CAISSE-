import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendWhatsApp, sendNotifLivreurNouvelleLivraison, msgLivreurAnnulation } from '@/lib/whatsappService';

// PATCH /api/livraisons/[id] — assign driver or update status
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: 'Corps JSON invalide' }, { status: 400 });

    const updates: Record<string, unknown> = {};

    if (body.assigned_to_driver !== undefined) {
      updates.assigned_to_driver = body.assigned_to_driver || null;
      if (body.assigned_to_driver) {
        updates.status = 'assigned';
        updates.assigned_at = new Date().toISOString();
      } else {
        updates.status = 'pending';
        updates.assigned_at = null;
      }
    }

    if (body.status !== undefined) updates.status = body.status;
    if (body.en_route_at !== undefined) updates.en_route_at = body.en_route_at;
    if (body.delivered_at !== undefined) updates.delivered_at = body.delivered_at;
    if (body.driver_notes !== undefined) updates.driver_notes = body.driver_notes;

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('deliveries')
      .update(updates)
      .eq('id', id)
      .select('*, drivers(first_name, last_name, phone)')
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const delivery = data as any;
    const driver = delivery.drivers;

    // WhatsApp to driver on assignment (non-blocking)
    if (body.assigned_to_driver && driver?.phone) {
      sendNotifLivreurNouvelleLivraison(
        driver.phone,
        driver.first_name ?? 'Livreur',
        delivery.client_name ?? '',
        delivery.delivery_address ?? ''
      ).catch((err) => console.error('[livraisons] WhatsApp failed (non-blocking):', err));
    }

    // WhatsApp to driver on cancellation (non-blocking)
    if (body.status === 'cancelled' && driver?.phone) {
      sendWhatsApp({
        to: driver.phone,
        message: msgLivreurAnnulation(
          driver.first_name ?? 'Livreur',
          delivery.client_name ?? 'un client'
        ),
      }).catch((err) => console.error('[livraisons] WhatsApp cancel failed (non-blocking):', err));
    }

    return NextResponse.json({ delivery: data });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
