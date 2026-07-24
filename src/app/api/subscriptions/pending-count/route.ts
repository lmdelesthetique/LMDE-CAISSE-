import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// GET /api/subscriptions/pending-count — count subscriptions awaiting payment activation
export async function GET() {
  try {
    const supabase = createAdminClient();
    const { count, error } = await supabase
      .from('client_subscriptions')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending');

    if (error) return NextResponse.json({ count: 0 });
    return NextResponse.json({ count: count ?? 0 });
  } catch {
    return NextResponse.json({ count: 0 });
  }
}
