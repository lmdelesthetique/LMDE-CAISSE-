import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

async function restoreStock(supabase: ReturnType<typeof createAdminClient>, productId: string, qty: number, reason: string) {
  const { data: prod } = await supabase.from('products').select('id, name, stock').eq('id', productId).maybeSingle();
  if (!prod) return;
  const stockBefore = Number(prod.stock ?? 0);
  const stockAfter = stockBefore + qty;
  await supabase.from('products').update({ stock: stockAfter, updated_at: new Date().toISOString() }).eq('id', productId);
  await supabase.from('stock_movements_log').insert({
    product_id: productId,
    product_name: prod.name,
    movement_type: 'entry',
    quantity_before: stockBefore,
    quantity_after: stockAfter,
    quantity_change: qty,
    reason,
    performed_by: 'Admin',
  }).then(({ error }) => { if (error) console.error('[restoreStock log]', error.message); });
}

async function deductStock(supabase: ReturnType<typeof createAdminClient>, productId: string, qty: number, reason: string) {
  const { data: prod } = await supabase.from('products').select('id, name, stock').eq('id', productId).maybeSingle();
  if (!prod) return;
  const stockBefore = Number(prod.stock ?? 0);
  const stockAfter = Math.max(0, stockBefore - qty);
  await supabase.from('products').update({ stock: stockAfter, updated_at: new Date().toISOString() }).eq('id', productId);
  await supabase.from('stock_movements_log').insert({
    product_id: productId,
    product_name: prod.name,
    movement_type: 'exit',
    quantity_before: stockBefore,
    quantity_after: stockAfter,
    quantity_change: -qty,
    reason,
    source: 'ambassadrice',
    performed_by: 'Admin',
  }).then(({ error }) => { if (error) console.error('[deductStock log]', error.message); });
}

// DELETE — remove ambassadrice from campaign, restore all product stock
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; assignmentId: string }> }
) {
  const { id: campagneId, assignmentId } = await params;
  try {
    const supabase = createAdminClient();

    const { data: assignment } = await supabase
      .from('campagne_assignments')
      .select('id, products, ambassadrice_id')
      .eq('id', assignmentId)
      .eq('campagne_id', campagneId)
      .maybeSingle();

    if (!assignment) return NextResponse.json({ error: 'Assignment not found' }, { status: 404 });

    const reason = `Retrait campagne ambassadrice — ${campagneId}`;
    for (const p of (assignment.products ?? [])) {
      if (p.id && p.quantity > 0) {
        await restoreStock(supabase, p.id, p.quantity, reason);
      }
    }

    await supabase.from('campagne_contenus').delete().eq('assignment_id', assignmentId);
    await supabase.from('campagne_assignments').delete().eq('id', assignmentId);

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// PATCH — remove_product | replace_product
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; assignmentId: string }> }
) {
  const { id: campagneId, assignmentId } = await params;
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { action } = body;
  try {
    const supabase = createAdminClient();

    const { data: assignment } = await supabase
      .from('campagne_assignments')
      .select('id, products')
      .eq('id', assignmentId)
      .eq('campagne_id', campagneId)
      .maybeSingle();

    if (!assignment) return NextResponse.json({ error: 'Assignment not found' }, { status: 404 });

    const currentProducts: any[] = assignment.products ?? [];

    if (action === 'remove_product') {
      const { productId } = body;
      const target = currentProducts.find((p) => p.id === productId);
      if (!target) return NextResponse.json({ error: 'Product not in assignment' }, { status: 400 });

      await restoreStock(supabase, productId, target.quantity ?? 1, `Retrait produit campagne — ${campagneId}`);

      const newProducts = currentProducts.filter((p) => p.id !== productId);
      const newCoutTotal = newProducts.reduce((s: number, p: any) => s + (p.cout_achat ?? 0) * (p.quantity ?? 1), 0);

      await supabase.from('campagne_assignments')
        .update({ products: newProducts, cout_total: newCoutTotal, updated_at: new Date().toISOString() })
        .eq('id', assignmentId);

      await supabase.from('campagne_contenus').delete().eq('assignment_id', assignmentId).eq('product_id', productId);

      return NextResponse.json({ ok: true, products: newProducts });
    }

    if (action === 'replace_product') {
      const { oldProductId, newProduct } = body as {
        oldProductId: string;
        newProduct: { id: string; name: string; price: number; cout_achat: number; quantity: number; image_url?: string | null };
      };

      const oldProduct = currentProducts.find((p) => p.id === oldProductId);
      if (!oldProduct) return NextResponse.json({ error: 'Old product not in assignment' }, { status: 400 });

      await restoreStock(supabase, oldProductId, oldProduct.quantity ?? 1, `Remplacement produit campagne — ${campagneId}`);
      await deductStock(supabase, newProduct.id, newProduct.quantity ?? 1, `Campagne ambassadrice (remplacement) — ${campagneId}`);

      const newProducts = currentProducts.map((p) =>
        p.id === oldProductId ? { ...newProduct } : p
      );
      const newCoutTotal = newProducts.reduce((s: number, p: any) => s + (p.cout_achat ?? 0) * (p.quantity ?? 1), 0);

      await supabase.from('campagne_assignments')
        .update({ products: newProducts, cout_total: newCoutTotal, updated_at: new Date().toISOString() })
        .eq('id', assignmentId);

      await supabase.from('campagne_contenus')
        .update({ product_id: newProduct.id, product_name: newProduct.name })
        .eq('assignment_id', assignmentId)
        .eq('product_id', oldProductId);

      return NextResponse.json({ ok: true, products: newProducts });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
