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

    const { data: campagne, error } = await supabase
      .from('campagnes_ambassadrices')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!campagne) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const { data: assignments } = await supabase
      .from('campagne_assignments')
      .select('*, ambassadrice:ambassadrices(*)')
      .eq('campagne_id', id)
      .order('created_at', { ascending: true });

    const assignmentIds = (assignments ?? []).map((a: any) => a.id);
    let contenus: any[] = [];
    if (assignmentIds.length > 0) {
      const { data: c } = await supabase
        .from('campagne_contenus')
        .select('*')
        .in('assignment_id', assignmentIds)
        .order('created_at', { ascending: true });
      contenus = c ?? [];
    }

    // Map contenus to their assignment
    const assignmentsWithContenus = (assignments ?? []).map((a: any) => ({
      ...a,
      contenus: contenus.filter((c) => c.assignment_id === a.id),
    }));

    return NextResponse.json({ ...campagne, assignments: assignmentsWithContenus });
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

    // If patching assignment reception status
    if (body.assignment_id && body.statut_reception) {
      const { data, error } = await supabase
        .from('campagne_assignments')
        .update({ statut_reception: body.statut_reception, updated_at: new Date().toISOString() })
        .eq('id', body.assignment_id)
        .eq('campagne_id', id)
        .select('*')
        .single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json(data);
    }

    // Otherwise patch the campagne itself
    const allowed = ['nom', 'description', 'date_debut', 'date_fin', 'objectif', 'statut'];
    const update: any = { updated_at: new Date().toISOString() };
    for (const k of allowed) {
      if (k in body) update[k] = body[k];
    }

    const { data, error } = await supabase
      .from('campagnes_ambassadrices')
      .update(update)
      .eq('id', id)
      .select('*')
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
