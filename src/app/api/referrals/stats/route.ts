import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET() {
  try {
    const supabase = createAdminClient();

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const [{ data: allReferrals }, { data: monthReferrals }, { data: topParrains }] = await Promise.all([
      supabase.from('referrals').select('id, statut, parrain_points, created_at, filleul_discount_used'),
      supabase.from('referrals').select('id, statut, parrain_points')
        .gte('created_at', startOfMonth.toISOString()),
      supabase.from('clients')
        .select('id, first_name, last_name, referral_code, referral_count, referral_points_earned')
        .gt('referral_count', 0)
        .order('referral_count', { ascending: false })
        .limit(10),
    ]);

    const total = allReferrals?.length ?? 0;
    const totalPointsGiven = (allReferrals ?? []).reduce((sum, r) => sum + (r.parrain_points ?? 0), 0);
    const totalThisMonth = monthReferrals?.length ?? 0;
    const pointsThisMonth = (monthReferrals ?? []).reduce((sum, r) => sum + (r.parrain_points ?? 0), 0);
    const rewardedCount = (allReferrals ?? []).filter(r => r.statut === 'recompense').length;
    const discountUsedCount = (allReferrals ?? []).filter(r => r.filleul_discount_used).length;

    return NextResponse.json({
      total,
      totalPointsGiven,
      totalThisMonth,
      pointsThisMonth,
      rewardedCount,
      discountUsedCount,
      topParrains: (topParrains ?? []).map(c => ({
        id: c.id,
        firstName: c.first_name,
        lastName: c.last_name,
        referralCode: c.referral_code,
        referralCount: c.referral_count ?? 0,
        referralPointsEarned: c.referral_points_earned ?? 0,
      })),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
