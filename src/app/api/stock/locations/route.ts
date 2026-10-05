import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// GET /api/stock/locations — returns active inventory_locations
export async function GET() {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('inventory_locations')
    .select('id, name, is_main, is_active')
    .eq('is_active', true)
    .order('is_main', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(
    (data || []).map((r: any) => ({
      id: r.id,
      name: r.name,
      isMain: r.is_main,
      isActive: r.is_active,
    }))
  );
}
