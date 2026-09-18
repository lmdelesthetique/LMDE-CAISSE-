import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET() {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('devis_pro_templates')
    .select('*')
    .order('sort_order', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ templates: data ?? [] });
}

export async function POST(req: NextRequest) {
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const supabase = createAdminClient();
  const { count } = await supabase.from('devis_pro_templates').select('*', { count: 'exact', head: true });

  const { data, error } = await supabase.from('devis_pro_templates').insert({
    name: body.name,
    emoji: body.emoji ?? '💅',
    color: body.color ?? '#B8960C',
    discount_pct: body.discount_pct ?? 0,
    items: body.items ?? [],
    sort_order: body.sort_order ?? (count ?? 0),
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ template: data }, { status: 201 });
}
