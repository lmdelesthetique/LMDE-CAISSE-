import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

function generateReferralCode(seed: string): string {
  const base = seed.toUpperCase().replace(/[^A-Z]/g, '').substring(0, 3).padEnd(3, 'X');
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${base}${rand}`;
}

// POST /api/clients/batch — batch insert clients array
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body?.clients || !Array.isArray(body.clients)) {
    return NextResponse.json({ error: 'clients array required' }, { status: 400 });
  }
  const supabase = createAdminClient();
  const payloads = body.clients.map((c: any) => ({
    ...c,
    referral_code: generateReferralCode(c.first_name || 'CLI'),
    referral_count: 0,
    referral_points_earned: 0,
  }));
  const { error } = await supabase.from('clients').insert(payloads);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, inserted: payloads.length });
}
