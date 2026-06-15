import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const clientId = searchParams.get('clientId');
  const role = searchParams.get('role'); // 'parrain' | 'filleul' | null (admin = all)

  try {
    const supabase = createAdminClient();
    let query = supabase.from('referrals').select(`
      id, code_utilise, statut,
      parrain_points, parrain_rewarded_at,
      filleul_discount_percent, filleul_discount_used, filleul_discount_used_at,
      filleul_receipt_id, created_at,
      parrain:parrain_id(id, first_name, last_name),
      filleul:filleul_id(id, first_name, last_name)
    `).order('created_at', { ascending: false });

    if (clientId && role === 'parrain') {
      query = query.eq('parrain_id', clientId);
    } else if (clientId && role === 'filleul') {
      query = query.eq('filleul_id', clientId);
    } else if (clientId) {
      query = query.or(`parrain_id.eq.${clientId},filleul_id.eq.${clientId}`);
    }

    const { data, error } = await query.limit(200);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data ?? []);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
