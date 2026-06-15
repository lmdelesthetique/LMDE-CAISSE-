import { NextRequest, NextResponse } from 'next/server';

interface ProductInput {
  id: string;
  name: string;
  description?: string;
  price?: number;
}

function mockScript(product: ProductInput) {
  return {
    hooks: [
      `${product.name} — le secret de ma routine 💅`,
      `J'ai testé ${product.name} et voilà ce que ça donne !`,
      `Pourquoi tout le monde parle de ${product.name} ?`,
    ],
    reel: `[INTRO] Bonjour beauties ! Aujourd'hui je vous montre ${product.name}.\n[DEMO] Voici comment je l'utilise au quotidien...\n[RÉSULTAT] Et voilà le résultat après quelques utilisations !\n[CTA] Lien en bio pour commander chez Le Monde de l'Esthétique 💕`,
    story: `Story 1 : "Ma nouvelle découverte chez @lmdelesthetique 🌟"\nStory 2 : Gros plan sur ${product.name}\nStory 3 : "Je l'utilise depuis quelques jours et..."\nStory 4 : Sondage — "Vous connaissez ce produit ?" OUI / NON\nStory 5 : "Lien en bio pour le commander !"`,
    temoignage: `Depuis que j'utilise ${product.name}, ma peau / mes ongles ont vraiment changé. Je recommande à 100% ! Disponible chez Le Monde de l'Esthétique 💅`,
    demonstration: `Étape 1 : Préparez votre zone d'application\nÉtape 2 : Appliquez ${product.name} en petite quantité\nÉtape 3 : Laissez agir selon les instructions\nÉtape 4 : Admirez le résultat !`,
    guide_tournage: `📹 GUIDE TOURNAGE\n• Lumière : naturelle face à une fenêtre\n• Angle : 45° légèrement en hauteur\n• Durée reel : 30-60 sec\n• Fond : propre et épuré\n• Tenue : colorée et soignée\n💡 CONSEIL : Filmer en portrait 9:16 pour Reels & TikTok`,
    hashtags: `#beauté #soin #${product.name.toLowerCase().replace(/\s+/g, '')} #lmdelesthetique #martinique #conseilbeauté #beautyinfluencer`,
  };
}

async function generateWithClaude(product: ProductInput, ambassadriceName: string, apiKey: string) {
  const prompt = `Tu es une experte en marketing beauté et réseaux sociaux pour "Le Monde de l'Esthétique", une boutique beauté martiniquaise.

Ambassadrice : ${ambassadriceName}
Produit : ${product.name}
${product.description ? `Description : ${product.description}` : ''}
${product.price ? `Prix : ${product.price} €` : ''}

Génère du contenu marketing authentique, chaleureux, créole si pertinent. Parle aux femmes martiniquaises/antillaises.
Réponds UNIQUEMENT en JSON valide sans markdown ni backtick :

{
  "hooks": ["Hook percutant 10 mots max", "Hook 2", "Hook 3"],
  "reel": "Script complet reel 60 secondes avec [INTRO] [DEMO] [RÉSULTAT] [CTA]",
  "story": "Séquence 5 stories numérotées avec texte pour chaque",
  "temoignage": "Témoignage naturel et authentique 3-4 phrases",
  "demonstration": "Démonstration produit étape par étape numérotée",
  "guide_tournage": "Guide tournage : angle caméra, lumière, durée, tips pro",
  "hashtags": "#hashtag1 #hashtag2 #hashtag3 #lmdelesthetique"
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
  const data = await response.json();
  const text: string = data.content?.[0]?.text ?? '';

  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error('JSON parse failed');
  }
}

export async function POST(req: NextRequest) {
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { products, ambassadriceName = 'Ambassadrice' } = body as {
    products: ProductInput[];
    ambassadriceName?: string;
  };

  if (!Array.isArray(products) || products.length === 0) {
    return NextResponse.json({ error: 'products requis' }, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY ?? '';
  const hasClaude = apiKey && apiKey !== 'your-anthropic-api-key-here';

  const scripts: Record<string, any> = {};
  for (const product of products) {
    try {
      scripts[product.id] = hasClaude
        ? await generateWithClaude(product, ambassadriceName, apiKey)
        : mockScript(product);
    } catch (e: any) {
      console.error('[ai/generate-scripts] product error:', product.id, e.message);
      scripts[product.id] = mockScript(product);
    }
  }

  return NextResponse.json({ scripts, usedMock: !hasClaude });
}
