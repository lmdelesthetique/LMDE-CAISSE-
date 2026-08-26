import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// POST — mark product inactive (hidden from caisse/search, excluded from stock alerts)
// PATCH with { inactive: false } to reactivate
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const reactivate = body.reactivate === true;

  const supabase = createAdminClient();

  if (reactivate) {
    const { error } = await supabase
      .from('products')
      .update({ product_status: 'active', status: 'active', updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, status: 'active' });
  }

  const { error } = await supabase
    .from('products')
    .update({ product_status: 'inactive', status: 'inactive', updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, status: 'inactive' });
}
