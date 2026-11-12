import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// GET — devis validés ou modifiés par le client, en attente de traitement admin
export async function GET() {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('devis_pro')
    .select(`
      id, numero, statut, date_reassort, total_ttc, client_pays, updated_at,
      client:clients(id, first_name, last_name, phone, whatsapp)
    `)
    .in('statut', ['client_valide', 'client_modifie'])
    .not('date_reassort', 'is', null)
    .order('updated_at', { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ devis: data ?? [] });
}
