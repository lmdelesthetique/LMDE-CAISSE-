import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// POST /api/livreur/invoice — driver submits their delivery fee and/or invoice URL
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { deliveryId, driverId, driverFee, invoiceUrl } = body;

    if (!deliveryId || !driverId) {
      return NextResponse.json({ error: 'deliveryId et driverId requis' }, { status: 400 });
    }

    const supabase = createAdminClient();

    // Verify this delivery belongs to this driver
    const { data: delivery } = await supabase
      .from('deliveries')
      .select('id, assigned_to_driver')
      .eq('id', deliveryId)
      .maybeSingle();

    if (!delivery || delivery.assigned_to_driver !== driverId) {
      return NextResponse.json({ error: 'Livraison introuvable ou non autorisée' }, { status: 403 });
    }

    const updates: Record<string, unknown> = {};
    if (driverFee !== undefined && driverFee !== null && driverFee !== '') {
      updates.driver_fee = Number(driverFee);
    }
    if (invoiceUrl) {
      updates.driver_invoice_url = invoiceUrl;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'Aucune donnée à enregistrer' }, { status: 400 });
    }

    const { error } = await supabase
      .from('deliveries')
      .update(updates)
      .eq('id', deliveryId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Erreur inconnue';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
