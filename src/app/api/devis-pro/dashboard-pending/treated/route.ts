import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

const CONFIG_KEY = 'devis_dashboard_traite';

async function getTreated(): Promise<string[]> {
  const { data } = await createAdminClient()
    .from('app_config')
    .select('value')
    .eq('key', CONFIG_KEY)
    .maybeSingle();
  if (!data?.value) return [];
  try { return JSON.parse(data.value) as string[]; } catch { return []; }
}

export async function GET() {
  try {
    const ids = await getTreated();
    return NextResponse.json({ ids });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { devisId } = await req.json();
    if (!devisId) return NextResponse.json({ error: 'devisId requis' }, { status: 400 });

    const current = await getTreated();
    if (!current.includes(String(devisId))) current.push(String(devisId));

    // Keep last 500 to avoid unbounded growth
    const trimmed = current.slice(-500);

    await createAdminClient()
      .from('app_config')
      .upsert({ key: CONFIG_KEY, value: JSON.stringify(trimmed), updated_at: new Date().toISOString() });

    return NextResponse.json({ ok: true, ids: trimmed });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
