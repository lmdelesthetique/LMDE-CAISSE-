import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

type Ctx = { params: Promise<{ id: string }> };

// GET /api/clients/[id]/purchases
// Merges client_purchases (legacy) + receipts (current system).
// client_purchases is no longer populated by new POS — receipts is the source of truth for new sales.
export async function GET(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const supabase = createAdminClient();

  const [cpRes, receiptsRes] = await Promise.all([
    supabase
      .from('client_purchases')
      .select('*')
      .eq('client_id', id)
      .order('purchased_at', { ascending: false }),
    supabase
      .from('receipts')
      .select('*')
      .eq('client_id', id)
      .neq('status', 'cancelled')
      .order('created_at', { ascending: false })
      .limit(100),
  ]);

  const legacy = cpRes.data ?? [];
  const receipts = receiptsRes.data ?? [];

  // Build a set of receipt_numbers already covered by client_purchases
  const legacyNums = new Set(legacy.map((r: any) => r.receipt_number).filter(Boolean));

  // Only add receipt rows that are NOT already represented in client_purchases
  const newReceipts = receipts.filter((r: any) => !legacyNums.has(r.ticket_number));

  return NextResponse.json({
    purchases: legacy,
    receipts: newReceipts,
  });
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
