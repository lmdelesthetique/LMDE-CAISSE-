import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(req: NextRequest) {
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { code, filleulId } = body as { code: string; filleulId?: string };
  if (!code) return NextResponse.json({ error: 'code requis' }, { status: 400 });

  try {
    const supabase = createAdminClient();
    const normalizedCode = code.toUpperCase().trim();

    // Find parrain by referral code
    const { data: parrain, error: parrainErr } = await supabase
      .from('clients')
      .select('id, first_name, last_name, referral_code, referral_count')
      .eq('referral_code', normalizedCode)
      .maybeSingle();

    if (parrainErr || !parrain) {
      return NextResponse.json({ valid: false, error: 'Code de parrainage invalide' }, { status: 200 });
    }

    // Make sure filleul is not the same person as parrain
    if (filleulId && filleulId === parrain.id) {
      return NextResponse.json({ valid: false, error: 'Vous ne pouvez pas utiliser votre propre code' }, { status: 200 });
    }

    // If filleulId provided, check they haven't already used a referral code
    if (filleulId) {
      const { data: existingReferral } = await supabase
        .from('referrals')
        .select('id')
        .eq('filleul_id', filleulId)
        .limit(1)
        .maybeSingle();
      if (existingReferral) {
        return NextResponse.json({ valid: false, error: 'Ce client a déjà utilisé un code parrainage' }, { status: 200 });
      }
    }

    return NextResponse.json({
      valid: true,
      parrain: {
        id: parrain.id,
        firstName: parrain.first_name,
        lastName: parrain.last_name,
        referralCode: parrain.referral_code,
        referralCount: parrain.referral_count ?? 0,
      },
      discount: 10,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
