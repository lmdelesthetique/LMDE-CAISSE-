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

const CREATIVE_ANGLES = [
  { angle: 'avant/après transformation', tone: 'émotionnel et inspirant', hookStyle: 'question choc' },
  { angle: 'routine quotidienne', tone: 'casual et amical', hookStyle: 'anecdote personnelle' },
  { angle: 'conseil experte beauté', tone: 'professionnel et éducatif', hookStyle: 'tip surprenant' },
  { angle: 'découverte coup de cœur', tone: 'enthousiaste et spontané', hookStyle: 'réaction authentique' },
  { angle: 'comparaison produits', tone: 'honnête et direct', hookStyle: 'controverse douce' },
  { angle: 'résultats en chiffres', tone: 'factuel et percutant', hookStyle: 'statistique ou durée' },
  { angle: 'lifestyle antillais', tone: 'chaleureux et créole', hookStyle: 'référence culturelle locale' },
  { angle: 'démonstration technique', tone: 'pédagogique et précis', hookStyle: 'étape surprenante' },
];

function pickAngle(productId: string) {
  // Deterministic-ish per product but varied: hash productId chars
  const seed = productId.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return CREATIVE_ANGLES[seed % CREATIVE_ANGLES.length];
}

function generateMockScript(product: ProductForScript) {
  const { angle, tone, hookStyle } = pickAngle(product.id);
  const tag = `#${product.name.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
  return {
    hooks: [
      `Angle ${angle} : tu dois essayer ${product.name} !`,
      `${product.name} à ${product.price} € — ça vaut vraiment le coup ?`,
      `Le ${hookStyle} qui m'a convaincue d'essayer ${product.name}…`,
    ],
    reel: `[INTRO — ${angle}] Bonjour beauties ! Aujourd'hui je partage mon ${angle} avec ${product.name}.
[DÉMO] Voici comment j'utilise ce produit dans ma routine — ton ${tone}.
[RÉSULTAT] Après plusieurs utilisations, voici ce que j'observe concrètement.
[CTA] Commandez chez Le Monde de l'Esthétique — lien en bio ! 🌸`,
    story: `Story 1 : "${angle} avec @lmdelesthetique 🌟"
Story 2 : Gros plan sur ${product.name} — montrer le packaging et la texture
Story 3 : Application en live — ${tone}
Story 4 : Sondage — "Vous avez déjà utilisé ${product.name} ?" OUI / NON
Story 5 : "Prix : ${product.price} € — lien en bio pour commander !"`,
    temoignage: `Depuis que j'ai intégré ${product.name} à ma routine (angle : ${angle}), la différence est vraiment visible. ${tone.charAt(0).toUpperCase() + tone.slice(1)}, je recommande sincèrement ce produit à toutes. Disponible exclusivement chez Le Monde de l'Esthétique !`,
    guide: `GUIDE ${angle.toUpperCase()} — ${product.name}\n\n1. PRÉPARATION : Préparez votre espace et le produit\n2. APPLICATION : Suivez les étapes du ${angle}\n3. ASTUCE ${hookStyle.toUpperCase()} : Le détail qui fait la différence\n4. RÉSULTAT : Observez et partagez votre expérience !\n\n💡 CONSEIL PRO : Cohérence = résultats durables.`,
    demonstration: `Étape 1 : Contextualiser l'angle "${angle}"\nÉtape 2 : Appliquer ${product.name} en montrant la texture\nÉtape 3 : Insister sur le ${hookStyle}\nÉtape 4 : Révéler le résultat avec émotion (ton : ${tone})`,
    guide_tournage: `📹 GUIDE TOURNAGE — angle "${angle}"\n• Lumière : naturelle face à une fenêtre ou ring light\n• Angle caméra : 45° légèrement en hauteur\n• Durée reel : 30-60 sec\n• Fond : cohérent avec le ton ${tone}\n• Son : musique ${tone.includes('créole') ? 'antillaise' : 'tendance'} en fond\n💡 Format portrait 9:16 obligatoire pour Reels & TikTok`,
    hashtags: [
      '#beauté', '#soin', '#lmdelesthetique', '#martinique', '#antilles',
      '#beautyinfluencer', '#conseilbeauté', tag,
    ].join(' '),
  };
}

async function generateScriptWithClaude(product: ProductForScript, apiKey: string) {
  const { angle, tone, hookStyle } = pickAngle(product.id);
  // Add extra randomness: pick a random creative variation seed each call
  const variationSeeds = [
    'Utilise des emojis expressifs et un style très spontané.',
    'Écris de façon sobre et professionnelle, sans trop d\'emojis.',
    'Intègre des expressions créoles antillaises naturellement.',
    'Mise sur les émotions et la transformation personnelle.',
    'Adopte un ton humoristique léger et complice.',
    'Focus sur les résultats concrets et les preuves.',
  ];
  const variationHint = variationSeeds[Math.floor(Math.random() * variationSeeds.length)];

  const prompt = `Tu es une experte en marketing beauté pour une marque martiniquaise "Le Monde de l'Esthétique".
Génère des scripts de contenu pour réseaux sociaux (Instagram/TikTok) pour ce produit beauté.

Produit : ${product.name}
Prix : ${product.price} €
${product.description ? `Description : ${product.description}` : ''}

ANGLE CRÉATIF IMPOSÉ : ${angle}
TON : ${tone}
STYLE DE HOOK : ${hookStyle}
VARIATION : ${variationHint}

Ce script doit être UNIQUE et DIFFÉRENT de ce qu'on fait habituellement. Adapte vraiment le contenu à l'angle imposé — ne génère pas un script générique.

Génère exactement ce JSON (sans markdown, juste le JSON pur) :
{
  "hooks": ["hook1 10 mots max — style ${hookStyle}", "hook2 différent", "hook3 encore différent"],
  "reel": "script reel 60 secondes avec [INTRO — ${angle}] [DÉMO] [RÉSULTAT] [CTA] — ton ${tone}",
  "story": "séquence 5 stories numérotées cohérentes avec l'angle ${angle}",
  "temoignage": "témoignage authentique 3-4 phrases — angle ${angle}, ton ${tone}",
  "guide": "guide d'utilisation étape par étape adapté à l'angle ${angle}",
  "demonstration": "démonstration produit numérotée avec l'angle ${angle}",
  "guide_tournage": "guide tournage adapté au ton ${tone} : lumière, angle caméra, durée, ambiance, musique suggérée",
  "hashtags": "#hashtags pertinents dont #lmdelesthetique #martinique"
}

Parle aux femmes martiniquaises/antillaises. Sois créative et originale — chaque ambassadrice doit avoir un contenu qui lui ressemble.`;

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
