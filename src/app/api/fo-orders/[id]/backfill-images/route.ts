import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// POST — backfill product_image_url on all lines that are missing it
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const supabase = createAdminClient();

  const { data: lines, error: lErr } = await supabase
    .from('fo_order_lines')
    .select('id, product_ref, product_id, product_image_url')
    .eq('order_id', id);

  if (lErr) return NextResponse.json({ error: lErr.message }, { status: 500 });
  if (!lines?.length) return NextResponse.json({ updated: 0 });

  let updated = 0;
  for (const line of lines) {
    if (line.product_image_url) continue;

    let imageUrl: string | null = null;

    if (line.product_ref) {
      const { data } = await supabase
        .from('products').select('image_url').eq('ref', line.product_ref).maybeSingle();
      imageUrl = data?.image_url ?? null;
    }
    if (!imageUrl && line.product_id) {
      const { data } = await supabase
        .from('products').select('image_url').eq('id', line.product_id).maybeSingle();
      imageUrl = data?.image_url ?? null;
    }

    if (imageUrl) {
      await supabase
        .from('fo_order_lines').update({ product_image_url: imageUrl }).eq('id', line.id);
      updated++;
    }
  }

  return NextResponse.json({ updated });
}
