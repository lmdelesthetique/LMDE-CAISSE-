import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getSegmentStats } from '@/lib/segmentationService';

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

    // ── 1. Receipts for current month ──────────────────────────────────────────
    const { data: receipts } = await supabase
      .from('receipts')
      .select('id, total_amount, items, payment_method')
      .gte('created_at', startOfMonth)
      .neq('status', 'cancelled')
      .not('is_demo', 'eq', true);

    const totalCA = (receipts ?? []).reduce((s, r) => s + parseFloat(r.total_amount ?? 0), 0);
    const nbTickets = receipts?.length ?? 0;
    const panierMoyen = nbTickets > 0 ? totalCA / nbTickets : 0;

    // ── 2. Top 10 products from receipt items ──────────────────────────────────
    const productSalesMap: Record<string, { name: string; qty: number; revenue: number }> = {};
    for (const r of receipts ?? []) {
      const items = Array.isArray(r.items) ? r.items : [];
      for (const item of items) {
        const name = (item.name ?? 'Inconnu').trim();
        if (!productSalesMap[name]) productSalesMap[name] = { name, qty: 0, revenue: 0 };
        productSalesMap[name].qty += item.qty ?? item.quantity ?? 1;
        productSalesMap[name].revenue += item.total ?? (item.price * (item.qty ?? 1));
      }
    }
    const topProduits = Object.values(productSalesMap)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10)
      .map(p => ({ name: p.name, qty: p.qty, revenue: parseFloat(p.revenue.toFixed(2)) }));

    // ── 3. Dormant products (stock > 0, not sold in 30 days) ──────────────────
    const { data: allActiveProducts } = await supabase
      .from('products')
      .select('id, name, stock')
      .gt('stock', 0)
      .not('product_status', 'in', '("inactive","coming_soon")');

    const { data: recentReceipts } = await supabase
      .from('receipts')
      .select('items')
      .gte('created_at', d30ago.toISOString())
      .neq('status', 'cancelled')
      .not('is_demo', 'eq', true);

    const soldLast30 = new Set<string>();
    for (const r of recentReceipts ?? []) {
      const items = Array.isArray(r.items) ? r.items : [];
      for (const item of items) {
        soldLast30.add((item.name ?? '').toLowerCase().trim());
      }
    }
    const produitsDormants = (allActiveProducts ?? [])
      .filter(p => !soldLast30.has(p.name.toLowerCase().trim()))
      .sort((a, b) => b.stock - a.stock)
      .slice(0, 10)
      .map(p => ({ name: p.name, stock: p.stock }));

    // ── 4. Rupture products (stock ≤ 5) ────────────────────────────────────────
    const { data: ruptureProducts } = await supabase
      .from('products')
      .select('name, stock')
      .lte('stock', 5)
      .gt('stock', 0)
      .not('product_status', 'in', '("inactive","coming_soon")');

    const produitsRupture = (ruptureProducts ?? [])
      .sort((a, b) => a.stock - b.stock)
      .slice(0, 10)
      .map(p => ({ name: p.name, stock: p.stock }));

    // ── 5. Segments ────────────────────────────────────────────────────────────
    const segments = await getSegmentStats();

    const data: MLDEData = {
      totalCA,
      nbTickets,
      panierMoyen: parseFloat(panierMoyen.toFixed(2)),
      shopifyCA: 0,
      topProduits,
      produitsDormants,
      produitsRupture,
      segmentActifs: segments['actifs_30j'] ?? 0,
      segmentTiedes: segments['tièdes_90j'] ?? 0,
      segmentInactifs: segments['inactifs_90j'] ?? 0,
      segmentVIP: segments['vip'] ?? 0,
      segmentAbonnees: segments['abonnees'] ?? 0,
      segmentNouvelles: segments['nouvelles'] ?? 0,
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
