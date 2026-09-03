import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('client_pro_profiles')
    .select('*')
    .eq('client_id', id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ profile: data ?? null });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const supabase = createAdminClient();

  const payload = {
    client_id: id,
    salon_name: body.salon_name ?? null,
    prestation_types: body.prestation_types ?? [],
    nb_cabines: body.nb_cabines ?? null,
    nb_clientes_semaine: body.nb_clientes_semaine ?? null,
    nb_employes: body.nb_employes ?? null,
    budget_mensuel: body.budget_mensuel ?? null,
    fournisseur_principal: body.fournisseur_principal ?? null,
    frequence_commande: body.frequence_commande ?? null,
    mode_commande: body.mode_commande ?? null,
    marques_utilisees: body.marques_utilisees ?? null,
    produits_consommables: body.produits_consommables ?? null,
    produits_recherches: body.produits_recherches ?? null,
    problemes_fournisseurs: body.problemes_fournisseurs ?? null,
    formule_box_proposee: body.formule_box_proposee ?? null,
    date_premier_contact: body.date_premier_contact ?? null,
    statut_commercial: body.statut_commercial ?? 'prospect',
    prochain_suivi: body.prochain_suivi ?? null,
    main_activity: body.main_activity ?? [],
    work_location: body.work_location ?? [],
    activity_level: body.activity_level ?? null,
    produits_utilises: body.produits_utilises ?? [],
    fournisseur_actuel: body.fournisseur_actuel ?? [],
    budget_tranche: body.budget_tranche ?? null,
    frequence_achat: body.frequence_achat ?? null,
    besoin_principal: body.besoin_principal ?? [],
    produits_reassort: body.produits_reassort ?? [],
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('client_pro_profiles')
    .upsert(payload, { onConflict: 'client_id' })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ profile: data });
}
