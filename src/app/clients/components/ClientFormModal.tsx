'use client';

import React, { useState, useEffect } from 'react';
import Icon from '@/components/ui/AppIcon';
import { toast } from 'sonner';
import { clientService, type Client, type CreateClientInput } from '@/lib/services/clientService';

interface ClientFormModalProps {
  client?: Client | null;
  onClose: () => void;
  onSaved: (client: Client) => void;
}

const GENDER_OPTIONS = [
  { value: 'female', label: 'Femme' },
  { value: 'male', label: 'Homme' },
  { value: 'other', label: 'Autre' },
  { value: 'not_specified', label: 'Non précisé' },
];

const CLIENT_TYPE_OPTIONS = [
  { value: 'particulier', label: 'Particulier' },
  { value: 'professionnel', label: 'Professionnel' },
  { value: 'vip', label: 'VIP' },
  { value: 'abonne', label: 'Abonné' },
  { value: 'non_abonne', label: 'Non abonné' },
];

const DISCOUNT_TYPE_OPTIONS = [
  { value: '', label: 'Aucune remise' },
  { value: 'pro_5', label: 'Pro -5%' },
  { value: 'pro_10', label: 'Pro -10%' },
  { value: 'pro_15', label: 'Pro -15%' },
  { value: 'vip', label: 'Avantages VIP' },
  { value: 'classic', label: 'Fidélité classique' },
  { value: 'custom', label: 'Remise personnalisée' },
];

const PRO_STATUT_OPTIONS = [
  { value: 'prospect', label: 'Prospect' },
  { value: 'a_relancer', label: 'À relancer' },
  { value: 'cliente_test', label: 'Cliente test' },
  { value: 'cliente_active', label: 'Cliente active' },
  { value: 'cliente_recurrente', label: 'Cliente récurrente' },
  { value: 'cliente_vip', label: 'Cliente VIP' },
  { value: 'inactive', label: 'Inactive' },
];

const ACTIVITE_OPTIONS = [
  { value: 'onglerie', label: 'Onglerie' },
  { value: 'cils', label: 'Cils' },
  { value: 'pedicure', label: 'Pédicure' },
  { value: 'coiffure', label: 'Coiffure' },
  { value: 'esthetique', label: 'Esthétique' },
  { value: 'autre', label: 'Autre' },
];

const PRODUITS_OPTIONS = [
  { value: 'gel_x', label: 'Gel X' },
  { value: 'gel', label: 'Gel' },
  { value: 'acrylique', label: 'Acrylique' },
  { value: 'vernis', label: 'Vernis' },
  { value: 'cils', label: 'Cils' },
  { value: 'pedicure', label: 'Pédicure' },
  { value: 'strass', label: 'Strass' },
  { value: 'uv', label: 'UV / Lampe' },
  { value: 'consommable', label: 'Consommable' },
  { value: 'other', label: 'Autre' },
];

const FOURNISSEUR_OPTIONS = [
  { value: 'local', label: 'Local' },
  { value: 'france', label: 'France' },
  { value: 'usa', label: 'USA' },
  { value: 'internet', label: 'Internet' },
  { value: 'plusieurs', label: 'Plusieurs' },
];

const BUDGET_OPTIONS = [
  { value: '<100', label: '< 100 €' },
  { value: '100-200', label: '100 – 200 €' },
  { value: '200-300', label: '200 – 300 €' },
  { value: '300-500', label: '300 – 500 €' },
  { value: '+500', label: '+ 500 €' },
];

const FREQUENCE_OPTIONS = [
  { value: 'hebdo', label: 'Hebdomadaire' },
  { value: '2x_mois', label: '2× / mois' },
  { value: 'mensuel', label: 'Mensuel' },
  { value: 'occasionnel', label: 'Occasionnel' },
];

const BESOIN_OPTIONS = [
  { value: 'prix', label: 'Prix' },
  { value: 'disponibilite', label: 'Disponibilité' },
  { value: 'livraison', label: 'Livraison rapide' },
  { value: 'qualite', label: 'Qualité' },
  { value: 'choix', label: 'Choix' },
  { value: 'conseil', label: 'Conseil' },
];

function MultiChip({ options, selected, onChange }: {
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (vals: string[]) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const active = selected.includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(active ? selected.filter((v) => v !== o.value) : [...selected, o.value])}
            className={`px-2.5 py-1 rounded-full text-xs font-600 transition-colors ${
              active
                ? 'bg-violet-600 text-white'
                : 'bg-white border border-violet-200 text-violet-700 hover:border-violet-400'
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function MultiChipWithCustom({ options, selected, onChange, placeholder }: {
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (vals: string[]) => void;
  placeholder?: string;
}) {
  const [customInput, setCustomInput] = React.useState('');
  const predefinedValues = new Set(options.map((o) => o.value));
  const customValues = selected.filter((v) => !predefinedValues.has(v));

  const addCustom = () => {
    const trimmed = customInput.trim();
    if (trimmed && !selected.includes(trimmed)) onChange([...selected, trimmed]);
    setCustomInput('');
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const active = selected.includes(o.value);
          return (
            <button key={o.value} type="button"
              onClick={() => onChange(active ? selected.filter((v) => v !== o.value) : [...selected, o.value])}
              className={`px-2.5 py-1 rounded-full text-xs font-600 transition-colors ${active ? 'bg-violet-600 text-white' : 'bg-white border border-violet-200 text-violet-700 hover:border-violet-400'}`}>
              {o.label}
            </button>
          );
        })}
        {customValues.map((v) => (
          <button key={v} type="button" onClick={() => onChange(selected.filter((s) => s !== v))}
            className="px-2.5 py-1 rounded-full text-xs font-600 bg-pink-500 text-white flex items-center gap-1">
            {v} ×
          </button>
        ))}
      </div>
      <div className="flex gap-1.5">
        <input value={customInput} onChange={(e) => setCustomInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustom(); } }}
          placeholder={placeholder ?? 'Autre… (Entrée pour ajouter)'}
          className="flex-1 px-2.5 py-1.5 border border-violet-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-violet-300" />
        <button type="button" onClick={addCustom}
          className="px-2.5 py-1.5 bg-violet-100 text-violet-700 rounded-lg text-xs font-600 hover:bg-violet-200">+</button>
      </div>
    </div>
  );
}

const TRAVAILLE_A_OPTIONS = [
  { value: 'domicile', label: 'Domicile' },
  { value: 'salon', label: 'Salon' },
  { value: 'institut', label: 'Institut' },
  { value: 'mobile', label: 'Mobile' },
  { value: 'location_cabine', label: 'Location cabine' },
];

const NIVEAU_OPTIONS = [
  { value: 'debutante', label: 'Débutante' },
  { value: 'en_developpement', label: 'En développement' },
  { value: 'etablie', label: 'Établie' },
  { value: 'gros_volume', label: 'Gros volume' },
];

interface ProForm {
  statutCommercial: string;
  nomCommercial: string;
  mainActivity: string[];
  workLocation: string[];
  activityLevel: string;
  produitsUtilises: string[];
  fournisseurActuel: string[];
  budgetTranche: string;
  frequenceAchat: string;
  besoinPrincipal: string[];
  nbCabines: string;
  nbClientesSemaine: string;
  nbEmployes: string;
  marquesUtilisees: string;
  produitsRecherches: string;
  problemesFournisseurs: string;
  datePremierContact: string;
  prochainSuivi: string;
}

export default function ClientFormModal({ client, onClose, onSaved }: ClientFormModalProps) {
  const isEdit = !!client;
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState<CreateClientInput & { loyaltyDiscountValue: number }>({
    firstName: client?.firstName ?? '',
    lastName: client?.lastName ?? '',
    email: client?.email ?? '',
    phone: client?.phone ?? '',
    whatsapp: client?.whatsapp ?? '',
    dateOfBirth: client?.dateOfBirth ?? '',
    gender: client?.gender ?? 'not_specified',
    address: client?.address ?? '',
    city: client?.city ?? '',
    postalCode: client?.postalCode ?? '',
    country: client?.country ?? 'France',
    notes: client?.notes ?? '',
    clientType: client?.clientType ?? 'particulier',
    loyaltyDiscountType: client?.loyaltyDiscountType ?? null,
    loyaltyDiscountValue: client?.loyaltyDiscountValue ?? 0,
  });

  const [proForm, setProForm] = useState<ProForm>({
    statutCommercial: 'prospect',
    nomCommercial: '',
    mainActivity: [],
    workLocation: [],
    activityLevel: '',
    produitsUtilises: [],
    fournisseurActuel: [],
    budgetTranche: '',
    frequenceAchat: '',
    besoinPrincipal: [],
    nbCabines: '',
    nbClientesSemaine: '',
    nbEmployes: '',
    marquesUtilisees: '',
    produitsRecherches: '',
    problemesFournisseurs: '',
    datePremierContact: '',
    prochainSuivi: '',
  });

  const isPro = form.clientType === 'professionnel';

  // Load existing pro profile when editing
  useEffect(() => {
    if (!isEdit || !client?.id) return;
    fetch(`/api/clients/${client.id}/pro-profile`)
      .then((r) => r.json())
      .then((json) => {
        const p = json.profile;
        if (p) {
          const toArr = (v: any) => Array.isArray(v) ? v : (v ? [v] : []);
          setProForm({
            statutCommercial: p.statut_commercial ?? 'prospect',
            nomCommercial: p.salon_name ?? '',
            mainActivity: toArr(p.main_activity),
            workLocation: toArr(p.work_location),
            activityLevel: p.activity_level ?? '',
            produitsUtilises: toArr(p.produits_utilises),
            fournisseurActuel: toArr(p.fournisseur_actuel),
            budgetTranche: p.budget_tranche ?? '',
            frequenceAchat: p.frequence_achat ?? '',
            besoinPrincipal: toArr(p.besoin_principal),
            nbCabines: p.nb_cabines?.toString() ?? '',
            nbClientesSemaine: p.nb_clientes_semaine?.toString() ?? '',
            nbEmployes: p.nb_employes?.toString() ?? '',
            marquesUtilisees: p.marques_utilisees ?? '',
            produitsRecherches: p.produits_recherches ?? '',
            problemesFournisseurs: p.problemes_fournisseurs ?? '',
            datePremierContact: p.date_premier_contact ?? '',
            prochainSuivi: p.prochain_suivi ?? '',
          });
        }
      })
      .catch(() => {});
  }, [isEdit, client?.id]);

  const set = (field: string, value: any) => setForm((p) => ({ ...p, [field]: value }));
  const setPro = (field: keyof ProForm, value: any) => setProForm((p) => ({ ...p, [field]: value }));

  const showDiscountValue = form.loyaltyDiscountType === 'custom' || form.loyaltyDiscountType === 'vip' || form.loyaltyDiscountType === 'classic';

  const saveProProfile = async (clientId: string) => {
    await fetch(`/api/clients/${clientId}/pro-profile`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        statut_commercial: proForm.statutCommercial || 'prospect',
        salon_name: proForm.nomCommercial || null,
        main_activity: proForm.mainActivity,
        work_location: proForm.workLocation,
        activity_level: proForm.activityLevel || null,
        produits_utilises: proForm.produitsUtilises,
        fournisseur_actuel: proForm.fournisseurActuel,
        budget_tranche: proForm.budgetTranche || null,
        frequence_achat: proForm.frequenceAchat || null,
        besoin_principal: proForm.besoinPrincipal,
        nb_cabines: proForm.nbCabines ? parseInt(proForm.nbCabines) : null,
        nb_clientes_semaine: proForm.nbClientesSemaine ? parseInt(proForm.nbClientesSemaine) : null,
        nb_employes: proForm.nbEmployes ? parseInt(proForm.nbEmployes) : null,
        marques_utilisees: proForm.marquesUtilisees || null,
        produits_recherches: proForm.produitsRecherches || null,
        problemes_fournisseurs: proForm.problemesFournisseurs || null,
        date_premier_contact: proForm.datePremierContact || null,
        prochain_suivi: proForm.prochainSuivi || null,
      }),
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.firstName.trim() || !form.lastName.trim()) return;
    setLoading(true);
    try {
      let saved: Client | null = null;
      const payload: CreateClientInput = {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        phone: form.phone?.trim() || undefined,
        whatsapp: form.whatsapp?.trim() || undefined,
        email: form.email?.trim() || undefined,
        dateOfBirth: form.dateOfBirth || undefined,
        gender: form.gender,
        address: form.address?.trim() || undefined,
        city: form.city?.trim() || undefined,
        postalCode: form.postalCode?.trim() || undefined,
        country: form.country || 'France',
        notes: form.notes?.trim() || undefined,
        clientType: form.clientType,
        loyaltyDiscountType: (form.loyaltyDiscountType || null) as any,
        loyaltyDiscountValue: form.loyaltyDiscountValue,
      };
      if (isEdit && client) {
        saved = await clientService.update(client.id, payload);
        if (saved && isPro) await saveProProfile(saved.id);
      } else {
        const result = await clientService.create(payload);
        if (result.error) throw new Error(result.error);
        saved = result.client;
        if (saved && isPro) await saveProProfile(saved.id);
      }
      if (saved) {
        toast.success(isEdit ? 'Client enregistré' : 'Client créé');
        onSaved(saved);
      } else {
        toast.error('Erreur lors de l\'enregistrement');
      }
    } catch (err: any) {
      toast.error(`Erreur: ${err?.message ?? 'inconnue'}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-modal w-full max-w-lg mx-4 max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <h2 className="text-[16px] font-700 text-foreground">
            {isEdit ? 'Modifier le client' : 'Nouveau client'}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
            <Icon name="XMarkIcon" size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} noValidate className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-600 text-muted-foreground uppercase tracking-wide block mb-1">Prénom *</label>
              <input value={form.firstName} onChange={(e) => set('firstName', e.target.value)} required
                className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
            </div>
            <div>
              <label className="text-xs font-600 text-muted-foreground uppercase tracking-wide block mb-1">Nom *</label>
              <input value={form.lastName} onChange={(e) => set('lastName', e.target.value)} required
                className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-600 text-muted-foreground uppercase tracking-wide block mb-1">Type de client</label>
              <select value={form.clientType} onChange={(e) => set('clientType', e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white">
                {CLIENT_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-600 text-muted-foreground uppercase tracking-wide block mb-1">Genre</label>
              <select value={form.gender} onChange={(e) => set('gender', e.target.value as any)}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white">
                {GENDER_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>

          {/* ── Section Profil Professionnel ─────────────────────────────────── */}
          {isPro && (
            <div className="border border-violet-200 rounded-xl p-4 space-y-3 bg-violet-50/40">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-6 h-6 rounded-md bg-violet-100 flex items-center justify-center">
                  <Icon name="BriefcaseIcon" size={13} className="text-violet-600" />
                </div>
                <p className="text-xs font-700 text-violet-700 uppercase tracking-wide">Profil professionnel</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {/* Statut + Nom commercial */}
                <div className="col-span-2">
                  <label className="text-xs font-600 text-muted-foreground uppercase tracking-wide block mb-1">Statut professionnel</label>
                  <select value={proForm.statutCommercial} onChange={(e) => setPro('statutCommercial', e.target.value)}
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-300 bg-white">
                    {PRO_STATUT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>

                <div className="col-span-2">
                  <label className="text-xs font-600 text-muted-foreground uppercase tracking-wide block mb-1">Nom commercial</label>
                  <input
                    value={proForm.nomCommercial}
                    onChange={(e) => setPro('nomCommercial', e.target.value)}
                    placeholder="Nom du salon / institut / activité"
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-300 focus:border-violet-400"
                  />
                </div>

                {/* Activité + Lieu — MULTI */}
                <div className="col-span-2">
                  <label className="text-xs font-600 text-muted-foreground uppercase tracking-wide block mb-1.5">
                    Activité pro <span className="text-violet-400 normal-case font-400">(plusieurs possibles, ajouter les vôtres)</span>
                  </label>
                  <MultiChipWithCustom
                    options={ACTIVITE_OPTIONS}
                    selected={proForm.mainActivity}
                    onChange={(v) => setPro('mainActivity', v)}
                    placeholder="Ex: Microblading, Cryolipolyse… (Entrée)"
                  />
                </div>

                <div className="col-span-2">
                  <label className="text-xs font-600 text-muted-foreground uppercase tracking-wide block mb-1.5">
                    Travaille à <span className="text-violet-400 normal-case font-400">(plusieurs possibles)</span>
                  </label>
                  <MultiChip
                    options={TRAVAILLE_A_OPTIONS}
                    selected={proForm.workLocation}
                    onChange={(v) => setPro('workLocation', v)}
                  />
                </div>

                {/* Niveau */}
                <div className="col-span-2">
                  <label className="text-xs font-600 text-muted-foreground uppercase tracking-wide block mb-1">Niveau d'activité</label>
                  <select value={proForm.activityLevel} onChange={(e) => setPro('activityLevel', e.target.value)}
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-300 bg-white">
                    <option value="">— Choisir —</option>
                    {NIVEAU_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>

                {/* Produits utilisés — MULTI */}
                <div className="col-span-2">
                  <label className="text-xs font-600 text-muted-foreground uppercase tracking-wide block mb-1.5">
                    Produits utilisés <span className="text-violet-400 normal-case font-400">(plusieurs possibles)</span>
                  </label>
                  <MultiChip
                    options={PRODUITS_OPTIONS}
                    selected={proForm.produitsUtilises}
                    onChange={(v) => setPro('produitsUtilises', v)}
                  />
                </div>

                {/* Fournisseur — MULTI */}
                <div className="col-span-2">
                  <label className="text-xs font-600 text-muted-foreground uppercase tracking-wide block mb-1.5">
                    Fournisseur actuel <span className="text-violet-400 normal-case font-400">(plusieurs possibles)</span>
                  </label>
                  <MultiChip
                    options={FOURNISSEUR_OPTIONS}
                    selected={proForm.fournisseurActuel}
                    onChange={(v) => setPro('fournisseurActuel', v)}
                  />
                </div>

                {/* Budget */}
                <div className="col-span-2">
                  <label className="text-xs font-600 text-muted-foreground uppercase tracking-wide block mb-1">Budget / mois</label>
                  <select value={proForm.budgetTranche} onChange={(e) => setPro('budgetTranche', e.target.value)}
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-300 bg-white">
                    <option value="">— Choisir —</option>
                    {BUDGET_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>

                {/* Fréquence */}
                <div className="col-span-2">
                  <label className="text-xs font-600 text-muted-foreground uppercase tracking-wide block mb-1">Fréquence d'achat</label>
                  <select value={proForm.frequenceAchat} onChange={(e) => setPro('frequenceAchat', e.target.value)}
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-300 bg-white">
                    <option value="">— Choisir —</option>
                    {FREQUENCE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>

                {/* Besoin principal — MULTI */}
                <div className="col-span-2">
                  <label className="text-xs font-600 text-muted-foreground uppercase tracking-wide block mb-1.5">
                    Besoin principal <span className="text-violet-400 normal-case font-400">(plusieurs possibles)</span>
                  </label>
                  <MultiChip
                    options={BESOIN_OPTIONS}
                    selected={proForm.besoinPrincipal}
                    onChange={(v) => setPro('besoinPrincipal', v)}
                  />
                </div>

                {/* Chiffres clés */}
                <div className="col-span-2">
                  <label className="text-xs font-600 text-muted-foreground uppercase tracking-wide block mb-1.5">Chiffres clés</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { key: 'nbCabines', label: 'Cabines / postes', ph: '3' },
                      { key: 'nbClientesSemaine', label: 'Clientes/semaine', ph: '25' },
                      { key: 'nbEmployes', label: 'Employées', ph: '2' },
                    ].map(({ key, label, ph }) => (
                      <div key={key}>
                        <label className="text-[10px] text-violet-500 font-600 block mb-0.5">{label}</label>
                        <input type="number" min={0} value={(proForm as any)[key]}
                          onChange={(e) => setPro(key as keyof ProForm, e.target.value)}
                          placeholder={ph}
                          className="w-full px-2 py-1.5 border border-violet-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-violet-300" />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Marques */}
                <div className="col-span-2">
                  <label className="text-xs font-600 text-muted-foreground uppercase tracking-wide block mb-1">Marques utilisées</label>
                  <textarea value={proForm.marquesUtilisees} onChange={(e) => setPro('marquesUtilisees', e.target.value)}
                    rows={2} placeholder="Ex: OPI, CND, Manucurist…"
                    className="w-full px-3 py-2 border border-violet-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-violet-300 resize-none" />
                </div>

                {/* Produits recherchés */}
                <div className="col-span-2">
                  <label className="text-xs font-600 text-muted-foreground uppercase tracking-wide block mb-1">Produits recherchés / introuvables</label>
                  <textarea value={proForm.produitsRecherches} onChange={(e) => setPro('produitsRecherches', e.target.value)}
                    rows={2} placeholder="Ex: durcisseur UV pro, limes 100/180…"
                    className="w-full px-3 py-2 border border-violet-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-violet-300 resize-none" />
                </div>

                {/* Problèmes fournisseurs */}
                <div className="col-span-2">
                  <label className="text-xs font-600 text-muted-foreground uppercase tracking-wide block mb-1">Problèmes avec les fournisseurs actuels</label>
                  <textarea value={proForm.problemesFournisseurs} onChange={(e) => setPro('problemesFournisseurs', e.target.value)}
                    rows={2} placeholder="Ex: délais longs, prix élevés, ruptures…"
                    className="w-full px-3 py-2 border border-violet-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-violet-300 resize-none" />
                </div>

                {/* Dates suivi */}
                <div>
                  <label className="text-xs font-600 text-muted-foreground uppercase tracking-wide block mb-1">1er contact</label>
                  <input type="date" value={proForm.datePremierContact} onChange={(e) => setPro('datePremierContact', e.target.value)}
                    className="w-full px-3 py-2 border border-violet-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-violet-300" />
                </div>
                <div>
                  <label className="text-xs font-600 text-muted-foreground uppercase tracking-wide block mb-1">Prochain suivi</label>
                  <input type="date" value={proForm.prochainSuivi} onChange={(e) => setPro('prochainSuivi', e.target.value)}
                    className="w-full px-3 py-2 border border-violet-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-violet-300" />
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-600 text-muted-foreground uppercase tracking-wide block mb-1">Téléphone</label>
              <input value={form.phone ?? ''} onChange={(e) => set('phone', e.target.value)} placeholder="06 00 00 00 00"
                className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
            </div>
            <div>
              <label className="text-xs font-600 text-muted-foreground uppercase tracking-wide block mb-1">WhatsApp</label>
              <input value={form.whatsapp ?? ''} onChange={(e) => set('whatsapp', e.target.value)} placeholder="06 00 00 00 00"
                className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
            </div>
          </div>

          <div>
            <label className="text-xs font-600 text-muted-foreground uppercase tracking-wide block mb-1">Email</label>
            <input type="email" value={form.email ?? ''} onChange={(e) => set('email', e.target.value)} placeholder="client@email.com"
              className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
          </div>

          {/* Loyalty discount */}
          <div className="border border-border rounded-xl p-3 space-y-2 bg-muted/20">
            <p className="text-xs font-600 text-muted-foreground uppercase tracking-wide">Remise fidélité</p>
            <select value={form.loyaltyDiscountType ?? ''} onChange={(e) => set('loyaltyDiscountType', e.target.value || null)}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white">
              {DISCOUNT_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            {showDiscountValue && (
              <div className="flex items-center gap-2">
                <input type="number" min={0} max={100} value={form.loyaltyDiscountValue}
                  onChange={(e) => set('loyaltyDiscountValue', parseFloat(e.target.value) || 0)}
                  placeholder="Ex: 10"
                  className="w-24 px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
                <span className="text-sm text-muted-foreground">% de remise</span>
              </div>
            )}
          </div>

          <div>
            <label className="text-xs font-600 text-muted-foreground uppercase tracking-wide block mb-1">Date de naissance</label>
            <input type="date" value={form.dateOfBirth ?? ''} onChange={(e) => set('dateOfBirth', e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
          </div>

          <div>
            <label className="text-xs font-600 text-muted-foreground uppercase tracking-wide block mb-1">Adresse</label>
            <input value={form.address ?? ''} onChange={(e) => set('address', e.target.value)} placeholder="Rue, numéro..."
              className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-600 text-muted-foreground uppercase tracking-wide block mb-1">Code postal</label>
              <input value={form.postalCode ?? ''} onChange={(e) => set('postalCode', e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
            </div>
            <div className="col-span-2">
              <label className="text-xs font-600 text-muted-foreground uppercase tracking-wide block mb-1">Ville</label>
              <input value={form.city ?? ''} onChange={(e) => set('city', e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
            </div>
          </div>

          <div>
            <label className="text-xs font-600 text-muted-foreground uppercase tracking-wide block mb-1">Pays</label>
            <select value={form.country ?? 'Martinique'} onChange={(e) => set('country', e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white">
              <option value="Martinique">Martinique</option>
              <option value="Guadeloupe">Guadeloupe</option>
              <option value="Guyane">Guyane</option>
              <option value="La Réunion">La Réunion</option>
              <option value="Mayotte">Mayotte</option>
              <option value="France">France métropolitaine</option>
              <option value="Autre">Autre</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-600 text-muted-foreground uppercase tracking-wide block mb-1">Notes internes</label>
            <textarea value={form.notes ?? ''} onChange={(e) => set('notes', e.target.value)} rows={2} placeholder="Préférences, informations importantes..."
              className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary resize-none" />
          </div>
        </form>

        <div className="flex gap-3 px-6 pb-6 pt-4 border-t border-border shrink-0">
          <button type="button" onClick={onClose} className="flex-1 py-2.5 border border-border rounded-xl text-sm font-600 text-muted-foreground hover:bg-muted transition-colors">
            Annuler
          </button>
          <button type="button" onClick={handleSubmit as any} disabled={loading || !form.firstName.trim() || !form.lastName.trim()}
            className="flex-1 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-700 hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2">
            {loading ? <><Icon name="ArrowPathIcon" size={14} className="animate-spin" />Enregistrement…</> : <><Icon name="CheckIcon" size={14} />{isEdit ? 'Enregistrer' : 'Créer le client'}</>}
          </button>
        </div>
      </div>
    </div>
  );
}
