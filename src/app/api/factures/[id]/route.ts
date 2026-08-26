import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('factures')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error || !data) return NextResponse.json({ error: 'Document introuvable' }, { status: 404 });
  return NextResponse.json(data);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  let supabase: ReturnType<typeof makeClient>;
  try {
    supabase = createAdminClient();
  } catch (e: any) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  const updates: Record<string, any> = {
    client_name: body.client_name ?? null,
    client_email: body.client_email ?? null,
    total_ht: Number(body.total_ht ?? 0),
    total_tva: Number(body.total_tva ?? 0),
    total_ttc: Number(body.total_ttc ?? 0),
    status: body.status ?? 'draft',
  };

  if (body.doc_type) updates.doc_type = body.doc_type;
  if (body.items) updates.items = body.items;
  if (typeof body.is_counted_in_ca === 'boolean') updates.is_counted_in_ca = body.is_counted_in_ca;

  console.log('=== PATCH FACTURE ===', id, JSON.stringify(updates));

  const { error } = await supabase.from('factures').update(updates).eq('id', id);

  if (error) {
    console.error('PATCH ERROR:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let supabase: ReturnType<typeof makeClient>;
  try {
    supabase = createAdminClient();
  } catch (e: any) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  const { error } = await supabase.from('factures').delete().eq('id', id);

  if (error) {
    console.error('[api/factures DELETE]', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
