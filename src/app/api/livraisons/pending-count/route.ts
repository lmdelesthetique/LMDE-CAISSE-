import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// GET /api/livraisons/pending-count — count active (non-delivered, non-cancelled) deliveries
export async function GET() {
  try {
    const supabase = createAdminClient();
    const { count, error } = await supabase
      .from('deliveries')
      .select('id', { count: 'exact', head: true })
      .in('status', ['pending', 'assigned', 'en_route']);

    if (error) return NextResponse.json({ count: 0 });
    return NextResponse.json({ count: count ?? 0 });
  } catch {
    return NextResponse.json({ count: 0 });
  }
}
