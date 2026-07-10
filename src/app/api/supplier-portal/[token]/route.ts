import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// GET — verify token, return supplier info + messages + orders
export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  const supabase = createAdminClient();

  const { data: supplier, error } = await supabase
    .from('suppliers')
    .select('id, company_name')
    .eq('portal_login', params.token)
    .maybeSingle();

  if (error || !supplier) return NextResponse.json({ error: 'Token invalide' }, { status: 404 });

  return NextResponse.json({ supplierId: supplier.id, supplierName: supplier.company_name });
}
