import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const CONFIG_KEY = 'shopify_treated_orders';

function makeClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function getTreated(): Promise<string[]> {
  const { data } = await makeClient()
    .from('app_config')
    .select('value')
    .eq('key', CONFIG_KEY)
    .maybeSingle();
  if (!data?.value) return [];
  try { return JSON.parse(data.value) as string[]; } catch { return []; }
}

// GET — return current treated set
export async function GET() {
  try {
    const ids = await getTreated();
    return NextResponse.json({ ids });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// POST { orderId } — add an order to the treated set
export async function POST(req: NextRequest) {
  try {
    const { orderId } = await req.json();
    if (!orderId) return NextResponse.json({ error: 'orderId requis' }, { status: 400 });

    const current = await getTreated();
    if (!current.includes(String(orderId))) current.push(String(orderId));

    // Keep only the 200 most recent to avoid unbounded growth
    const trimmed = current.slice(-200);

    await makeClient()
      .from('app_config')
      .upsert({ key: CONFIG_KEY, value: JSON.stringify(trimmed), updated_at: new Date().toISOString() });

    return NextResponse.json({ ok: true, ids: trimmed });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
