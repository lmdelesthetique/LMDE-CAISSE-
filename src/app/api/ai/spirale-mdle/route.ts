import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

interface WeekStat {
  semaine: number;
  jours: string;
  ca: number;
  nb_tickets: number;
}

interface MLDEData {
  totalCA: number;
  nbTickets: number;
  panierMoyen: number;
  shopifyCA: number;
  topProduits: { name: string; qty: number; revenue: number }[];
  produitsDormants: { name: string; stock: number }[];
  produitsRupture: { name: string; stock: number }[];
  segmentActifs: number;
  segmentTiedes: number;
  segmentInactifs: number;
  segmentVIP: number;
  segmentAbonnees: number;
  segmentNouvelles: number;
  caParSemaine: WeekStat[];
  casMoisPrecedent: number;
  ticketsMoisPrecedent: number;
  semaineCreuse: number;
  semaineForte: number;
}

function mockSpiraleMLDE(d: MLDEData) {
  const starProduit = d.topProduits[0]?.name ?? 'TOP COAT UV';
  const dormantProduit = d.produitsDormants[0];
  const ruptureProduit = d.produitsRupture[0];
  return {
    diagnostic: {
      ca_evolution: `CA ce mois : ${d.totalCA.toFixed(0)}€ — configurez ANTHROPIC_API_KEY pour l'analyse réelle`,
      segment_plus_actif: `Actives 30j (${d.segmentActifs} clientes)`,
      segment_a_risque: `Inactives 90j+ (${d.segmentInactifs} clientes)`,
      produit_star: starProduit,
      produit_dormant_prioritaire: dormantProduit ? `${dormantProduit.name} (${dormantProduit.stock} en stock)` : 'Aucun produit dormant détecté',
      alerte: ruptureProduit ? `⚠️ ${d.produitsRupture.length} produit(s) en stock critique — commande urgente` : null,
    },
    offres_groupees: [
      {
        nom: 'Bundle Star du Mois',
        produits: d.topProduits.slice(0, 2).map(p => p.name),
        prix_normal: 35,
        prix_offre: 28,
        economie: 7,
        cible: 'VIP inactives 45j+',
        argument: 'Vos bestsellers à prix exclusif — 48h seulement',
        canal: 'WhatsApp',
        urgence: '48h',
      },
    ],
    spirale_semaine: {
      produit_vedette: starProduit,
      j1_lundi: {
        type: 'Reel Problème',
        angle: 'RÉALITÉ TERRAIN',
        hook: `Pourquoi ton vernis tient pas plus de 2 jours ?`,
        canal: 'Instagram Feed + Story',
        mot_cle_manychat: 'DURABLE',
      },
      j2_mardi: {
        type: 'Reel Résultat',
        angle: 'PREUVE TERRAIN',
        hook: `6 semaines plus tard — regarde le résultat`,
        canal: 'TikTok',
      },
      j3_mercredi: {
        type: 'Story + WhatsApp',
        message_whatsapp: `Bonjour {{prenom}} 💅 Notre ${starProduit} cartonne ! Disponible maintenant. Le Monde de l'Esthétique`,
        segment_cible: 'Actives 30j',
      },
      j4_jeudi: {
        type: 'Post Feed',
        contenu: `Avant / Après avec ${starProduit} — technique professionnelle dévoilée`,
        hashtags: '#MDLE #BeautéMartinique #OnglerieMartinique',
      },
      j5_vendredi: {
        type: 'Vendredi Vérité Live 19h45',
        produits_live: d.topProduits.slice(0, 4).map(p => p.name),
        mots_cles_manychat: ['CODE1', 'CODE2', 'CODE3', 'CODE4'],
        phrase_ouverture: `Bonsoir ! Ce soir on parle résultats réels — restez jusqu'au bout pour l'offre exclusive`,
        offre_exclusive_live: '-20% sur le bundle star pour les viewers qui commentent LIVE',
      },
    },
    kit_ambassadrices: {
      produit: starProduit,
      hooks: [
        `J'ai testé ça en Martinique et là je comprends`,
        `Pourquoi toutes mes copines m'ont demandé le secret`,
        `${starProduit} — avant je doutais, maintenant je commande en double`,
      ],
      script_reel: `Début : montre tes ongles avant (naturel, sans filtre). "Bon je vous montre honnêtement..." Milieu : applique le produit en temps réel, commente ta technique. "Ce qui change tout c'est..." Fin : résultat sous bonne lumière. "Commandez maintenant — lien en bio ou tapez ${starProduit.split(' ')[0]} en commentaire"`,
      script_story: `"Vous m'avez demandé mon secret. C'est ${starProduit}. Tapez VOULOIR en réponse et je vous envoie le lien."`,
      temoignage: `Franchement j'étais sceptique mais ça fait maintenant 3 semaines et mes ongles tiennent toujours ! Je recommande à toutes mes amies 💅`,
      legende: `✨ Le secret que j'aurais voulu connaître avant 💅\n\n${starProduit} — disponible chez @mondedelesthetique_mq\n\nTapez VOULOIR en commentaire pour recevoir le lien direct 📩\n\n#MDLE #BeautéMartinique #OnglerieMQ #BeautyTips`,
      mot_cle_manychat: starProduit.split(' ')[0],
    },
    reactivation: {
      segment: 'Inactives 90j+',
      nb_clientes: d.segmentInactifs,
      ca_potentiel: `${Math.round(d.segmentInactifs * 0.2 * 35)}€ estimés si 20% reviennent`,
      message_whatsapp: `Bonjour {{prenom}} 👋 Ça fait un moment ! On a de nouveaux produits qui vous correspondent. -20% valable 7 jours rien que pour vous. Code : RETOUR20 💅 Le Monde de l'Esthétique`,
      offre: '-20% sur le prochain achat',
      duree_offre: '7 jours',
      suivi_j3: 'Si pas de réponse J+3 : renvoyer avec une photo du produit star + témoignage cliente',
    },
    alertes_stock: {
      ruptures: d.produitsRupture.map(p => ({
        produit: p.name,
        action: `Commander minimum 20 unités en urgence (stock actuel : ${p.stock})`,
      })),
      dormants: d.produitsDormants.slice(0, 5).map(p => ({
        produit: p.name,
        stock: p.stock,
        action: p.stock > 10 ? 'Offrir à 2 ambassadrices pour générer du contenu authentique' : 'Créer une offre flash bundle pour écouler le stock',
      })),
      stars_a_pousser: d.topProduits.slice(0, 3).map(p => ({
        produit: p.name,
        action: `Doubler le stock avant rupture — ${p.qty} vendus ce mois`,
      })),
    },
    cycle_modele: {
      phase_actuelle: d.segmentInactifs > d.segmentActifs ? 'fideliser' : 'convertir',
      phase_suivante: 'ambassadrice',
      raison: `${d.segmentInactifs} inactives signalent une phase de réactivation prioritaire`,
      action_concrete: 'Lancer campagne réactivation WhatsApp + live vendredi + kit ambassadrices simultanément',
    },
    tendances_mois: {
      analyse: `Semaine ${d.semaineCreuse} est la plus creuse (${d.caParSemaine[d.semaineCreuse - 1]?.ca.toFixed(0) ?? 0}€). Configurez ANTHROPIC_API_KEY pour une analyse IA réelle.`,
      periode_creuse: `Semaine ${d.semaineCreuse} — ${d.caParSemaine[d.semaineCreuse - 1]?.jours ?? '?'}`,
      periode_forte: `Semaine ${d.semaineForte} — ${d.caParSemaine[d.semaineForte - 1]?.jours ?? '?'}`,
      facteur_risque: 'Fin de mois : baisse de trésorerie client probable — lancer offres dès S3',
      evolution_vs_mois_precedent: d.casMoisPrecedent > 0
        ? `${((d.totalCA - d.casMoisPrecedent) / d.casMoisPrecedent * 100).toFixed(1)}% vs mois précédent (${d.casMoisPrecedent.toFixed(0)}€)`
        : 'Données mois précédent insuffisantes',
      ca_par_semaine: d.caParSemaine,
    },
    plan_preventif: [
      {
        declencheur: `CA semaine inférieur à ${Math.round(d.totalCA / 5)}€`,
        semaine_cible: `Semaine ${d.semaineCreuse} (${d.caParSemaine[d.semaineCreuse - 1]?.jours ?? '?'})`,
        action: 'Lancer une offre flash 48h sur le produit star',
        canal: 'WhatsApp + Story Instagram',
        message_ou_contenu: `Offre spéciale 48h sur ${starProduit} — réservé à nos clientes fidèles`,
        objectif: `Récupérer ${Math.round(d.totalCA * 0.15)}€ minimum`,
      },
      {
        declencheur: 'Dès le 20 du mois si CA cumulé < objectif',
        semaine_cible: 'Semaine 4 (22-fin du mois)',
        action: 'Live vendredi dédié fin de mois + bundle économique',
        canal: 'Instagram Live + WhatsApp',
        message_ou_contenu: 'Bundle fin de mois : 2 produits achetés = 1 offert — ce vendredi soir 19h45',
        objectif: `Atteindre ${Math.round(d.totalCA * 1.1)}€ avant fin de mois`,
      },
    ],
    recommandations: [
      `Relancer les ${d.segmentInactifs} clientes inactives 90j+ cette semaine avec code RETOUR20 — potentiel ${Math.round(d.segmentInactifs * 0.2 * 35)}€`,
      `Commander 20+ unités de ${d.produitsRupture[0]?.name ?? 'top produits'} avant rupture totale`,
      `Offrir ${d.produitsDormants[0]?.name ?? 'produit dormant'} à 3 ambassadrices cette semaine pour générer du contenu`,
    ],
  };
}

export async function POST(_req: NextRequest) {
  try {
    const supabase = createAdminClient();
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const d30ago = new Date(now); d30ago.setDate(now.getDate() - 30);

    const d90ago = new Date(now); d90ago.setDate(now.getDate() - 90);
    const startOfPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
    const endOfPrevMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59).toISOString();

    // ── Tout en parallèle — une seule vague de requêtes ───────────────────────
    const [
      { data: receipts },
      { data: prevMonthReceipts },
      { data: allActiveProducts },
      { data: ruptureProducts },
      { count: countTous },
      { count: countAbonnees },
      { count: countNouvelles },
      { data: vipRows },
      { data: actifRows },
      { data: tiede90Rows },
    ] = await Promise.all([
      supabase.from('receipts').select('total_amount, items, created_at')
        .gte('created_at', startOfMonth).neq('status', 'cancelled').not('is_demo', 'eq', true),
      supabase.from('receipts').select('total_amount, created_at')
        .gte('created_at', startOfPrevMonth).lte('created_at', endOfPrevMonth)
        .neq('status', 'cancelled').not('is_demo', 'eq', true),
      supabase.from('products').select('id, name, stock')
        .gt('stock', 0).neq('product_status', 'inactive').neq('product_status', 'coming_soon'),
      supabase.from('products').select('name, stock')
        .lte('stock', 5).gt('stock', 0).neq('product_status', 'inactive').neq('product_status', 'coming_soon'),
      supabase.from('clients').select('*', { count: 'exact', head: true }).not('phone', 'is', null).neq('phone', ''),
      supabase.from('client_subscriptions').select('*', { count: 'exact', head: true }).eq('status', 'active'),
      supabase.from('clients').select('*', { count: 'exact', head: true }).gte('created_at', d30ago.toISOString()).not('phone', 'is', null).neq('phone', ''),
      supabase.from('receipts').select('client_id, total_amount').not('client_id', 'is', null).neq('status', 'cancelled'),
      supabase.from('receipts').select('client_id').gte('created_at', d30ago.toISOString()).not('client_id', 'is', null).neq('status', 'cancelled'),
      supabase.from('receipts').select('client_id').gte('created_at', d90ago.toISOString()).not('client_id', 'is', null).neq('status', 'cancelled'),
    ]);

    // ── CA + tendances ─────────────────────────────────────────────────────────
    const totalCA = (receipts ?? []).reduce((s, r) => s + parseFloat(r.total_amount ?? 0), 0);
    const nbTickets = receipts?.length ?? 0;
    const panierMoyen = nbTickets > 0 ? totalCA / nbTickets : 0;
    const casMoisPrecedent = (prevMonthReceipts ?? []).reduce((s, r) => s + parseFloat(r.total_amount ?? 0), 0);
    const ticketsMoisPrecedent = prevMonthReceipts?.length ?? 0;

    const weekRanges = [
      { semaine: 1, start: 1, end: 7, jours: '1-7' },
      { semaine: 2, start: 8, end: 14, jours: '8-14' },
      { semaine: 3, start: 15, end: 21, jours: '15-21' },
      { semaine: 4, start: 22, end: 31, jours: '22-fin' },
    ];
    const caParSemaine: WeekStat[] = weekRanges.map(({ semaine, start, end, jours }) => {
      const filtered = (receipts ?? []).filter(r => {
        const day = new Date(r.created_at).getDate();
        return day >= start && day <= end;
      });
      return { semaine, jours, ca: parseFloat(filtered.reduce((s, r) => s + parseFloat(r.total_amount ?? 0), 0).toFixed(2)), nb_tickets: filtered.length };
    });
    const semaineForte = caParSemaine.reduce((best, w) => (w.ca > caParSemaine[best - 1].ca ? w.semaine : best), 1);
    const semaineCreuse = caParSemaine.reduce((worst, w) => {
      return (w.ca < caParSemaine[worst - 1].ca && w.nb_tickets > 0) ? w.semaine : worst;
    }, semaineForte);

    // ── Top produits ───────────────────────────────────────────────────────────
    const productSalesMap: Record<string, { name: string; qty: number; revenue: number }> = {};
    const soldLast30 = new Set<string>();
    const d30agoStr = d30ago.toISOString();
    for (const r of receipts ?? []) {
      const items = Array.isArray(r.items) ? r.items : [];
      for (const item of items) {
        const name = (item.name ?? 'Inconnu').trim();
        if (!productSalesMap[name]) productSalesMap[name] = { name, qty: 0, revenue: 0 };
        productSalesMap[name].qty += item.qty ?? item.quantity ?? 1;
        productSalesMap[name].revenue += item.total ?? (item.price * (item.qty ?? 1));
        if (r.created_at >= d30agoStr) soldLast30.add(name.toLowerCase());
      }
    }
    const topProduits = Object.values(productSalesMap).sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10).map(p => ({ name: p.name, qty: p.qty, revenue: parseFloat(p.revenue.toFixed(2)) }));

    // ── Produits dormants + rupture ────────────────────────────────────────────
    const produitsDormants = (allActiveProducts ?? [])
      .filter(p => !soldLast30.has(p.name.toLowerCase().trim()))
      .sort((a, b) => b.stock - a.stock).slice(0, 10)
      .map(p => ({ name: p.name, stock: p.stock }));

    const produitsRupture = (ruptureProducts ?? [])
      .sort((a, b) => a.stock - b.stock).slice(0, 10)
      .map(p => ({ name: p.name, stock: p.stock }));

    // VIP: clients with total spent >= 500
    const vipMap: Record<string, number> = {};
    for (const r of vipRows ?? []) {
      vipMap[r.client_id] = (vipMap[r.client_id] ?? 0) + parseFloat(r.total_amount ?? 0);
    }
    const segmentVIP = Object.values(vipMap).filter(v => v >= 500).length;

    const actifIds = new Set((actifRows ?? []).map((r: any) => r.client_id));
    const tiede90Ids = new Set((tiede90Rows ?? []).map((r: any) => r.client_id));
    const segmentActifs = actifIds.size;
    const segmentTiedes = [...tiede90Ids].filter(id => !actifIds.has(id)).length;
    const segmentInactifs = Math.max(0, (countTous ?? 0) - tiede90Ids.size);

    const data: MLDEData = {
      totalCA,
      nbTickets,
      panierMoyen: parseFloat(panierMoyen.toFixed(2)),
      shopifyCA: 0,
      topProduits,
      produitsDormants,
      produitsRupture,
      segmentActifs,
      segmentTiedes,
      segmentInactifs,
      segmentVIP,
      segmentAbonnees: countAbonnees ?? 0,
      segmentNouvelles: countNouvelles ?? 0,
      caParSemaine,
      casMoisPrecedent: parseFloat(casMoisPrecedent.toFixed(2)),
      ticketsMoisPrecedent,
      semaineCreuse,
      semaineForte,
    };

    const apiKey = process.env.ANTHROPIC_API_KEY ?? '';
    const hasClaude = apiKey && apiKey !== 'your-anthropic-api-key-here';

    if (!hasClaude) {
      return NextResponse.json({ strategy: mockSpiraleMLDE(data), usedMock: true, data });
    }

    // ── 6. Build Spirale MDLE prompt ───────────────────────────────────────────
    const prompt = `Tu es un stratège marketing senior spécialisé en e-commerce beauté. Tu travailles pour Le Monde de l'Esthétique (LMDE), boutique beauté en Martinique.

Notre système : La Spirale MDLE
S1 → 9 contenus par produit (3 angles × 3 formats)
S2 → Cascade 5 jours / 4 canaux
S3 → Kit ambassadrices (elles filment leur propre contenu)
S4 → Parrainage gamifié à points
S5 → Chaque vente génère du nouveau contenu client

DONNÉES RÉELLES DE LA PÉRIODE :
CA Total : ${data.totalCA.toFixed(2)}€
Nombre de tickets : ${data.nbTickets}
Panier moyen : ${data.panierMoyen.toFixed(2)}€

TOP 10 PRODUITS CE MOIS :
${JSON.stringify(data.topProduits, null, 2)}

PRODUITS DORMANTS (stock > 0, 0 vente 30j) :
${JSON.stringify(data.produitsDormants, null, 2)}

PRODUITS EN RUPTURE OU STOCK CRITIQUE :
${JSON.stringify(data.produitsRupture, null, 2)}

SEGMENTS CLIENTS :
- Actives 30j : ${data.segmentActifs} clientes
- Tièdes 30-90j : ${data.segmentTiedes} clientes
- Inactives 90j+ : ${data.segmentInactifs} clientes
- VIP (top 20%) : ${data.segmentVIP} clientes
- Abonnées box : ${data.segmentAbonnees} clientes
- Nouvelles (≤2 achats) : ${data.segmentNouvelles} clientes

TENDANCES CA PAR SEMAINE CE MOIS :
${data.caParSemaine.map(w => `  Semaine ${w.semaine} (jours ${w.jours}) : ${w.ca.toFixed(2)}€ — ${w.nb_tickets} tickets`).join('\n')}

COMPARAISON MOIS PRÉCÉDENT :
- CA mois précédent : ${data.casMoisPrecedent.toFixed(2)}€ (${data.ticketsMoisPrecedent} tickets)
- CA mois actuel : ${data.totalCA.toFixed(2)}€ (${data.nbTickets} tickets)
- Évolution : ${data.casMoisPrecedent > 0 ? ((data.totalCA - data.casMoisPrecedent) / data.casMoisPrecedent * 100).toFixed(1) + '%' : 'N/A'}
- Semaine la plus forte ce mois : Semaine ${data.semaineForte} (${data.caParSemaine[data.semaineForte - 1]?.ca.toFixed(2)}€)
- Semaine la plus creuse ce mois : Semaine ${data.semaineCreuse} (${data.caParSemaine[data.semaineCreuse - 1]?.ca.toFixed(2)}€)

Réponds UNIQUEMENT en JSON valide sans markdown. Structure exacte requise :

{
  "diagnostic": {
    "ca_evolution": "CA vs mois dernier en %",
    "segment_plus_actif": "nom du segment",
    "segment_a_risque": "nom + nombre de clientes",
    "produit_star": "nom du produit",
    "produit_dormant_prioritaire": "nom + stock actuel",
    "alerte": "1 phrase urgente si nécessaire ou null"
  },
  "offres_groupees": [
    {
      "nom": "Nom accrocheur de l'offre",
      "produits": ["produit1", "produit2"],
      "prix_normal": 0,
      "prix_offre": 0,
      "economie": 0,
      "cible": "segment exact",
      "argument": "pourquoi maintenant",
      "canal": "WhatsApp ou Instagram ou Live",
      "urgence": "durée de l'offre"
    }
  ],
  "spirale_semaine": {
    "produit_vedette": "nom exact du top produit",
    "j1_lundi": {
      "type": "Reel Problème",
      "angle": "RÉALITÉ TERRAIN",
      "hook": "accroche exacte 10 mots max",
      "canal": "Instagram Feed + Story",
      "mot_cle_manychat": "1 mot"
    },
    "j2_mardi": {
      "type": "Reel Résultat",
      "angle": "PREUVE TERRAIN",
      "hook": "accroche exacte",
      "canal": "TikTok"
    },
    "j3_mercredi": {
      "type": "Story + WhatsApp",
      "message_whatsapp": "message exact avec {{prenom}} max 160 caractères",
      "segment_cible": "segment exact"
    },
    "j4_jeudi": {
      "type": "Post Feed",
      "contenu": "description exacte du contenu",
      "hashtags": "#MDLE + hashtags pertinents Martinique beauté"
    },
    "j5_vendredi": {
      "type": "Vendredi Vérité Live 19h45",
      "produits_live": ["prod1", "prod2", "prod3", "prod4"],
      "mots_cles_manychat": ["mot1", "mot2", "mot3", "mot4"],
      "phrase_ouverture": "phrase exacte pour ouvrir le live",
      "offre_exclusive_live": "ce qu'on réserve aux viewers"
    }
  },
  "kit_ambassadrices": {
    "produit": "nom",
    "hooks": [
      "Hook 1 percutant 10 mots",
      "Hook 2 percutant 10 mots",
      "Hook 3 percutant 10 mots"
    ],
    "script_reel": "script complet 60 secondes naturel martiniquais",
    "script_story": "script 15 secondes",
    "temoignage": "texte naturel comme une vraie cliente martiniquaise",
    "legende": "légende prête à copier avec emojis et hashtags",
    "mot_cle_manychat": "1 mot simple"
  },
  "reactivation": {
    "segment": "nom du segment prioritaire",
    "nb_clientes": 0,
    "ca_potentiel": "estimation si 20% reviennent",
    "message_whatsapp": "message exact avec {{prenom}} max 160 caractères",
    "offre": "ce qu'on leur propose",
    "duree_offre": "X jours",
    "suivi_j3": "quoi faire si pas de réponse après 3 jours"
  },
  "alertes_stock": {
    "ruptures": [
      {"produit": "nom", "action": "commander combien en urgence"}
    ],
    "dormants": [
      {"produit": "nom", "stock": 0, "action": "promo flash ou bundle ou ambassadrice"}
    ],
    "stars_a_pousser": [
      {"produit": "nom", "action": "doubler stock ou faire un lot"}
    ]
  },
  "cycle_modele": {
    "phase_actuelle": "attirer ou convertir ou fideliser ou ambassadrice",
    "phase_suivante": "nom",
    "raison": "pourquoi ce moment précis",
    "action_concrete": "quoi faire exactement cette semaine"
  },
  "tendances_mois": {
    "analyse": "2-3 phrases : décris la courbe du CA sur les 4 semaines, identifie le pattern récurrent (début fort/fin faible ?), explique pourquoi (fin de mois = trésorerie client basse, paies du 28, etc.)",
    "periode_creuse": "Semaine X (jours X-X) — CA le plus faible avec chiffre exact",
    "periode_forte": "Semaine X (jours X-X) — CA le plus fort avec chiffre exact",
    "facteur_risque": "Raison principale de la baisse (fin de mois en Martinique, effet paie, vacances scolaires, etc.)",
    "evolution_vs_mois_precedent": "+X% ou -X% avec les deux chiffres exacts",
    "ca_par_semaine": [
      { "semaine": 1, "jours": "1-7", "ca": 0, "nb_tickets": 0 },
      { "semaine": 2, "jours": "8-14", "ca": 0, "nb_tickets": 0 },
      { "semaine": 3, "jours": "15-21", "ca": 0, "nb_tickets": 0 },
      { "semaine": 4, "jours": "22-fin", "ca": 0, "nb_tickets": 0 }
    ]
  },
  "plan_preventif": [
    {
      "declencheur": "Condition précise qui déclenche l'action (ex: CA semaine < X€ ou on est à J20)",
      "semaine_cible": "Semaine X — quand agir exactement",
      "action": "Action concrète et précise à mettre en place",
      "canal": "WhatsApp / Instagram Live / Story / Email",
      "message_ou_contenu": "Message ou type de contenu exact à publier/envoyer",
      "objectif": "Objectif chiffré en € ou en clientes"
    }
  ],
  "recommandations": [
    "Action concrète 1 avec chiffres précis",
    "Action concrète 2 avec chiffres précis",
    "Action concrète 3 avec chiffres précis"
  ]
}`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 4000,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) throw new Error(`Claude API error: ${response.status}`);
    const claudeData = await response.json();
    const text: string = claudeData.content?.[0]?.text ?? '';

    let strategy: any;
    try {
      strategy = JSON.parse(text);
    } catch {
      const match = text.match(/\{[\s\S]*\}/);
      strategy = match ? JSON.parse(match[0]) : mockSpiraleMLDE(data);
    }

    return NextResponse.json({ strategy, usedMock: false, data });
  } catch (e: any) {
    console.error('[ai/spirale-mdle]', e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
