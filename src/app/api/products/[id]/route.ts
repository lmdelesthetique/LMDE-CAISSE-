import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const id = params.id;
    if (!id) return NextResponse.json({ error: 'Product ID requis' }, { status: 400 });

    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: 'Corps JSON invalide' }, { status: 400 });

    const supabase = createAdminClient();

    const { colorVariants, stockMovement, ...payload } = body;

    // Main product update
    const { error: updateError } = await supabase
      .from('products')
      .update(payload)
      .eq('id', id);

    if (updateError) {
      console.error('[api/products/[id]] update error:', updateError.message);
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    // Log stock movement if provided
    if (stockMovement) {
      await supabase.from('stock_movements_log').insert({
        ...stockMovement,
        created_at: new Date().toISOString(),
      }).then(({ error }) => {
        if (error) console.error('[api/products/[id]] stock log error:', error.message);
      });
    }

    // Save color variants if provided
    if (colorVariants !== undefined) {
      await supabase.from('product_color_stock').delete().eq('product_id', id);
      if (colorVariants.length > 0) {
        const { error: varErr } = await supabase.from('product_color_stock').insert(
          colorVariants.map((v: any) => ({
            product_id: id,
            color_name: v.colorName,
            color_hex: v.colorHex,
            quantity: v.quantity,
            min_stock: v.minStock,
          }))
        );
        if (varErr) console.error('[api/products/[id]] color variants error:', varErr.message);
      }
      await supabase.from('products')
        .update({ has_color_variants: colorVariants.length > 0 })
        .eq('id', id);
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error('[api/products/[id]] unhandled:', e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: 'Corps JSON invalide' }, { status: 400 });

    const supabase = createAdminClient();
    const { colorVariants, stockMovement, ...payload } = body;

    const { data: inserted, error: insertError } = await supabase
      .from('products')
      .insert({ ...payload, created_at: new Date().toISOString() })
      .select('id')
      .single();

    if (insertError) {
      console.error('[api/products/[id]] insert error:', insertError.message);
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    const newId = inserted.id;

    if (stockMovement && newId) {
      await supabase.from('stock_movements_log').insert({
        ...stockMovement,
        product_id: newId,
        created_at: new Date().toISOString(),
      });
    }

    if (colorVariants !== undefined && colorVariants.length > 0 && newId) {
      await supabase.from('product_color_stock').insert(
        colorVariants.map((v: any) => ({
          product_id: newId,
          color_name: v.colorName,
          color_hex: v.colorHex,
          quantity: v.quantity,
          min_stock: v.minStock,
        }))
      );
      await supabase.from('products').update({ has_color_variants: true }).eq('id', newId);
    }

    return NextResponse.json({ ok: true, id: newId });
  } catch (e: any) {
    console.error('[api/products/create] unhandled:', e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
