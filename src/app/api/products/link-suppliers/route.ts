import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// POST /api/products/link-suppliers — link supplier string names to supplier_id FKs
// Body: { supplierNames: string[] }
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const supplierNames: string[] = Array.isArray(body?.supplierNames) ? body.supplierNames : [];
  if (supplierNames.length === 0) return NextResponse.json({ ok: true, linked: 0 });

  const supabase = createAdminClient();
  const { data: suppRows, error } = await supabase
    .from('suppliers')
    .select('id, company_name');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let linked = 0;
  for (const suppName of supplierNames) {
    const match = (suppRows ?? []).find(
      (s: any) => s.company_name?.toLowerCase().trim() === suppName.toLowerCase().trim()
    );
    if (match) {
      await supabase
        .from('products')
        .update({ supplier_id: match.id })
        .eq('supplier', suppName)
        .is('supplier_id', null);
      linked++;
    }
  }

  return NextResponse.json({ ok: true, linked });
}
