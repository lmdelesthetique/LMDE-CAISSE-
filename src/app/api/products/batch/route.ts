import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// DELETE /api/products/batch — bulk delete by IDs
export async function DELETE(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const ids: string[] = Array.isArray(body.ids) ? body.ids.filter(Boolean) : [];
  if (ids.length === 0) return NextResponse.json({ error: 'ids array required' }, { status: 400 });
  const supabase = createAdminClient();
  const { error } = await supabase.from('products').delete().in('id', ids);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, deleted: ids.length });
}

// GET /api/products/batch?ids=uuid1,uuid2,...
// Returns current prices for a list of product IDs (used by devis templates)
export async function GET(req: NextRequest) {
  const idsParam = req.nextUrl.searchParams.get('ids') ?? '';
  const ids = idsParam.split(',').map((s) => s.trim()).filter(Boolean);
  if (ids.length === 0) return NextResponse.json({ products: [] });
  if (ids.length > 100) return NextResponse.json({ error: 'Too many IDs (max 100)' }, { status: 400 });

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('products')
    .select('id, name, ref, image_url, sell_price_ttc, stock')
    .in('id', ids);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ products: data ?? [] });
}
