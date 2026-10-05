import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// POST /api/products/batch — batch insert { products: [...] }
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const products: any[] = Array.isArray(body.products) ? body.products : [];
  if (products.length === 0) return NextResponse.json({ error: 'products array required' }, { status: 400 });
  const supabase = createAdminClient();
  const { error } = await supabase.from('products').insert(products);
  if (error) return NextResponse.json({ error: error.message, code: error.code }, { status: 500 });
  return NextResponse.json({ ok: true, inserted: products.length });
}

// PUT /api/products/batch — batch upsert { products: [...] } with onConflict: 'id'
export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const products: any[] = Array.isArray(body.products) ? body.products : [];
  if (products.length === 0) return NextResponse.json({ error: 'products array required' }, { status: 400 });
  const supabase = createAdminClient();
  const { error } = await supabase.from('products').upsert(products, { onConflict: 'id' });
  if (error) return NextResponse.json({ error: error.message, code: error.code }, { status: 500 });
  return NextResponse.json({ ok: true, upserted: products.length });
}

// PATCH /api/products/batch — bulk update { ids, payload }
export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const ids: string[] = Array.isArray(body.ids) ? body.ids.filter(Boolean) : [];
  if (ids.length === 0) return NextResponse.json({ error: 'ids array required' }, { status: 400 });
  if (!body.payload || typeof body.payload !== 'object') return NextResponse.json({ error: 'payload required' }, { status: 400 });
  const supabase = createAdminClient();
  const { error } = await supabase.from('products').update(body.payload).in('id', ids);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, updated: ids.length });
}

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
