import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET() {
  const supabase = createAdminClient();
  const { count } = await supabase
    .from('supplier_messages')
    .select('id', { count: 'exact', head: true })
    .eq('sender', 'supplier')
    .eq('is_read', false);
  return NextResponse.json({ count: count ?? 0 });
}
