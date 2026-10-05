import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// POST /api/products/rename-category — update category string on all products
// Body: { oldName: string, newName: string }
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const { oldName, newName } = body ?? {};
  if (!oldName || !newName) return NextResponse.json({ error: 'oldName and newName required' }, { status: 400 });
  const supabase = createAdminClient();
  const { error } = await supabase.from('products').update({ category: newName }).eq('category', oldName);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
