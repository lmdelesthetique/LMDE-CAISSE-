import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function makeClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  if (!url || !key) throw new Error('Supabase env vars not configured');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

interface ProductInput {
  id: string;
  name: string;
  price: number;
  cout_achat: number;
  quantity: number;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: campagneId } = await params;
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { ambassadriceId, products, notes } = body as {
    ambassadriceId: string;
    products: ProductInput[];
    notes?: string;
  };

  if (!ambassadriceId) return NextResponse.json({ error: 'ambassadriceId requis' }, { status: 400 });
  if (!Array.isArray(products) || products.length === 0) {
    return NextResponse.json({ error: 'products requis' }, { status: 400 });
  }

  try {
    const supabase = makeClient();

    // Calculate total cost based on buy price × quantity
    const coutTotal = products.reduce((sum, p) => sum + (p.cout_achat ?? 0) * (p.quantity ?? 1), 0);

    // Upsert campagne_assignments
    const { data: assignment, error: assignError } = await supabase
      .from('campagne_assignments')
      .upsert(
        {
          campagne_id: campagneId,
          ambassadrice_id: ambassadriceId,
          products: products,
          notes: notes ?? null,
          cout_total: coutTotal,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'campagne_id,ambassadrice_id' }
      )
      .select('*')
      .single();

    if (assignError) return NextResponse.json({ error: assignError.message }, { status: 500 });

    // Insert default contenus only for product/type combos that don't already exist
    // NEVER delete existing contenus — they may have ambassador progress, statut, or uploaded videos
    const { data: existingContenus } = await supabase
      .from('campagne_contenus')
      .select('product_id, type_contenu')
      .eq('assignment_id', assignment.id);

    const existingSet = new Set(
      (existingContenus ?? []).map((c: any) => `${c.product_id}:${c.type_contenu}`)
    );

    const defaultTypes = ['reel', 'story'];
    const newContenus = products.flatMap((p) =>
      defaultTypes
        .filter((type) => !existingSet.has(`${p.id}:${type}`))
        .map((type) => ({
          assignment_id: assignment.id,
          product_id: p.id,
          product_name: p.name,
          type_contenu: type,
          statut: 'a_faire',
          drive_deposited: false,
        }))
    );

    if (newContenus.length > 0) {
      const { error: contenusError } = await supabase.from('campagne_contenus').insert(newContenus);
      if (contenusError) console.error('[assign] contenus insert error:', contenusError.message);
    }

    // Deduct stock for each product (same pattern as existing code)
    for (const p of products) {
      if (!p.id || !p.quantity) continue;

      const { data: prod, error: prodErr } = await supabase
        .from('products')
        .select('id, name, stock, cost_price')
        .eq('id', p.id)
        .maybeSingle();

      if (prodErr || !prod) {
        console.error('[assign] product not found:', p.id);
        continue;
      }

      const stockBefore = prod.stock ?? 0;
      const stockAfter = Math.max(0, stockBefore - (p.quantity ?? 1));

      await supabase
        .from('products')
        .update({ stock: stockAfter, updated_at: new Date().toISOString() })
        .eq('id', p.id);

      // Log stock movement (NOT counted in CA — type=ambassadrice)
      await supabase.from('stock_movements_log').insert({
        product_id: p.id,
        product_name: prod.name ?? p.name,
        movement_type: 'exit',
        quantity_before: stockBefore,
        quantity_after: stockAfter,
        quantity_change: -(p.quantity ?? 1),
        reason: `Campagne ambassadrice — ${campagneId}`,
        source: 'ambassadrice',
        performed_by: 'Admin',
      });
    }

    return NextResponse.json(assignment, { status: 201 });
  } catch (e: any) {
    console.error('[assign] exception:', e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
