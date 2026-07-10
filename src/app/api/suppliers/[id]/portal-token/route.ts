import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createAdminClient();
  const token = crypto.randomUUID();

  const { error } = await supabase
    .from('suppliers')
    .update({ portal_login: token })
    .eq('id', params.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ token });
}
