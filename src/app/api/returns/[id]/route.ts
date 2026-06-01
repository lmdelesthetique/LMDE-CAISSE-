import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('returns')
      .select('*, clients(first_name, last_name)')
      .eq('id', id)
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: 'Retour introuvable' }, { status: 404 });
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  try {
    const supabase = createAdminClient();

    // Handle avoir usage delta: compute new avoir_used_amount and status
    if (body.avoir_used_amount_delta !== undefined) {
      const { data: current } = await supabase.from('returns').select('avoir_used_amount, total_amount').eq('id', id).maybeSingle();
      if (current) {
        const delta = parseFloat(body.avoir_used_amount_delta as string) || 0;
        const totalRef = parseFloat(body.total_amount_ref as string) || parseFloat(current.total_amount) || 0;
        const newUsed = (parseFloat(current.avoir_used_amount) || 0) + delta;
        body = {
          avoir_used_amount: newUsed,
          avoir_status: newUsed >= totalRef ? 'used' : 'partial',
        };
      }
    }

    const { data, error } = await supabase
      .from('returns')
      .update({ ...body, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) {
      console.error('[api/returns/[id] PATCH]', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const supabase = createAdminClient();

    // Fetch return to reverse its effects
    const { data: ret } = await supabase.from('returns').select('*').eq('id', id).maybeSingle();
    if (!ret) return NextResponse.json({ error: 'Retour introuvable' }, { status: 404 });

    // Reverse stock increment
    if (ret.stock_updated && ret.product_id) {
      const { data: prod } = await supabase
        .from('products')
        .select('stock')
        .eq('id', ret.product_id)
        .maybeSingle();
      if (prod) {
        const newStock = Math.max(0, (prod.stock || 0) - (ret.quantity || 0));
        await supabase
          .from('products')
          .update({ stock: newStock, updated_at: new Date().toISOString() })
          .eq('id', ret.product_id);
        await supabase.from('stock_movements_log').insert({
          product_id: ret.product_id,
          product_name: ret.product_name,
          movement_type: 'exit',
          quantity_before: prod.stock || 0,
          quantity_after: newStock,
          quantity_change: -(ret.quantity || 0),
          reason: 'Annulation retour client',
          performed_by: 'Admin',
        });
      }
    }

    // Reverse store credit
    if (ret.credit_applied && ret.client_id) {
      const { data: clientData } = await supabase
        .from('clients')
        .select('store_credit')
        .eq('id', ret.client_id)
        .maybeSingle();
      if (clientData) {
        const newCredit = Math.max(0, parseFloat(clientData.store_credit ?? 0) - parseFloat(ret.total_amount ?? 0));
        await supabase
          .from('clients')
          .update({ store_credit: newCredit, updated_at: new Date().toISOString() })
          .eq('id', ret.client_id);
      }
    }

    const { error } = await supabase.from('returns').delete().eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
