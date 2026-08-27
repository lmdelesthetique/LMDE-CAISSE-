import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// PATCH /api/loyalty/redemptions/[id] — validate or cancel a redemption
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { status } = body ?? {};
  if (!status) return NextResponse.json({ error: 'status required' }, { status: 400 });

  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('loyalty_redemptions')
      .update({ status })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[api/loyalty/redemptions PATCH]', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
