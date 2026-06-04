import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

async function sendPushSilently(driverId: string, title: string, pushBody: string) {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
    await fetch(`${baseUrl}/api/push/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ driverId, title, pushBody, url: '/livreur/dashboard' }),
    });
  } catch (err) {
    // Push failure must never block delivery assignment
    console.error('[livraisons] push failed (non-blocking):', err);
  }
}

// PATCH /api/livraisons/[id] — assign driver or update status
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: 'Corps JSON invalide' }, { status: 400 });

    const updates: Record<string, unknown> = {};
    let triggerPush: (() => void) | null = null;

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

    // Build push notification after successful DB write
    if (body.assigned_to_driver) {
      const delivery = data as any;
      const clientInfo = [delivery.client_name, delivery.delivery_address]
        .filter(Boolean).join(' — ');
      triggerPush = () =>
        sendPushSilently(
          body.assigned_to_driver,
          '🚚 Nouvelle livraison assignée',
          clientInfo || 'Vérifiez le portail livreur'
        );
    } else if (body.status === 'cancelled' && data) {
      const delivery = data as any;
      const driverId = delivery.assigned_to_driver;
      if (driverId) {
        triggerPush = () =>
          sendPushSilently(
            driverId,
            '❌ Livraison annulée',
            `La livraison pour ${delivery.client_name || 'un client'} a été annulée`
          );
      }
    }

    // Fire push without awaiting — response goes back immediately
    if (triggerPush) triggerPush();

    return NextResponse.json({ delivery: data });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
