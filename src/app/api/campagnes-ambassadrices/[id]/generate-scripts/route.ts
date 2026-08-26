import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

interface ProductForScript {
  id: string;
  name: string;
  description?: string;
  price: number;
}

// Problèmes/douleurs typiques par catégorie de produit beauté
function detectProblemContext(productName: string): string {
  const n = productName.toLowerCase();
  if (n.includes('cluster') || n.includes('eyelash') || n.includes('cil') || n.includes('lash')) {
    return 'longs et beaux cils sans aller au salon (extensions coûteuses, temps perdu, cils qui tombent trop vite)';
  }
  if (n.includes('nail') || n.includes('ongle') || n.includes('gel') || n.includes('vernis')) {
    return 'beaux ongles durables sans le coût et les contraintes du salon (ongles qui cassent, pose trop chère, temps d\'attente)';
  }
  if (n.includes('glue') || n.includes('colle') || n.includes('bond') || n.includes('adhesif')) {
    return 'une fixation durable qui ne blesse pas (colle agressive, réaction allergique, tenue insuffisante)';
  }
  if (n.includes('remover') || n.includes('dissolvant') || n.includes('retrait')) {
    return 'retirer ses extensions/ongles sans abîmer (arrachage douloureux, cils fragilisés, ongles cassés)';
  }
  if (n.includes('serum') || n.includes('sérum') || n.includes('soin') || n.includes('cream') || n.includes('crème')) {
    return 'une peau lumineuse et unifiée (taches, teint terne, peau grasse ou sèche en climat tropical)';
  }
  if (n.includes('hair') || n.includes('cheveu') || n.includes('chev')) {
    return 'des cheveux en pleine santé malgré le climat et les traitements (cheveux secs, casse, croissance lente)';
  }
  if (n.includes('strass') || n.includes('rhinestone') || n.includes('cristal')) {
    return 'des nail art luxueux à la maison sans salon (coût élevé du nail art, résultat qui ne dure pas)';
  }
  if (n.includes('neon') || n.includes('néon') || n.includes('poudre') || n.includes('powder')) {
    return 'des couleurs intenses qui durent vraiment (couleurs qui fanent vite, rendu décevant chez soi)';
  }
  return 'un problème beauté quotidien qui la complexait et lui gâchait la vie (coût, temps, résultat décevant)';
}

function generateMockScript(product: ProductForScript, ambassadriceName: string) {
  const problemCtx = detectProblemContext(product.name);
  return {
    hooks: [
      `Si tu galères avec ${problemCtx.split('(')[0].trim()}, écoute-moi bien…`,
      `Pendant des mois j'ai cherché une solution à ce problème — j'ai enfin trouvé`,
      `Honnêtement je pensais jamais pouvoir régler ça chez moi, jusqu'au jour où…`,
    ],
    reel: `[HOOK — LA DOULEUR] "Pendant longtemps j'avais un vrai problème avec ${problemCtx.split('(')[0].trim()}. Je me sentais pas bien dans ma peau."

[AVANT] "J'essayais plein de choses, je dépensais de l'argent, rien ne durait vraiment."

[DÉCOUVERTE] "Et puis j'ai découvert ${product.name} chez Le Monde de l'Esthétique. Honnêtement j'étais sceptique."

[APRÈS — TRANSFORMATION] "Mais depuis que je l'utilise, vraiment tout a changé. [décrire résultat concret et visible]"

[CTA SINCÈRE] "Si toi aussi tu vis ce que je vivais, essaie-le — lien en bio, chez @lmdelesthetique 🌸"`,
    story: `Story 1 : "Vous savez ce qui me complexait avant ? [problème concret]" — fond sobre, texte percutant

Story 2 : "J'ai testé ${product.name} de @lmdelesthetique — voilà ce qui s'est passé…" — suspense

Story 3 : Avant / Après — montrer le résultat côte à côte ou en direct

Story 4 : Sondage — "Vous vivez ce problème aussi ?" OUI / PARFOIS / NON

Story 5 : "Lien en bio pour commander — prix : ${product.price} € 💕 Plus jamais ce problème !"`,
    temoignage: `Avant de découvrir ${product.name}, j'avais vraiment du mal avec [problème précis lié au produit]. Ça me prenait du temps, de l'argent, et le résultat n'était jamais à la hauteur. Depuis que je l'intègre dans ma routine, ça a vraiment changé mon quotidien — je suis beaucoup plus sereine et confiante. Je recommande sincèrement à toutes les femmes qui vivent la même chose. Disponible chez Le Monde de l'Esthétique 💅`,
    guide: `GUIDE UTILISATION — ${product.name}

🔑 POURQUOI CE PRODUIT EXISTE :
Il répond à un vrai problème : ${problemCtx}

📋 ÉTAPES :
1. PRÉPARATION : [préparer la zone, nettoyer]
2. APPLICATION : [appliquer ${product.name} selon les instructions]
3. ATTENTE / FIXATION : [respecter le temps indiqué]
4. RÉSULTAT : Admirer — et noter la différence vs avant !

💡 CONSEIL CLÉ : La régularité fait toute la différence. Teste 2 semaines et partage ton résultat !`,
    demonstration: `📹 DÉMO — ${product.name}

Avant de commencer : "Voici pourquoi j'en avais besoin [montrer le problème]"

Étape 1 : Sortir le produit — montrer le packaging, la texture, l'odeur
Étape 2 : Application — gros plan sur la technique
Étape 3 : Résultat immédiat — réaction authentique
Étape 4 : "Et dans la durée… [résultat à J+7 ou J+30]"`,
    guide_tournage: `📹 GUIDE TOURNAGE — Style témoignage authentique

🎬 FORMAT : Portrait 9:16 — Reels & TikTok
⏱ DURÉE REEL : 30-45 sec (hook fort dans les 3 premières secondes)
💡 LUMIÈRE : Naturelle face à une fenêtre OU ring light — lumière chaude
📐 ANGLE : Face caméra, regard direct — crée la connexion émotionnelle
🎵 SON : Parle fort et clairement — sous-titres recommandés (70% regardent sans son)

STRUCTURE À FILMER :
• Séquence 1 (3 sec) : Le problème — expression sincère, pas de sourire forcé
• Séquence 2 (5 sec) : Le produit en main — montrer le packaging clairement
• Séquence 3 (10 sec) : Application en live ou résultat visible
• Séquence 4 (5 sec) : Ton ressenti sincère face caméra
• Fin : Sourire + CTA oral "Lien en bio !"

💡 ASTUCE AUTHENTICITÉ : Filme en une seule prise si possible — les gens sentent le vrai.`,
    hashtags: '#beauté #temoignage #routinebeauté #lmdelesthetique #martinique #antilles #conseilbeauté #beautyinfluencer #transformation #avant #après',
  };
}

async function generateScriptWithClaude(
  product: ProductForScript,
  ambassadriceName: string,
  ambassadriceGrade: string,
  ambassadriceFollowers: number,
  apiKey: string
) {
  const problemCtx = detectProblemContext(product.name);
  const gradeLabel = ambassadriceGrade === 'elite' ? 'ambassadrice élite (grande expérience contenu)' :
    ambassadriceGrade === 'confirmee' ? 'ambassadrice confirmée' : 'ambassadrice débutante (ton naturel et spontané)';
  const followersCtx = ambassadriceFollowers > 5000
    ? `grande audience (${ambassadriceFollowers} abonnés) — scripts percutants et professionnels`
    : ambassadriceFollowers > 1000
    ? `audience intermédiaire (${ambassadriceFollowers} abonnés) — ton proche et authentique`
    : `petite audience engagée — ton ultra-personnel et intime`;

  const prompt = `Tu es une stratège contenu spécialisée en marketing beauté pour "Le Monde de l'Esthétique", boutique beauté martiniquaise.

Tu dois générer des scripts de contenu pour cette ambassadrice, avec une stratégie TÉMOIGNAGE AUTHENTIQUE.

━━━━━━━━━━━━━━━━━━━
AMBASSADRICE : ${ambassadriceName}
Profil : ${gradeLabel}
Audience : ${followersCtx}
━━━━━━━━━━━━━━━━━━━
PRODUIT : ${product.name}
Prix : ${product.price} €
${product.description ? `Description : ${product.description}` : ''}
Problème que ce produit résout : ${problemCtx}
━━━━━━━━━━━━━━━━━━━

STRATÉGIE IMPOSÉE — TÉMOIGNAGE TRANSFORMATION :
Le contenu doit suivre cette logique émotionnelle :
1. PROBLÈME : Identifier clairement la douleur/frustration que ${ambassadriceName} vivait AVANT
2. AVANT : Décrire concrètement comment c'était — les galères, le coût, le temps perdu, le manque de confiance
3. DÉCOUVERTE : Comment elle a trouvé ce produit chez Le Monde de l'Esthétique
4. APRÈS — TRANSFORMATION : Ce que ça a changé dans sa vie/routine, de façon précise et émotionnelle
5. RECOMMANDATION SINCÈRE : Pourquoi elle dit aux autres femmes d'essayer

RÈGLES ABSOLUES :
- Jamais de "ce produit est génial" générique — toujours partir du PROBLÈME CONCRET
- Le hook doit parler de la douleur, pas du produit
- Le témoignage doit sembler VRAI et VÉCU, pas commercial
- Adapter le ton à ${ambassadriceName} (${gradeLabel})
- Parle aux femmes martiniquaises/antillaises — contexte tropical, culture locale
- Expressions créoles bienvenues si naturelles (pa ni pwobwèm, chéri, ma chère...)

Génère exactement ce JSON (sans markdown, juste le JSON pur) :
{
  "hooks": [
    "Hook 1 — commence par LA DOULEUR ou la frustration vécue, 10 mots max, percutant",
    "Hook 2 — question ou confession qui crée l'identification immédiate",
    "Hook 3 — surprise ou révélation liée au problème résolu"
  ],
  "reel": "Script reel 45-60 secondes structuré : [HOOK — LA DOULEUR 3 sec] → [AVANT — ma galère concrète 8 sec] → [DÉCOUVERTE 5 sec] → [APRÈS — transformation précise 15 sec] → [CTA sincère 5 sec]. Ton ${gradeLabel}, voix de ${ambassadriceName}.",
  "story": "Séquence 5 stories numérotées : Story 1 = poser le problème (accroche émotionnelle), Story 2 = creuser l'avant (la galère), Story 3 = montrer le produit + application, Story 4 = révéler la transformation + résultat, Story 5 = CTA avec prix et lien en bio",
  "temoignage": "Témoignage 4-5 phrases — écrit à la première personne par ${ambassadriceName} — commence par le problème vécu, finit par la recommandation sincère. Sonne VRAI, pas publicitaire.",
  "guide": "Guide d'utilisation qui commence par 'Pourquoi ce produit existe' (= le problème qu'il résout), puis les étapes d'utilisation, puis conseil de régularité",
  "demonstration": "Démo vidéo numérotée — commence par montrer le problème/besoin avant l'application, puis le produit, puis application, puis résultat avec réaction authentique",
  "guide_tournage": "Guide tournage style témoignage : lumière, angle, durée, structure des séquences à filmer (problème → avant → démo → après → CTA), ambiance, ton vocal, tips authenticité",
  "hashtags": "#hashtags dont #temoignage #transformation #lmdelesthetique #martinique et hashtags problème spécifique (ex: #extensionscils #beautenaturelle etc.)"
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
      max_tokens: 2000,
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

  const {
    assignmentId,
    products,
    ambassadriceName = 'Ambassadrice',
    ambassadriceGrade = 'confirmee',
    ambassadriceFollowers = 0,
  } = body as {
    assignmentId: string;
    products: ProductForScript[];
    ambassadriceName?: string;
    ambassadriceGrade?: string;
    ambassadriceFollowers?: number;
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
          scripts[product.id] = await generateScriptWithClaude(
            product, ambassadriceName, ambassadriceGrade, ambassadriceFollowers, apiKey
          );
        } else {
          scripts[product.id] = generateMockScript(product, ambassadriceName);
        }
      } catch (e: any) {
        console.error(`[generate-scripts] error for product ${product.id}:`, e.message);
        scripts[product.id] = generateMockScript(product, ambassadriceName);
      }
    }

    const supabase = createAdminClient();
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
