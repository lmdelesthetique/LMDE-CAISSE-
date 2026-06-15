import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function makeClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  if (!url || !key) throw new Error('Supabase env vars not configured');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function GET() {
  try {
    const supabase = makeClient();
    const { data: campagnes, error } = await supabase
      .from('campagnes_ambassadrices')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Enrich with assignment counts
    const campagneIds = (campagnes ?? []).map((c: any) => c.id);
    let assignmentsMap: Record<string, any[]> = {};

    if (campagneIds.length > 0) {
      const { data: assignments } = await supabase
        .from('campagne_assignments')
        .select('campagne_id, cout_total')
        .in('campagne_id', campagneIds);

      for (const a of assignments ?? []) {
        if (!assignmentsMap[a.campagne_id]) assignmentsMap[a.campagne_id] = [];
        assignmentsMap[a.campagne_id].push(a);
      }
    }

    const enriched = (campagnes ?? []).map((c: any) => {
      const assignments = assignmentsMap[c.id] ?? [];
      const totalCost = assignments.reduce((sum: number, a: any) => sum + (a.cout_total ?? 0), 0);
      return { ...c, assignment_count: assignments.length, total_cost: totalCost };
    });

    return NextResponse.json(enriched);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  try {
    const supabase = makeClient();
    const { data, error } = await supabase
      .from('campagnes_ambassadrices')
      .insert({
        nom: body.nom,
        description: body.description ?? null,
        date_debut: body.date_debut ?? null,
        date_fin: body.date_fin ?? null,
        objectif: body.objectif ?? null,
        statut: body.statut ?? 'en_preparation',
      })
      .select('*')
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
