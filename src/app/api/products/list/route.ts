import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// GET /api/products/list
// Returns all products with no RLS restriction (admin client).
// Query params:
//   status   — comma-separated status values to filter (omit = all statuses)
//   all      — if "true", return all products regardless of status
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const statusParam = searchParams.get('status');
  const returnAll = searchParams.get('all') === 'true';

  const supabase = createAdminClient();
  const PAGE = 1000;
  const result: any[] = [];

  let from = 0;
  while (true) {
    let q = supabase
      .from('products')
      .select('*')
      .order('name')
      .range(from, from + PAGE - 1);

    if (!returnAll && statusParam) {
      const statuses = statusParam.split(',').map(s => s.trim()).filter(Boolean);
      q = q.in('status', statuses);
    }

    const { data, error } = await q;
    if (error) {
      console.error('[api/products/list]', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data?.length) break;
    result.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }

  return NextResponse.json(result);
}
