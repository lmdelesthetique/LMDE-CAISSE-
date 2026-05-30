import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

const SESSION_COOKIE = 'app_session';

function isSessionValid(req: NextRequest): boolean {
  const value = req.cookies.get(SESSION_COOKIE)?.value;
  if (!value) return false;
  try {
    const { exp } = JSON.parse(atob(value)) as { exp: number };
    return Date.now() < exp;
  } catch {
    return false;
  }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isSessionValid(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('ticket_modifications')
    .select('*')
    .eq('receipt_id', id)
    .order('modified_at', { ascending: false });

  if (error) {
    console.error('[api/receipts/modifications GET]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}
