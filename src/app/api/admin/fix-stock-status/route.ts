import { NextResponse } from 'next/server';
import { createClient as createSupabase } from '@supabase/supabase-js';

function makeAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createSupabase(process.env.NEXT_PUBLIC_SUPABASE_URL!, key);
}

export async function POST() {
  const supabase = makeAdminClient();

  const { data: products, error } = await supabase
    .from('products')
    .select('id, name, stock, status, product_status');

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  let fixed = 0;

  for (const product of products ?? []) {
    const stock = Number(product.stock) || 0;

    if (stock > 0 && (product.status === 'rupture' || product.product_status === 'rupture')) {
      await supabase
        .from('products')
        .update({ status: 'active', product_status: 'active' })
        .eq('id', product.id);
      fixed++;
    } else if (stock <= 0 && (product.status === 'active' || product.product_status === 'active')) {
      await supabase
        .from('products')
        .update({ status: 'rupture', product_status: 'rupture' })
        .eq('id', product.id);
      fixed++;
    }
  }

  return NextResponse.json({
    ok: true,
    fixed,
    total: (products ?? []).length,
    message: `${fixed} produit${fixed !== 1 ? 's' : ''} corrigé${fixed !== 1 ? 's' : ''}`,
  });
}
