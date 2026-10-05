import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// GET /api/products/import-history — last 20 import events
export async function GET() {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('product_import_history')
    .select('*')
    .order('imported_at', { ascending: false })
    .limit(20);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

// POST /api/products/import-history — record a product import event
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'body required' }, { status: 400 });
  const supabase = createAdminClient();
  const { error } = await supabase.from('product_import_history').insert(body);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
