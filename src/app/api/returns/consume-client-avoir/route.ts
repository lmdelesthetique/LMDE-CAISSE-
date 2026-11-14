import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// POST /api/returns/consume-client-avoir
// Called by POS after the "Utiliser avoir" button path (no specific avoir number).
// Marks the client's available/partial returns as consumed proportionally (oldest first).
// This keeps avoir_status accurate so the number lookup can't be reused.
export async function POST(req: NextRequest) {
  let body: { clientId: string; amountConsumed: number };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { clientId, amountConsumed } = body;
  if (!clientId || !amountConsumed || amountConsumed <= 0) {
    return NextResponse.json({ error: 'clientId and amountConsumed required' }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: returns, error } = await supabase
    .from('returns')
    .select('id, total_amount, avoir_used_amount, avoir_status')
    .eq('client_id', clientId)
    .eq('refund_type', 'store_credit')
    .in('avoir_status', ['available', 'partial'])
    .order('created_at', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let remaining = amountConsumed;
  for (const ret of returns ?? []) {
    if (remaining <= 0.005) break;
    const original = parseFloat(ret.total_amount ?? '0');
    const usedSoFar = parseFloat(ret.avoir_used_amount ?? '0');
    const availableOnThis = Math.max(0, original - usedSoFar);
    if (availableOnThis < 0.01) continue;

    const toConsume = Math.min(availableOnThis, remaining);
    const newUsed = usedSoFar + toConsume;
    const newStatus = newUsed >= original - 0.005 ? 'used' : 'partial';

    await supabase
      .from('returns')
      .update({ avoir_used_amount: newUsed, avoir_status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', ret.id);

    remaining -= toConsume;
  }

  return NextResponse.json({ success: true });
}
