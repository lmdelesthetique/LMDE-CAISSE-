import { NextRequest, NextResponse } from 'next/server';
import { getSegmentStats, SEGMENTS } from '@/lib/segmentationService';

function mockStrategy(stats: Record<string, number>) {
  const total = stats['tous'] ?? 0;
  const actives = stats['actifs_30j'] ?? 0;
  const inactives = stats['inactifs_90j'] ?? 0;
  const vip = stats['vip'] ?? 0;
  return {
    resume: `Votre base compte ${total} clientes dont ${actives} actives ce mois. ${inactives} inactives sont à relancer en priorité.`,
    segments_prioritaires: [
      { segment: 'inactifs_90j', raison: 'Risque de perte élevé, relance urgente recommandée', action: 'Offre de retour -20% valable 7 jours' },
      { segment: 'vip', raison: `${vip} clientes VIP à fidéliser avec des offres exclusives`, action: 'Programme VIP avec accès prioritaire et cadeaux' },
      { segment: 'abonnees', raison: 'Maximiser la rétention des abonnées', action: 'Rappel box mensuelle + upsell accessoires' },
    ],
    messages_suggeres: [
      { segment: 'tous', message: `Bonjour {prénom} 💄 Votre beauté est notre priorité ! Découvrez nos nouveautés et offres exclusives. Le Monde de l'Esthétique 💅` },
      { segment: 'inactifs_90j', message: `Bonjour {prénom} 👋 Vous nous manquez ! Revenez avec -20% sur votre prochaine visite, valable 7 jours. Code : RETOUR20 Le Monde de l'Esthétique 💅` },
      { segment: 'vip', message: `Bonjour {prénom} ⭐ En tant que cliente VIP, découvrez en avant-première notre nouvelle collection. Accès exclusif 48h. Le Monde de l'Esthétique 💅` },
    ],
    calendrier: [
      { semaine: 1, action: 'Relance des inactives (90j+) avec offre de retour' },
      { semaine: 2, action: 'Campagne VIP — offre exclusive produits premium' },
      { semaine: 3, action: 'Rappel abonnées — personnalisation box du mois' },
      { semaine: 4, action: 'Campagne générale — promotion de saison' },
    ],
    kpi_cibles: {
      taux_ouverture: '85%',
      taux_conversion: '15%',
      ca_additionnel_estime: `${Math.round(actives * 35 * 0.15)} €`,
    },
    conseil_principal: `Configurez votre clé ANTHROPIC_API_KEY pour des stratégies IA personnalisées à votre activité réelle.`,
  };
}

export async function POST(_req: NextRequest) {
  try {
    const stats = await getSegmentStats();
    const statsLabel = SEGMENTS.map(s => `- ${s.label} : ${stats[s.key]} clientes`).join('\n');

    const apiKey = process.env.ANTHROPIC_API_KEY ?? '';
    const hasClaude = apiKey && apiKey !== 'your-anthropic-api-key-here';

    if (!hasClaude) {
      return NextResponse.json({ strategy: mockStrategy(stats), usedMock: true, stats });
    }

    const prompt = `Tu es une experte en marketing beauté et WhatsApp marketing pour un salon de beauté en Martinique.

Données actuelles des segments clientes :
${statsLabel}

Génère une stratégie marketing WhatsApp complète en JSON pur (sans markdown) :
{
  "resume": "Synthèse de la situation en 2 phrases",
  "segments_prioritaires": [
    { "segment": "clé_segment", "raison": "Pourquoi ce segment est prioritaire", "action": "Action concrète recommandée" }
  ],
  "messages_suggeres": [
    { "segment": "clé_segment", "message": "Message WhatsApp prêt à envoyer (max 160 chars, utilise {prénom})" }
  ],
  "calendrier": [
    { "semaine": 1, "action": "Action de la semaine" }
  ],
  "kpi_cibles": {
    "taux_ouverture": "XX%",
    "taux_conversion": "XX%",
    "ca_additionnel_estime": "XXXX €"
  },
  "conseil_principal": "Conseil stratégique le plus important"
}`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1200,
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
      strategy = match ? JSON.parse(match[0]) : mockStrategy(stats);
    }

    return NextResponse.json({ strategy, usedMock: false, stats });
  } catch (e: any) {
    console.error('[ai/marketing-strategy]', e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
