import { NextRequest, NextResponse } from 'next/server';
import { SEGMENTS, getSegmentClients, type SegmentKey } from '@/lib/segmentationService';

const MOCK_MESSAGES: Record<string, string> = {
  tous: "Bonjour {prénom} 💄 Découvrez nos nouveautés et offres exclusives du moment !\n\nLe Monde de l'Esthétique 💅",
  actifs_30j: "Bonjour {prénom} 🔥 Merci pour votre fidélité ! Profitez de -10% sur votre prochaine commande.\n\nCode : FIDELE10\nLe Monde de l'Esthétique 💅",
  'tièdes_90j': "Bonjour {prénom} 💫 Cela fait un moment ! Revenez découvrir nos nouveaux produits beauté.\n\nLe Monde de l'Esthétique 💅",
  inactifs_90j: "Bonjour {prénom} 👋 Vous nous manquez ! -20% sur votre retour, valable 7 jours.\n\nCode : RETOUR20\nLe Monde de l'Esthétique 💅",
  inactifs_6mois: "Bonjour {prénom} 💤 Ça fait longtemps ! Offre spéciale retour : -25% ce weekend.\n\nLe Monde de l'Esthétique 💅",
  vip: "Bonjour {prénom} ⭐ En tant que cliente VIP, découvrez en avant-première notre nouvelle collection exclusive.\n\nLe Monde de l'Esthétique 💅",
  abonnees: "Bonjour {prénom} 💎 Votre box du mois est prête à être personnalisée ! Connectez-vous dès maintenant.\n\nLe Monde de l'Esthétique 💅",
  sans_abonnement: "Bonjour {prénom} 📦 Découvrez notre box beauté mensuelle : produits sélectionnés à votre goût, livrés chez vous.\n\nLe Monde de l'Esthétique 💅",
  points_eleves: "Bonjour {prénom} 🏆 Vous avez cumulé beaucoup de points fidélité ! Échangez-les contre des réductions exclusives.\n\nLe Monde de l'Esthétique 💅",
  nouvelles: "Bonjour {prénom} 🌟 Bienvenue chez Le Monde de l'Esthétique ! Profitez de -15% sur votre première commande.\n\nCode : BIENVENUE15\nLe Monde de l'Esthétique 💅",
};

export async function POST(req: NextRequest) {
  let body: { segment?: string };
  try { body = await req.json(); } catch { body = {}; }

  const segment = (body.segment ?? 'tous') as SegmentKey;
  const segInfo = SEGMENTS.find(s => s.key === segment);

  const apiKey = process.env.ANTHROPIC_API_KEY ?? '';
  const hasClaude = apiKey && apiKey !== 'your-anthropic-api-key-here';

  if (!hasClaude) {
    const message = MOCK_MESSAGES[segment] ?? MOCK_MESSAGES['tous'];
    return NextResponse.json({ message, usedMock: true });
  }

  try {
    const clients = await getSegmentClients(segment);
    const count = clients.length;

    const prompt = `Tu es une experte en marketing beauté pour un salon en Martinique.

Rédige UN message WhatsApp court et accrocheur pour le segment "${segInfo?.label ?? segment}" (${count} clientes).
Description du segment : ${segInfo?.description ?? ''}

Contraintes :
- Maximum 160 caractères (SMS-friendly)
- Commence par "Bonjour {prénom}"
- Utilise des emojis pertinents
- Termine toujours par "Le Monde de l'Esthétique 💅"
- Ton chaleureux, martiniquais, professionnel
- Si pertinent, inclure une offre ou call-to-action clair

Réponds avec UNIQUEMENT le message, sans guillemets ni explication.`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 300, messages: [{ role: 'user', content: prompt }] }),
    });

    if (!response.ok) throw new Error(`Claude API ${response.status}`);
    const data = await response.json();
    const message = (data.content?.[0]?.text ?? '').trim();

    return NextResponse.json({ message: message || MOCK_MESSAGES[segment] || MOCK_MESSAGES['tous'], usedMock: false });
  } catch (e: any) {
    console.error('[ai/generate-campaign-message]', e.message);
    return NextResponse.json({ message: MOCK_MESSAGES[segment] ?? MOCK_MESSAGES['tous'], usedMock: true });
  }
}
