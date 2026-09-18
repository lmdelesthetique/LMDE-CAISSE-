import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

function generateReferralCode(firstName: string): string {
  const clean = (firstName || 'CLIENT').toUpperCase().replace(/[^A-Z]/g, '').substring(0, 6);
  const num = Math.floor(Math.random() * 90 + 10);
  return clean + num;
}

// GET /api/clients?search=query&limit=20
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const search = searchParams.get('search') ?? '';
  const limit = parseInt(searchParams.get('limit') ?? '20');
  const supabase = createAdminClient();
  let query = supabase
    .from('clients')
    .select('id, first_name, last_name, phone, whatsapp, client_type, email')
    .order('last_name', { ascending: true })
    .limit(limit);
  if (search.trim()) {
    query = query.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,phone.ilike.%${search}%`);
  }
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const clients = (data ?? []).map((r) => ({
    id: r.id,
    firstName: r.first_name,
    lastName: r.last_name,
    phone: r.phone,
    whatsapp: r.whatsapp,
    clientType: r.client_type,
    email: r.email,
  }));
  return NextResponse.json({ clients });
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
