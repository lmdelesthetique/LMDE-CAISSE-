import { NextRequest, NextResponse } from 'next/server';
import { SEGMENTS } from '@/lib/segmentationService';

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

export const maxDuration = 30;

// Only fetch the 3 most useful counts — fast Supabase count queries only
async function fetchQuickStats(): Promise<Record<string, number>> {
  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
  const d90 = new Date(); d90.setDate(d90.getDate() - 90);
  const d30 = new Date(); d30.setDate(d30.getDate() - 30);

  const [{ count: total }, { count: nouvelles }, { data: actifs30 }] = await Promise.all([
    supabase.from('clients').select('*', { count: 'exact', head: true }).not('phone', 'is', null).neq('phone', ''),
    supabase.from('clients').select('*', { count: 'exact', head: true }).gte('created_at', d30.toISOString()).not('phone', 'is', null),
    supabase.from('receipts').select('client_id').gte('created_at', d30.toISOString()).not('client_id', 'is', null).neq('status', 'cancelled'),
  ]);

  const actifs = new Set((actifs30 ?? []).map((r: any) => r.client_id)).size;
  const tous = total ?? 0;
  return {
    tous,
    actifs_30j: actifs,
    inactifs_90j: Math.max(0, tous - actifs),
    nouvelles: nouvelles ?? 0,
  };
}

export async function POST(_req: NextRequest) {
  let stats: Record<string, number> = {};
  try {
    stats = await Promise.race([
      fetchQuickStats(),
      new Promise<Record<string, number>>((_, reject) => setTimeout(() => reject(new Error('timeout')), 8000)),
    ]);
  } catch (e: any) {
    console.error('[ai/marketing-strategy] stats fetch failed:', e.message);
  }

  const apiKey = process.env.ANTHROPIC_API_KEY ?? '';
  const hasClaude = apiKey && apiKey !== 'your-anthropic-api-key-here';

  if (!hasClaude) {
    return NextResponse.json({ strategy: mockStrategy(stats), usedMock: true, stats });
  }

  // Try Claude — fall back to mock on any failure
  try {
    const statsLabel = SEGMENTS.map(s => `- ${s.label} : ${stats[s.key] ?? 0} clientes`).join('\n');

    const prompt = `Tu es un stratège marketing senior pour Le Monde de l'Esthétique (LMDE), boutique beauté en Martinique.

SEGMENTS CLIENTES ACTUELS :
${statsLabel}

Réponds UNIQUEMENT avec un objet JSON valide (pas de markdown, pas de \`\`\`):
{"resume":"...","segments_prioritaires":[{"segment":"clé","raison":"...","action":"..."}],"messages_suggeres":[{"segment":"clé","message":"..."}],"calendrier":[{"semaine":1,"action":"..."},{"semaine":2,"action":"..."},{"semaine":3,"action":"..."},{"semaine":4,"action":"..."}],"kpi_cibles":{"taux_ouverture":"85%","taux_conversion":"12%","ca_additionnel_estime":"XX €"},"conseil_principal":"..."}`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => '');
      console.error('[ai/marketing-strategy] Claude error:', response.status, errBody);
      return NextResponse.json({ strategy: mockStrategy(stats), usedMock: true, stats });
    }

    const claudeData = await response.json();
    const text: string = claudeData.content?.[0]?.text ?? '';

    let strategy: any;
    try {
      strategy = JSON.parse(text);
    } catch {
      const match = text.match(/\{[\s\S]*\}/);
      strategy = match ? JSON.parse(match[0]) : null;
    }

    if (!strategy) {
      return NextResponse.json({ strategy: mockStrategy(stats), usedMock: true, stats });
    }

    return NextResponse.json({ strategy, usedMock: false, stats });
  } catch (e: any) {
    console.error('[ai/marketing-strategy] Claude call failed:', e.message);
    return NextResponse.json({ strategy: mockStrategy(stats), usedMock: true, stats });
  }
}
