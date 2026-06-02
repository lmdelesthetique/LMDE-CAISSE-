import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// POST /api/loyalty/adjust-points
// Body: { clientId, pointsChange, reason }
export async function POST(req: NextRequest) {
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { clientId, pointsChange, reason } = body ?? {};
  if (!clientId || pointsChange === undefined || pointsChange === null) {
    return NextResponse.json({ error: 'clientId and pointsChange are required' }, { status: 400 });
  }

  const delta = Number(pointsChange);
  if (isNaN(delta)) {
    return NextResponse.json({ error: 'pointsChange must be a number' }, { status: 400 });
  }

  try {
    const supabase = createAdminClient();

    // Use maybeSingle to avoid error when 0 rows (returns null instead of error)
    const { data: clientRow, error: clientError } = await supabase
      .from('clients')
      .select('id, loyalty_points')
      .eq('id', clientId)
      .maybeSingle();

    if (clientError) {
      console.error('[api/loyalty/adjust-points] fetch client:', clientError.code, clientError.message);
      return NextResponse.json({ error: `Lecture client: ${clientError.message}` }, { status: 500 });
    }
    if (!clientRow) {
      return NextResponse.json({ error: 'Client introuvable' }, { status: 404 });
    }

    const currentPoints = clientRow.loyalty_points ?? 0;
    const newBalance = Math.max(0, currentPoints + delta);

    // Don't include updated_at — the trigger handles it automatically
    const { error: updateError } = await supabase
      .from('clients')
      .update({ loyalty_points: newBalance })
      .eq('id', clientId);

    if (updateError) {
      console.error('[api/loyalty/adjust-points] update loyalty_points:', updateError.code, updateError.message);
      return NextResponse.json({ error: `Mise à jour points: ${updateError.message}` }, { status: 500 });
    }

    // Insert transaction log (best-effort — non-blocking)
    const { error: txError } = await supabase.from('loyalty_transactions').insert({
      client_id: clientId,
      points_change: delta,
      reason: reason ?? 'Ajustement',
      balance_after: newBalance,
    });
    if (txError) {
      console.warn('[api/loyalty/adjust-points] loyalty_transactions insert failed (non-fatal):', txError.message);
    }

    return NextResponse.json({ success: true, newBalance });
  } catch (e: any) {
    console.error('[api/loyalty/adjust-points] exception:', e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
