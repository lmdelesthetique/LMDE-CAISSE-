import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// GET — unread supplier message counts grouped by order_id (for admin badge display)
export async function GET() {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('supplier_messages')
    .select('order_id, id')
    .eq('sender', 'supplier')
    .eq('is_read', false)
    .not('order_id', 'is', null);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const counts: Record<string, number> = {};
  for (const row of data ?? []) {
    if (row.order_id) counts[row.order_id] = (counts[row.order_id] ?? 0) + 1;
  }

  return NextResponse.json({ counts });
}
