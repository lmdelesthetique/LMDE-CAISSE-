import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendNotifFournisseurNouvelleCommande } from '@/lib/whatsappService';

function makeAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase env vars not configured');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const { id } = params;
  const supabase = makeAdminClient();

  const { data: order } = await supabase
    .from('fo_orders')
    .select('id, order_number, supplier_id')
    .eq('id', id)
    .single();

  if (!order) return NextResponse.json({ error: 'Commande introuvable' }, { status: 404 });
  if (!order.supplier_id) return NextResponse.json({ error: 'Pas de fournisseur associé' }, { status: 422 });

  const { data: supplier } = await supabase
    .from('suppliers')
    .select('company_name, whatsapp, phone, email')
    .eq('id', order.supplier_id)
    .single();

  if (!supplier) return NextResponse.json({ error: 'Fournisseur introuvable' }, { status: 404 });

  const phone = supplier.whatsapp || supplier.phone;
  if (!phone) return NextResponse.json({ error: 'Aucun numéro WhatsApp/téléphone enregistré pour ce fournisseur' }, { status: 422 });

  const result = await sendNotifFournisseurNouvelleCommande(
    phone,
    supplier.company_name ?? 'Fournisseur',
    order.order_number ?? id,
    supplier.email ?? undefined
  );

  if (!result.ok) {
    return NextResponse.json({ error: result.error || 'Échec envoi WhatsApp' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, phone });
}
