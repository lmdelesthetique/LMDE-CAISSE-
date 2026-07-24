import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// POST — manually activate a pending/suspended subscription (admin action)
export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const supabase = createAdminClient();

  const { error } = await supabase
    .from('client_subscriptions')
    .update({ status: 'active' })
    .eq('id', id)
    .in('status', ['pending', 'suspended']);

  if (error) {
    console.error('[subscriptions/activate]', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
