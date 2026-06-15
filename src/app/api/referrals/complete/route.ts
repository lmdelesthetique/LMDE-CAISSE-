import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(req: NextRequest) {
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { parrainId, filleulId, receiptId, codeUtilise, referralId } = body as {
    parrainId: string;
    filleulId?: string | null;
    receiptId?: string | null;
    codeUtilise: string;
    referralId?: string | null;
  };

  if (!parrainId) return NextResponse.json({ error: 'parrainId requis' }, { status: 400 });

  try {
    const supabase = createAdminClient();
    const now = new Date().toISOString();

    if (referralId) {
      // Existing referral record — mark filleul discount as used + reward parrain
      const { error: updateErr } = await supabase
        .from('referrals')
        .update({
          statut: 'recompense',
          filleul_discount_used: true,
          filleul_discount_used_at: now,
          filleul_receipt_id: receiptId ?? null,
          parrain_rewarded_at: now,
        })
        .eq('id', referralId);
      if (updateErr) console.error('[referrals/complete] update error:', updateErr.message);
    } else {
      // Create new referral record
      const { error: insertErr } = await supabase.from('referrals').insert({
        parrain_id: parrainId,
        filleul_id: filleulId ?? null,
        code_utilise: (codeUtilise ?? '').toUpperCase(),
        statut: 'recompense',
        parrain_points: 300,
        parrain_rewarded_at: now,
        filleul_discount_percent: 10,
        filleul_discount_used: true,
        filleul_discount_used_at: now,
        filleul_receipt_id: receiptId ?? null,
      });
      if (insertErr) console.error('[referrals/complete] insert error:', insertErr.message);
    }

    // Give 300 points to parrain + increment referral_count and referral_points_earned
    const { data: parrainRow } = await supabase
      .from('clients')
      .select('loyalty_points, referral_count, referral_points_earned')
      .eq('id', parrainId)
      .maybeSingle();

    if (parrainRow) {
      const newPoints = (parrainRow.loyalty_points ?? 0) + 300;
      const newCount = (parrainRow.referral_count ?? 0) + 1;
      const newPtsEarned = (parrainRow.referral_points_earned ?? 0) + 300;

      await supabase.from('clients').update({
        loyalty_points: newPoints,
        referral_count: newCount,
        referral_points_earned: newPtsEarned,
        updated_at: now,
      }).eq('id', parrainId);
    }

    // If filleul is a known client, mark referred_by
    if (filleulId) {
      await supabase.from('clients').update({
        referred_by: parrainId,
        updated_at: now,
      }).eq('id', filleulId).is('referred_by', null);
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error('[referrals/complete] exception:', e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
