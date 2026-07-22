import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

function pct(current: number, previous: number) {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}

function mockReport(totalCA: number, tickets: number, prevCA: number, prevTickets: number, topProducts: any[], acquisitionStats: Record<string, number>) {
  const avg = tickets > 0 ? (totalCA / tickets).toFixed(2) : '0';
  const prevAvg = prevTickets > 0 ? prevCA / prevTickets : 0;
  const caEvo = pct(totalCA, prevCA);
  const avgEvo = pct(tickets > 0 ? totalCA / tickets : 0, prevAvg);
  const tkEvo = pct(tickets, prevTickets);
  return {
    resume: `Ce mois-ci : ${totalCA.toFixed(2)} € de CA (${caEvo >= 0 ? '+' : ''}${caEvo}% vs M-1), ${tickets} tickets (${tkEvo >= 0 ? '+' : ''}${tkEvo}% vs M-1), panier moyen ${avg} € (${avgEvo >= 0 ? '+' : ''}${avgEvo}% vs M-1).`,
    evolution_ca: caEvo,
    evolution_tickets: tkEvo,
    evolution_panier: avgEvo,
    points_positifs: [
      'Activité commerciale régulière sur la période',
      tickets > 50 ? 'Bon volume de transactions' : 'Base de clientèle fidèle',
    ],
    points_attention: [
      'Configurez votre clé ANTHROPIC_API_KEY pour des analyses IA personnalisées',
    ],
    recommandations: [
      'Analysez les produits les moins vendus pour envisager des promotions',
      'Relancez vos clientes inactives depuis plus de 30 jours',
      'Vérifiez le stock des top produits pour éviter les ruptures',
    ],
    promotion_suggeree: 'Proposez une offre bundle sur vos 3 produits les plus vendus avec -15% pour stimuler le panier moyen.',
    objectif_mois_prochain: `Viser ${(totalCA * 1.1).toFixed(0)} € de CA (+10%) en augmentant la fréquence de visite des clientes existantes.`,
    acquisition_stats: acquisitionStats,
  };
}

async function fetchPeriodData(supabase: any, startDate: string, endDate: string) {
  const { data: receipts } = await supabase
    .from('receipts')
    .select('id, total_amount, items_count, payment_method, created_at, items, acquisition_source')
    .gte('created_at', startDate)
    .lte('created_at', endDate)
    .neq('status', 'cancelled')
    .not('is_demo', 'eq', true);

  const totalCA = (receipts ?? []).reduce((sum: number, r: any) => sum + parseFloat(r.total_amount ?? 0), 0);
  const totalTickets = receipts?.length ?? 0;

  const productSales: Record<string, { name: string; qty: number; revenue: number }> = {};
  for (const receipt of receipts ?? []) {
    const items = Array.isArray(receipt.items) ? receipt.items : [];
    for (const item of items) {
      const name = item.name ?? 'Inconnu';
      if (!productSales[name]) productSales[name] = { name, qty: 0, revenue: 0 };
      productSales[name].qty += item.qty ?? item.quantity ?? 1;
      productSales[name].revenue += item.total ?? (item.price * (item.qty ?? 1));
    }
  }
  const topProducts = Object.values(productSales)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10)
    .map((p) => ({ name: p.name, qty: p.qty, revenue: parseFloat(p.revenue.toFixed(2)) }));

  const paymentBreakdown: Record<string, number> = {};
  for (const r of receipts ?? []) {
    const m = r.payment_method ?? 'autre';
    paymentBreakdown[m] = (paymentBreakdown[m] ?? 0) + parseFloat(r.total_amount ?? 0);
  }

  const acquisitionStats: Record<string, number> = {};
  for (const r of receipts ?? []) {
    if (r.acquisition_source) {
      acquisitionStats[r.acquisition_source] = (acquisitionStats[r.acquisition_source] ?? 0) + 1;
    }
  }

  return { totalCA, totalTickets, topProducts, paymentBreakdown, acquisitionStats };
}

export async function POST(req: NextRequest) {
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { startDate, endDate, period = 'ce mois' } = body as {
    startDate: string;
    endDate: string;
    period?: string;
  };

  if (!startDate || !endDate) {
    return NextResponse.json({ error: 'startDate et endDate requis' }, { status: 400 });
  }

  try {
    const supabase = createAdminClient();

    // Current period
    const current = await fetchPeriodData(supabase, startDate, endDate);

    // Previous period (same duration, shifted back)
    const start = new Date(startDate);
    const end = new Date(endDate);
    const durationMs = end.getTime() - start.getTime();
    const prevStart = new Date(start.getTime() - durationMs).toISOString();
    const prevEnd = new Date(start.getTime() - 1).toISOString();
    const previous = await fetchPeriodData(supabase, prevStart, prevEnd);

    const caEvo = pct(current.totalCA, previous.totalCA);
    const tkEvo = pct(current.totalTickets, previous.totalTickets);
    const currentAvg = current.totalTickets > 0 ? current.totalCA / current.totalTickets : 0;
    const prevAvg = previous.totalTickets > 0 ? previous.totalCA / previous.totalTickets : 0;
    const avgEvo = pct(currentAvg, prevAvg);

    const apiKey = process.env.ANTHROPIC_API_KEY ?? '';
    const hasClaude = apiKey && apiKey !== 'your-anthropic-api-key-here';

    if (!hasClaude) {
      return NextResponse.json({
        report: mockReport(current.totalCA, current.totalTickets, previous.totalCA, previous.totalTickets, current.topProducts, current.acquisitionStats),
        usedMock: true,
      });
    }

    const acqLines = Object.entries(current.acquisitionStats)
      .sort((a, b) => b[1] - a[1])
      .map(([src, cnt]) => `${src}: ${cnt} clientes`)
      .join(', ');

    const prompt = `Tu es un stratège marketing senior pour Le Monde de l'Esthétique (LMDE), boutique beauté en Martinique. Tu analyses les données RÉELLES et fournis des actions CONCRÈTES avec des chiffres précis.

DONNÉES PÉRIODE ACTUELLE — "${period}" :
- CA Total : ${current.totalCA.toFixed(2)} € (${caEvo >= 0 ? '+' : ''}${caEvo}% vs période précédente)
- Tickets : ${current.totalTickets} (${tkEvo >= 0 ? '+' : ''}${tkEvo}% vs période précédente)
- Panier moyen : ${currentAvg.toFixed(2)} € (${avgEvo >= 0 ? '+' : ''}${avgEvo}% vs période précédente)
- Top 10 produits : ${JSON.stringify(current.topProducts)}
- Répartition paiements : ${JSON.stringify(current.paymentBreakdown)}
- Sources acquisition clientes : ${acqLines || 'non renseigné encore'}

DONNÉES PÉRIODE PRÉCÉDENTE (comparaison) :
- CA : ${previous.totalCA.toFixed(2)} €
- Tickets : ${previous.totalTickets}
- Panier moyen : ${prevAvg.toFixed(2)} €
- Top 5 produits M-1 : ${JSON.stringify(previous.topProducts.slice(0, 5))}

Génère un rapport stratégique EN JSON PUR (sans markdown, sans backticks) :
{
  "resume": "2-3 phrases percutantes avec les évolutions réelles en % et les vrais chiffres — CA, tickets, panier, tendance vs M-1",
  "evolution_ca": ${caEvo},
  "evolution_tickets": ${tkEvo},
  "evolution_panier": ${avgEvo},
  "points_positifs": ["Point positif avec chiffres réels et comparaison M-1", "Deuxième point positif chiffré"],
  "points_attention": ["Alerte concrète avec chiffres et comparaison M-1", "Deuxième alerte actionnable"],
  "recommandations": [
    "Action 1 ultra-concrète : produit spécifique + segment cible + canal + délai + résultat attendu en €",
    "Action 2 : lever de croissance identifié dans les données",
    "Action 3 : action stock ou animation commerciale à faire cette semaine"
  ],
  "promotion_suggeree": "Bundle ou promo précis : noms des vrais produits du top 10 + prix avant/après + segment ciblé + canal + durée",
  "objectif_mois_prochain": "CA cible précis en € basé sur la tendance actuelle, avec 2 leviers spécifiques aux données observées",
  "analyse_acquisition": "Analyse de la répartition des sources d'acquisition (si disponible) avec recommandations canal marketing"
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

    let report: any;
    try {
      report = JSON.parse(text);
    } catch {
      const match = text.match(/\{[\s\S]*\}/);
      report = match ? JSON.parse(match[0]) : mockReport(current.totalCA, current.totalTickets, previous.totalCA, previous.totalTickets, current.topProducts, current.acquisitionStats);
    }

    // Always inject evolution numbers and acquisition stats
    report.evolution_ca = caEvo;
    report.evolution_tickets = tkEvo;
    report.evolution_panier = avgEvo;
    report.acquisition_stats = current.acquisitionStats;

    return NextResponse.json({
      report,
      usedMock: false,
      meta: {
        current: { totalCA: current.totalCA, totalTickets: current.totalTickets, avgCart: currentAvg },
        previous: { totalCA: previous.totalCA, totalTickets: previous.totalTickets, avgCart: prevAvg },
      },
    });
  } catch (e: any) {
    console.error('[ai/monthly-report]', e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
