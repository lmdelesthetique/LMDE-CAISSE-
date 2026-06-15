import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

function generateReferralCode(firstName: string): string {
  const clean = (firstName || 'CLIENT').toUpperCase().replace(/[^A-Z]/g, '').substring(0, 6);
  const num = Math.floor(Math.random() * 90 + 10);
  return clean + num;
}

export async function POST(req: NextRequest) {
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  try {
    const supabase = createAdminClient();

    const firstName = body.first_name || body.prenom || 'CLIENT';
    // Generate a unique referral code — retry once on collision
    let referralCode = generateReferralCode(firstName);
    const { data: existing } = await supabase
      .from('clients').select('id').eq('referral_code', referralCode).maybeSingle();
    if (existing) referralCode = generateReferralCode(firstName + Math.random().toString(36).substring(2, 4));

    const { data, error } = await supabase
      .from('clients')
      .insert({ ...body, referral_code: referralCode, referral_count: 0, referral_points_earned: 0 })
      .select()
      .single();
    if (error) {
      console.error('[api/clients POST]', error.code, error.message);
      return NextResponse.json({ error: error.message, code: error.code }, { status: 500 });
    }
    return NextResponse.json(data, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
