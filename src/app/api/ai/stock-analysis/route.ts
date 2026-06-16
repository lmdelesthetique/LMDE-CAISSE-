import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

async function fetchAllProducts(supabase: ReturnType<typeof createAdminClient>) {
  const PAGE = 1000;
  const all: any[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from('products')
      .select('id, name, stock, min_stock, sales_30d, sales_7d, category, sell_price_ttc')
      .eq('status', 'active')
      .neq('is_demo', true)
      .order('stock', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error || !data?.length) break;
    all.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

function mockAnalysis(ruptures: any[], lowStock: any[], dormant: any[]) {
  return {
    reapprovisionnement_urgent: ruptures.slice(0, 5).map(p => `${p.name} — rupture de stock`),
    stock_critique: lowStock.slice(0, 5).map(p => `${p.name} — stock critique (${p.stock} restant${p.stock > 1 ? 's' : ''})`),
    stock_dormant: dormant.slice(0, 3).map(p => `${p.name} — aucune vente récente`),
    suggestions: [
      ruptures.length > 0 ? `Commander en priorité : ${ruptures.slice(0, 3).map(p => p.name).join(', ')}` : 'Aucune rupture détectée — bonne gestion stock',
      lowStock.length > 0 ? `Surveiller de près : ${lowStock.slice(0, 2).map(p => p.name).join(', ')}` : null,
      dormant.length > 0 ? `Proposer des promotions sur les produits dormants pour déstocker` : null,
    ].filter(Boolean),
    score_sante_stock: Math.max(0, Math.min(100, Math.round(100 - ruptures.length * 15 - lowStock.length * 5))),
  };
}

export async function GET() {
  try {
    const supabase = createAdminClient();
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const allProducts = await fetchAllProducts(supabase);
    const ruptures = allProducts.filter(p => (p.stock ?? 0) === 0);
    const lowStock = allProducts.filter(p => (p.stock ?? 0) > 0 && (p.stock ?? 0) <= (p.min_stock ?? 3));
    const dormant = allProducts.filter(p => (p.sales_30d ?? 0) === 0 && (p.stock ?? 0) > 5);

    const apiKey = process.env.ANTHROPIC_API_KEY ?? '';
    const hasClaude = apiKey && apiKey !== 'your-anthropic-api-key-here';

    if (!hasClaude) {
      return NextResponse.json({
        analysis: mockAnalysis(ruptures, lowStock, dormant),
        data: { ruptures: ruptures.length, lowStock: lowStock.length, dormant: dormant.length },
        usedMock: true,
      });
    }

    const prompt = `Tu es une experte en gestion de stock pour une boutique beauté martiniquaise "Le Monde de l'Esthétique".

Situation actuelle du stock :
- Produits en rupture (stock = 0) : ${ruptures.length} produits
  ${ruptures.slice(0, 8).map(p => `• ${p.name} (vendu ${p.sales_30d ?? 0}x/30j)`).join('\n  ')}
- Stock critique (sous le minimum) : ${lowStock.length} produits
  ${lowStock.slice(0, 8).map(p => `• ${p.name} : stock=${p.stock}, min=${p.min_stock ?? 3}`).join('\n  ')}
- Stock dormant (0 vente en 30j) : ${dormant.length} produits
  ${dormant.slice(0, 5).map(p => `• ${p.name} : stock=${p.stock}`).join('\n  ')}
- Total produits actifs : ${allProducts.length}

Génère une analyse en JSON (sans markdown, JSON pur) :
{
  "reapprovisionnement_urgent": ["Produit X — raison", "Produit Y — raison"],
  "stock_critique": ["Produit Z — stock critique (N)", "..."],
  "stock_dormant": ["Produit A — 0 vente depuis 30 jours", "..."],
  "suggestions": ["Action concrète 1", "Action 2", "Action 3"],
  "score_sante_stock": 75
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
        max_tokens: 600,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) throw new Error(`Claude API error: ${response.status}`);
    const claudeData = await response.json();
    const text: string = claudeData.content?.[0]?.text ?? '';

    let analysis: any;
    try {
      analysis = JSON.parse(text);
    } catch {
      const match = text.match(/\{[\s\S]*\}/);
      analysis = match ? JSON.parse(match[0]) : mockAnalysis(ruptures, lowStock, dormant);
    }

    return NextResponse.json({
      analysis,
      data: { ruptures: ruptures.length, lowStock: lowStock.length, dormant: dormant.length },
      usedMock: false,
    });
  } catch (e: any) {
    console.error('[ai/stock-analysis]', e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
