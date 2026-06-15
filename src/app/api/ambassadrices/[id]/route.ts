import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function makeClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  if (!url || !key) throw new Error('Supabase env vars not configured');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const supabase = makeClient();
    const { data: ambassadrice, error } = await supabase
      .from('ambassadrices')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!ambassadrice) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // Get campaign count
    const { count: campaignCount } = await supabase
      .from('campagne_assignments')
      .select('*', { count: 'exact', head: true })
      .eq('ambassadrice_id', id);

    // Get content count and total cost
    const { data: assignments } = await supabase
      .from('campagne_assignments')
      .select('id, cout_total')
      .eq('ambassadrice_id', id);

    const assignmentIds = (assignments ?? []).map((a: any) => a.id);
    const totalCost = (assignments ?? []).reduce((sum: number, a: any) => sum + (a.cout_total ?? 0), 0);

    let contentCount = 0;
    if (assignmentIds.length > 0) {
      const { count } = await supabase
        .from('campagne_contenus')
        .select('*', { count: 'exact', head: true })
        .in('assignment_id', assignmentIds);
      contentCount = count ?? 0;
    }

    return NextResponse.json({
      ...ambassadrice,
      stats: {
        campaign_count: campaignCount ?? 0,
        content_count: contentCount,
        total_cost: totalCost,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  try {
    const supabase = makeClient();
    const { data, error } = await supabase
      .from('ambassadrices')
      .update({ ...body, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('*')
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const supabase = makeClient();
    const { error } = await supabase
      .from('ambassadrices')
      .update({ statut: 'inactive', updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
