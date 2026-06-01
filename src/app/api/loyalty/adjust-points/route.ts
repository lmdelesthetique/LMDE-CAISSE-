import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// POST /api/loyalty/adjust-points
// Body: { clientId, pointsChange, reason }
export async function POST(req: NextRequest) {
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { clientId, pointsChange, reason } = body ?? {};
  if (!clientId || pointsChange === undefined) {
    return NextResponse.json({ error: 'clientId and pointsChange are required' }, { status: 400 });
  }

  try {
    const supabase = createAdminClient();

    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('loyalty_points')
      .eq('id', clientId)
      .single();

    if (clientError || !client) {
      return NextResponse.json({ error: clientError?.message ?? 'Client introuvable' }, { status: 404 });
    }

    const currentPoints = client.loyalty_points ?? 0;
    const newBalance = Math.max(0, currentPoints + (pointsChange as number));

    const { error: updateError } = await supabase
      .from('clients')
      .update({ loyalty_points: newBalance, updated_at: new Date().toISOString() })
      .eq('id', clientId);

    if (updateError) {
      console.error('[api/loyalty/adjust-points] update:', updateError.message);
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    await supabase.from('loyalty_transactions').insert({
      client_id: clientId,
      points_change: pointsChange,
      reason: reason ?? 'Ajustement',
      balance_after: newBalance,
    });

    return NextResponse.json({ success: true, newBalance });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
