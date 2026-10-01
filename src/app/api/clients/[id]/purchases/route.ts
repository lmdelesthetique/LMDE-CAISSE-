import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

type Ctx = { params: Promise<{ id: string }> };

// GET /api/clients/[id]/purchases — returns client_purchases; falls back to receipts
export async function GET(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const supabase = createAdminClient();

  const { data: cp } = await supabase
    .from('client_purchases')
    .select('*')
    .eq('client_id', id)
    .order('purchased_at', { ascending: false });

  if (cp && cp.length > 0) return NextResponse.json(cp);

  // Fallback: receipts by client_id
  const { data: receipts, error } = await supabase
    .from('receipts')
    .select('*')
    .eq('client_id', id)
    .neq('status', 'cancelled')
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ receipts: receipts ?? [], source: 'receipts' });
}

// POST /api/clients/[id]/purchases — insert a client_purchase record
export async function POST(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('client_purchases')
    .insert({ ...body, client_id: id })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
