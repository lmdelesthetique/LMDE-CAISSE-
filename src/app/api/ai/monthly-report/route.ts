import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

function mockReport(totalCA: number, tickets: number, topProducts: any[]) {
  const avg = tickets > 0 ? (totalCA / tickets).toFixed(2) : '0';
  return {
    resume: `Ce mois-ci, vous avez réalisé ${totalCA.toFixed(2)} € de chiffre d'affaires avec ${tickets} tickets. Le panier moyen est de ${avg} €.`,
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
  };
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

    // Fetch receipts for the period
    const { data: receipts } = await supabase
      .from('receipts')
      .select('id, total_amount, items_count, payment_method, created_at, items')
      .gte('created_at', startDate)
      .lte('created_at', endDate)
      .neq('status', 'cancelled')
      .not('is_demo', 'eq', true);

    const totalCA = (receipts ?? []).reduce((sum, r) => sum + parseFloat(r.total_amount ?? 0), 0);
    const totalTickets = receipts?.length ?? 0;
    const avgCart = totalTickets > 0 ? totalCA / totalTickets : 0;

    // Aggregate product sales from receipt items
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
      .slice(0, 5)
      .map((p) => ({ name: p.name, qty: p.qty, revenue: parseFloat(p.revenue.toFixed(2)) }));

    // Payment method breakdown
    const paymentBreakdown: Record<string, number> = {};
    for (const r of receipts ?? []) {
      const m = r.payment_method ?? 'autre';
      paymentBreakdown[m] = (paymentBreakdown[m] ?? 0) + parseFloat(r.total_amount ?? 0);
    }

    const apiKey = process.env.ANTHROPIC_API_KEY ?? '';
    const hasClaude = apiKey && apiKey !== 'your-anthropic-api-key-here';

    if (!hasClaude) {
      return NextResponse.json({ report: mockReport(totalCA, totalTickets, topProducts), usedMock: true });
    }

    const prompt = `Tu es un stratège marketing senior pour Le Monde de l'Esthétique (LMDE), boutique beauté en Martinique. Tu analyses les données réelles et donnes des actions concrètes avec des chiffres précis.

DONNÉES RÉELLES — PÉRIODE "${period}" :
- CA Total : ${totalCA.toFixed(2)} €
- Nombre de tickets : ${totalTickets}
- Panier moyen : ${avgCart.toFixed(2)} €
- Top 10 produits : ${JSON.stringify(topProducts)}
- Répartition paiements : ${JSON.stringify(paymentBreakdown)}

Génère un rapport stratégique en JSON pur (sans markdown) :
{
  "resume": "2 phrases percutantes avec les vrais chiffres — CA, tickets, panier moyen, tendance",
  "points_positifs": ["Analyse positive avec chiffres réels", "Deuxième point positif chiffré"],
  "points_attention": ["Alerte concrète avec chiffres", "Deuxième alerte actionnable"],
  "recommandations": [
    "Action 1 : produit spécifique + segment cible + canal + délai (ex: relancer les 45 inactives via WhatsApp cette semaine avec code RETOUR20)",
    "Action 2 : bundle recommandé avec prix et marge estimée",
    "Action 3 : action stock ou contenu à faire avant vendredi"
  ],
  "promotion_suggeree": "Bundle ou promo spécifique : noms des produits + prix exact avant/après + segment cible + canal + durée",
  "objectif_mois_prochain": "CA cible précis en € avec 2 leviers concrets pour l'atteindre"
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
        max_tokens: 800,
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
      report = match ? JSON.parse(match[0]) : mockReport(totalCA, totalTickets, topProducts);
    }

    return NextResponse.json({ report, usedMock: false, meta: { totalCA, totalTickets, avgCart, topProducts } });
  } catch (e: any) {
    console.error('[ai/monthly-report]', e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
