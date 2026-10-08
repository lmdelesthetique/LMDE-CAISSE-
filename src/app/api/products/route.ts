import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const ids = searchParams.get('ids');
  const search = searchParams.get('search') ?? '';

  const supabase = createAdminClient();

  // Search by name/ref
  if (search.trim()) {
    const { data } = await supabase
      .from('products')
      .select('id, name, ref, image_url, stock, has_color_variants')
      .or(`name.ilike.%${search.trim()}%,ref.ilike.%${search.trim()}%`)
      .eq('is_active', true)
      .order('name', { ascending: true })
      .limit(50);
    return NextResponse.json(data ?? []);
  }

  // Fetch by IDs — returns stock so inventory can detect stale values
  if (!ids) return NextResponse.json([]);
  const idList = ids.split(',').filter(Boolean).slice(0, 200);
  const { data } = await supabase
    .from('products')
    .select('id, image_url, stock')
    .in('id', idList);
  return NextResponse.json(data ?? []);
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
