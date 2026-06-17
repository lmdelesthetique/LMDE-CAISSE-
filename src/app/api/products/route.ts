import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

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
      console.error('[api/products] insert error:', insertError.message);
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

    if (colorVariants && colorVariants.length > 0 && newId) {
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
    console.error('[api/products] unhandled:', e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
