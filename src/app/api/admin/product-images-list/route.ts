import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

const BUCKET = 'product-images';
const PAGE_SIZE = 50;

// GET /api/admin/product-images-list?offset=0
// Lists images from Supabase Storage product-images bucket with pagination
export async function GET(req: NextRequest) {
  const offset = parseInt(req.nextUrl.searchParams.get('offset') ?? '0', 10) || 0;
  const supabase = createAdminClient();
  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '');

  const { data, error } = await supabase.storage.from(BUCKET).list(undefined as any, {
    limit: PAGE_SIZE,
    offset,
    sortBy: { column: 'created_at', order: 'desc' },
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const files = (data ?? [])
    .filter((f: any) => f.name && !f.name.startsWith('.'))
    .map((f: any) => ({
      name: f.name,
      url: `${supabaseUrl}/storage/v1/object/public/${BUCKET}/${f.name}`,
    }));

  return NextResponse.json({ files, hasMore: files.length === PAGE_SIZE, offset });
}
