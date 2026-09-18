import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

type Ctx = { params: Promise<{ id: string }> };

// GET /api/devis-pro/[id]
export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('devis_pro')
    .select(`*, client:clients(id, firstName:first_name, lastName:last_name, phone, whatsapp, clientType:client_type, address, city, country)`)
    .eq('id', id)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ devis: data });
}

// PATCH /api/devis-pro/[id]
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const supabase = createAdminClient();

  const allowed = [
    'items', 'discount_pct', 'credit', 'total_ttc', 'client_pays', 'free_shipping',
    'statut', 'type_expedition', 'adresse_livraison', 'notes', 'notes_preparation',
    'pdf_url', 'paiements', 'paye_total',
    'sent_at', 'validated_at', 'ready_at', 'delivered_at',
  ];

  const patch: Record<string, any> = { updated_at: new Date().toISOString() };
  for (const key of allowed) {
    if (key in body) patch[key] = body[key];
  }

  const { data, error } = await supabase.from('devis_pro').update(patch).eq('id', id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ devis: data });
}

// DELETE /api/devis-pro/[id]
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const supabase = createAdminClient();
  const { error } = await supabase.from('devis_pro').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
