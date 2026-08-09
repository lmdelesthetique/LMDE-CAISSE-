import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function makeAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase env vars not configured');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

// POST — mark product inactive (hidden from caisse/search, excluded from stock alerts)
// PATCH with { inactive: false } to reactivate
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { id } = params;
  const body = await req.json().catch(() => ({}));
  const reactivate = body.reactivate === true;

  const supabase = makeAdminClient();

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
