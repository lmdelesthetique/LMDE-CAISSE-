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
  { params }: { params: Promise<{ lienUnique: string }> }
) {
  const { lienUnique } = await params;

  try {
    const supabase = makeClient();

    // Find ambassadrice by lien_unique
    const { data: ambassadrice, error: ambErr } = await supabase
      .from('ambassadrices')
      .select('*')
      .eq('lien_unique', lienUnique)
      .maybeSingle();

    if (ambErr) return NextResponse.json({ error: ambErr.message }, { status: 500 });
    if (!ambassadrice) return NextResponse.json({ error: 'Lien invalide.' }, { status: 404 });

    // Find active campaign assignment for this ambassadrice
    const { data: assignments } = await supabase
      .from('campagne_assignments')
      .select('*, campagne:campagnes_ambassadrices(*)')
      .eq('ambassadrice_id', ambassadrice.id)
      .order('created_at', { ascending: false });

    // Find the active campaign (status=active or brouillon)
    const activeAssignment = (assignments ?? []).find(
      (a: any) =>
        a.campagne?.statut === 'active' || a.campagne?.statut === 'brouillon'
    ) ?? (assignments ?? [])[0] ?? null;

    if (!activeAssignment) {
      return NextResponse.json({ ambassadrice, campaign: null, assignment: null, contenus: [] });
    }

    // Get contenus for this assignment
    const { data: contenus } = await supabase
      .from('campagne_contenus')
      .select('*')
      .eq('assignment_id', activeAssignment.id)
      .order('created_at', { ascending: true });

    // Enrich products with image_url from products table
    const rawProducts: any[] = activeAssignment.products ?? [];
    let enrichedProducts = rawProducts;
    if (rawProducts.length > 0) {
      const productIds = rawProducts.map((p: any) => p.id).filter(Boolean);
      const { data: productRows } = await supabase
        .from('products')
        .select('id, image_url')
        .in('id', productIds);
      const imageMap: Record<string, string> = {};
      for (const row of productRows ?? []) {
        if (row.image_url) imageMap[row.id] = row.image_url;
      }
      enrichedProducts = rawProducts.map((p: any) => ({
        ...p,
        image_url: imageMap[p.id] ?? p.image_url ?? null,
      }));
    }

    return NextResponse.json({
      ambassadrice,
      campaign: activeAssignment.campagne,
      assignment: {
        id: activeAssignment.id,
        products: enrichedProducts,
        notes: activeAssignment.notes,
        statut_reception: activeAssignment.statut_reception,
        cout_total: activeAssignment.cout_total,
        ai_scripts: activeAssignment.ai_scripts,
      },
      contenus: contenus ?? [],
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
