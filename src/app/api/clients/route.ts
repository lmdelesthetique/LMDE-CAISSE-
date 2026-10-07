import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

function generateReferralCode(firstName: string): string {
  const clean = (firstName || 'CLIENT').toUpperCase().replace(/[^A-Z]/g, '').substring(0, 6);
  const num = Math.floor(Math.random() * 90 + 10);
  return clean + num;
}

// GET /api/clients?search=query&limit=20&full=true&clientType=xxx&phone=xxx
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const search = searchParams.get('search') ?? '';
  const phone = searchParams.get('phone') ?? '';
  const limit = parseInt(searchParams.get('limit') ?? '200');
  const full = searchParams.get('full') === 'true';
  const clientType = searchParams.get('clientType') ?? '';
  const supabase = createAdminClient();
  const selectCols = full ? '*' : 'id, first_name, last_name, phone, whatsapp, client_type, email';

  // full=true (admin page): fetch all pages to return every client
  if (full && !search.trim() && !phone.trim()) {
    const PAGE = 1000;
    let all: any[] = [];
    let from = 0;
    while (true) {
      let q = supabase.from('clients').select(selectCols).eq('is_active', true).order('last_name', { ascending: true }).range(from, from + PAGE - 1);
      if (clientType && clientType !== 'all') q = q.eq('client_type', clientType);
      const { data, error } = await q;
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      if (!data || data.length === 0) break;
      all = all.concat(data);
      if (data.length < PAGE) break;
      from += PAGE;
    }
    return NextResponse.json(all);
  }

  let query = supabase
    .from('clients')
    .select(selectCols)
    .eq('is_active', true)
    .order('last_name', { ascending: true })
    .limit(limit);
  if (search.trim()) {
    query = query.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,phone.ilike.%${search}%,email.ilike.%${search}%`);
  }
  if (phone.trim()) {
    query = query.eq('phone', phone.trim());
  }
  if (clientType && clientType !== 'all') {
    query = query.eq('client_type', clientType);
  }
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
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
