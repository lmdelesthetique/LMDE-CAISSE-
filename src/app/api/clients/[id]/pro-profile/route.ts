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

// PATCH: partial update — only updates the fields explicitly provided in the body
// Automatically detects if produits_reassort/devis_history columns exist (migration guard)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const supabase = createAdminClient();

  const PROFILE_FIELDS: Record<string, true> = {
    salon_name: true, prestation_types: true, nb_cabines: true,
    nb_clientes_semaine: true, nb_employes: true, budget_mensuel: true,
    fournisseur_principal: true, frequence_commande: true, mode_commande: true,
    marques_utilisees: true, produits_consommables: true, produits_recherches: true,
    problemes_fournisseurs: true, formule_box_proposee: true, date_premier_contact: true,
    statut_commercial: true, prochain_suivi: true, main_activity: true,
    work_location: true, activity_level: true, produits_utilises: true,
    fournisseur_actuel: true, budget_tranche: true, frequence_achat: true,
    besoin_principal: true,
  };
  const DEVIS_FIELDS: Record<string, true> = { produits_reassort: true, devis_history: true };

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  const devisPatch: Record<string, unknown> = {};

  for (const [k, v] of Object.entries(body)) {
    if (PROFILE_FIELDS[k]) patch[k] = v;
    else if (DEVIS_FIELDS[k]) devisPatch[k] = v;
  }

  // Try with devis fields first; fall back to profile-only if columns missing
  const hasDevisFields = Object.keys(devisPatch).length > 0;
  const fullPatch = hasDevisFields ? { ...patch, ...devisPatch } : patch;

  const { data, error } = await supabase
    .from('client_pro_profiles')
    .upsert({ client_id: id, ...fullPatch }, { onConflict: 'client_id' })
    .select()
    .single();

  if (error) {
    // If the error is about missing columns (PGRST204), retry without devis fields
    if (hasDevisFields && (error.code === 'PGRST204' || error.message?.includes('produits_reassort') || error.message?.includes('devis_history'))) {
      console.warn('[pro-profile PATCH] devis columns missing — run migration. Saving profile fields only.');
      const { data: d2, error: e2 } = await supabase
        .from('client_pro_profiles')
        .upsert({ client_id: id, ...patch }, { onConflict: 'client_id' })
        .select()
        .single();
      if (e2) return NextResponse.json({ error: e2.message, migrationNeeded: true }, { status: 500 });
      return NextResponse.json({ profile: d2, migrationNeeded: true });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ profile: data });
}
