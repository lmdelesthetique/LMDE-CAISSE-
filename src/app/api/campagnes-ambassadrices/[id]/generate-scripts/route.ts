import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function makeClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  if (!url || !key) throw new Error('Supabase env vars not configured');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

interface ProductForScript {
  id: string;
  name: string;
  description?: string;
  price: number;
}

function generateMockScript(product: ProductForScript) {
  return {
    hooks: [
      `Vous cherchez ${product.name} ? J'ai testé pour vous !`,
      `Ce produit a changé ma routine beauté : ${product.name}`,
      `La vraie question : vaut-il ses ${product.price} € ? Je vous dis tout !`,
    ],
    reel: `[INTRO] Bonjour beauties ! Aujourd'hui je vous présente ${product.name}.
[DEMO] Voici comment l'utiliser : appliquez en petite quantité sur la zone ciblée.
[RÉSULTAT] Le résultat après quelques utilisations est vraiment visible.
[CALL TO ACTION] Lien en bio pour l'obtenir chez Le Monde de l'Esthétique !`,
    story: `Story 1 : "Nouvelle découverte chez @lmdelesthetique 🌟"
Story 2 : Montrer le produit en gros plan avec le nom visible
Story 3 : "Je l'utilise depuis X jours et voici ce que j'observe..."
Story 4 : Sondage — "Vous connaissez ${product.name} ?" OUI / NON
Story 5 : "Lien en bio pour le commander !"`,
    temoignage: `J'utilise ${product.name} depuis maintenant quelques semaines et les résultats sont bluffants ! Ma peau/cheveux/corps a vraiment changé. Je recommande à 100% à toutes celles qui cherchent un produit efficace et de qualité. Disponible chez Le Monde de l'Esthétique !`,
    guide: `GUIDE D'UTILISATION — ${product.name}\n\n1. PRÉPARATION : Préparez votre zone d'application\n2. APPLICATION : Appliquez en petite quantité\n3. DURÉE : Laissez agir le temps recommandé\n4. RÉSULTAT : Profitez des bénéfices !\n\nCONSEIL PRO : Pour de meilleurs résultats, utilisez régulièrement.`,
    demonstration: `Étape 1 : Préparez votre zone d'application\nÉtape 2 : Appliquez ${product.name} en petite quantité\nÉtape 3 : Laissez agir selon les instructions\nÉtape 4 : Admirez le résultat !`,
    guide_tournage: `📹 GUIDE TOURNAGE\n• Lumière : naturelle face à une fenêtre\n• Angle : 45° légèrement en hauteur\n• Durée reel : 30-60 sec\n• Fond : propre et épuré\n💡 CONSEIL : Filmer en portrait 9:16 pour Reels & TikTok`,
    hashtags: [
      '#beauté', '#soin', '#skincare', '#lmdelesthetique',
      '#beautyinfluencer', '#martinique', '#conseilbeauté',
      `#${product.name.toLowerCase().replace(/\s+/g, '')}`,
    ].join(' '),
  };
}

async function generateScriptWithClaude(product: ProductForScript, apiKey: string) {
  const prompt = `Tu es une experte en marketing beauté pour une marque martiniquaise "Le Monde de l'Esthétique".
Génère des scripts de contenu pour réseaux sociaux (Instagram/TikTok) pour ce produit beauté :

Produit : ${product.name}
Prix : ${product.price} €
${product.description ? `Description : ${product.description}` : ''}

Génère exactement ce JSON (sans markdown, juste le JSON pur) :
{
  "hooks": ["hook1 10 mots max", "hook2", "hook3"],
  "reel": "script complet reel 60 secondes avec [INTRO] [DEMO] [RÉSULTAT] [CTA]",
  "story": "séquence 5 stories numérotées avec texte",
  "temoignage": "témoignage authentique 3-4 phrases",
  "guide": "guide d'utilisation étape par étape",
  "demonstration": "démonstration produit étape par étape numérotée",
  "guide_tournage": "guide tournage : lumière, angle, durée, tips pro",
  "hashtags": "#hashtag1 #hashtag2 #lmdelesthetique"
}

Ton style : authentique, chaleureuse, créole si pertinent, orientée résultats. Parle aux femmes martiniquaises/antillaises.`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    throw new Error(`Anthropic API error: ${response.status}`);
  }

  const result = await response.json();
  const text = result.content?.[0]?.text ?? '';

  try {
    return JSON.parse(text);
  } catch {
    // If JSON parse fails, try to extract JSON from the text
    const match = text.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error('Could not parse Claude response as JSON');
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: campagneId } = await params;
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { assignmentId, products } = body as {
    assignmentId: string;
    products: ProductForScript[];
  };

  if (!assignmentId) return NextResponse.json({ error: 'assignmentId requis' }, { status: 400 });
  if (!Array.isArray(products) || products.length === 0) {
    return NextResponse.json({ error: 'products requis' }, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY ?? process.env.CLAUDE_API_KEY ?? '';
  const hasClaude = apiKey && apiKey !== 'your-anthropic-api-key-here';

  try {
    const scripts: Record<string, any> = {};

    for (const product of products) {
      try {
        if (hasClaude) {
          scripts[product.id] = await generateScriptWithClaude(product, apiKey);
        } else {
          scripts[product.id] = generateMockScript(product);
        }
      } catch (e: any) {
        console.error(`[generate-scripts] error for product ${product.id}:`, e.message);
        // Fallback to mock if Claude fails
        scripts[product.id] = generateMockScript(product);
      }
    }

    // Save scripts to the assignment
    const supabase = makeClient();
    const { error } = await supabase
      .from('campagne_assignments')
      .update({ ai_scripts: scripts, updated_at: new Date().toISOString() })
      .eq('id', assignmentId)
      .eq('campagne_id', campagneId);

    if (error) console.error('[generate-scripts] save error:', error.message);

    return NextResponse.json({ scripts, usedMock: !hasClaude });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
