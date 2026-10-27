'use client';

import { useState, useEffect, useCallback } from 'react';
import { SEGMENTS, type SegmentKey, type SegmentInfo } from '@/lib/segmentationService';

type Channel = 'sms+email' | 'sms' | 'email';
type SelectionMode = 'segment' | 'manual';

interface Campaign {
  id: string;
  nom: string;
  segment: string;
  message: string;
  statut: 'brouillon' | 'en_cours' | 'terminee' | 'erreur';
  total_clients: number;
  envoyes: number;
  erreurs: number;
  created_at: string;
  sent_at?: string;
}

interface DashboardStats {
  segmentStats: Record<SegmentKey, number>;
  campaigns: Campaign[];
  totalCampaigns: number;
  totalSent: number;
  successRate: number;
}

type SendResultState = {
  ok: boolean;
  envoyes?: number;
  erreurs?: number;
  smsSent?: number;
  emailSent?: number;
  error?: string;
  errorSample?: string;
};

interface AiStrategy {
  resume: string;
  segments_prioritaires: { segment: string; raison: string; action: string }[];
  messages_suggeres: { segment: string; message: string }[];
  calendrier: { semaine: number; action: string }[];
  kpi_cibles: { taux_ouverture: string; taux_conversion: string; ca_additionnel_estime: string };
  conseil_principal: string;
}

interface ClientResult {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  email: string | null;
}

type Tab = 'creer' | 'historique' | 'sequences' | 'ia';

// ── Template bank ────────────────────────────────────────────────────────────
const TEMPLATE_BANK: {
  category: string;
  icon: string;
  description: string;
  sequence?: string;
  templates: { label: string; segment: SegmentKey; channel: Channel; subject: string; message: string }[];
}[] = [
  // ── S1 : Bienvenue ───────────────────────────────────────────────────────
  {
    category: 'S1 — Bienvenue',
    icon: '🌸',
    sequence: 'S1',
    description: 'Séquence nouvelle cliente — 3 messages sur 7 jours.',
    templates: [
      {
        label: 'E1 J0 — Email bienvenue',
        segment: 'nouvelle_cliente',
        channel: 'email',
        subject: 'Bienvenue dans la famille LMDE {prénom}',
        message: `Bonjour {prénom},\n\nToute l'équipe du Monde de l'Esthétique est ravie de t'accueillir !\n\nTu viens de rejoindre une communauté de femmes qui prennent soin d'elles, ici en Martinique. On est là pour t'accompagner à chaque étape 💕\n\nQuelques choses utiles pour commencer :\n– N'hésite jamais à nous poser tes questions par message ou en boutique\n– On connaît chaque produit qu'on vend et on adore conseiller\n– Tu accumules des points à chaque achat pour des avantages fidélité\n\nÀ très bientôt,\nChristy & l'équipe LMDE\n\n––\nPour ne plus recevoir nos messages : réponds STOP`,
      },
      {
        label: 'S1 J+2 — SMS chaleureux',
        segment: 'nouvelle_cliente',
        channel: 'sms',
        subject: '',
        message: `Coucou {prénom} ! Christy de LMDE. Comment s'est passee ta premiere visite ? N'hesite pas si tu as des questions. On est la pour toi ! A bientot - STOP 36111`,
      },
      {
        label: 'E2 J+7 — Conseil personnalisé',
        segment: 'nouvelle_cliente',
        channel: 'email',
        subject: '{prénom}, un conseil rien que pour toi',
        message: `Coucou {prénom},\n\nUne semaine que tu fais partie de la famille LMDE ! J'espère que tu es heureuse de tes produits.\n\nJe voulais partager un conseil qu'on donne à toutes nos nouvelles clientes pour notre climat martiniquais :\n\nAvec notre humidité et notre chaleur, la peau a besoin d'une hydratation légère mais constante. Un sérum appliqué sur peau légèrement humide (juste après le gommage) pénètre 2 fois plus vite et dure plus longtemps.\n\nSi tu veux qu'on te compose ta routine idéale selon ta peau, passe nous voir — c'est avec plaisir.\n\nBisous,\nChristy de LMDE\n\n––\nPour ne plus recevoir nos messages : réponds STOP`,
      },
    ],
  },

  // ── S2 : Après kit débutant ──────────────────────────────────────────────
  {
    category: 'S2 — Kit débutant',
    icon: '💅',
    sequence: 'S2',
    description: 'Séquence après achat kit — accompagnement sur 21 jours.',
    templates: [
      {
        label: 'E1 J+1 — Email post-achat kit',
        segment: 'debutante',
        channel: 'email',
        subject: '{prénom}, tes premiers pas avec ton kit',
        message: `Coucou {prénom},\n\nMerci pour ton achat ! J'espère que tu es impatiente de tester ton nouveau kit.\n\nQuelques conseils pour bien démarrer :\n\n1. Commence par un test sur un seul ongle pour vérifier que le produit te convient\n2. Prépare toujours ta surface (lime légèrement, dégraisse)\n3. Applique en couches fines — mieux vaut 3 fines couches qu'une épaisse\n4. La lampe UV : 30 à 60 secondes selon la puissance — chaque couche séparément\n\nTu as une question ? Réponds directement à ce message. Je réponds personnellement.\n\nBisous,\nChristy de LMDE\n\n––\nPour ne plus recevoir nos messages : réponds STOP`,
      },
      {
        label: 'S1 J+10 — SMS re-relance',
        segment: 'debutante',
        channel: 'sms',
        subject: '',
        message: `Coucou {prénom} ! Christy de LMDE. Tu as essaye ton kit ? Des questions ? Reponds a ce SMS, je suis la. A bientot - STOP 36111`,
      },
      {
        label: 'E2 J+14 — Email résultats',
        segment: 'debutante',
        channel: 'email',
        subject: '{prénom}, comment se passent tes ongles ?',
        message: `Coucou {prénom},\n\nCa fait 2 semaines que tu as ton kit ! Comment ça se passe ?\n\nSi tu rencontres des difficultés (tenue, brillance, application), sache que c'est normal au début — ça vient avec la pratique. Et on est là pour t'aider.\n\nSi au contraire tout se passe bien... on est ravis !\n\nDans tous les cas, notre prochain atelier pratique peut t'apporter beaucoup. Passe voir les dates en boutique ou réponds à ce message.\n\nBisous,\nChristy de LMDE\n\n––\nPour ne plus recevoir nos messages : réponds STOP`,
      },
      {
        label: 'E3 J+21 — Sans réachat',
        segment: 'debutante',
        channel: 'email',
        subject: 'Une question {prénom}',
        message: `Coucou {prénom},\n\nJe me posais une question...\n\nTu as eu ton kit il y a 3 semaines et on ne t'a pas revue depuis. Tout va bien ? Tu es heureuse de ton achat ?\n\nSi quelque chose ne va pas — si un produit ne convient pas, si tu as besoin d'aide — réponds-moi, on trouve une solution ensemble.\n\nEt si tu cherches le prochain produit pour compléter ta routine, je serai ravie de te conseiller.\n\nBisous sincères,\nChristy de LMDE\n\n––\nPour ne plus recevoir nos messages : réponds STOP`,
      },
    ],
  },

  // ── S3 : Réassort ────────────────────────────────────────────────────────
  {
    category: 'S3 — Réassort',
    icon: '🔄',
    sequence: 'S3',
    description: 'Rappels réassort produits — invitation + suivi.',
    templates: [
      {
        label: 'E1 — Invitation fiche réassort',
        segment: 'actifs_30j',
        channel: 'email',
        subject: '{prénom}, plus jamais en rupture',
        message: `Coucou {prénom},\n\nTu connais ce moment frustrant où tu arrives en boutique et ton produit préféré est épuisé ?\n\nOn a créé la fiche réassort juste pour ça.\n\nTu nous dis quels produits tu utilises régulièrement — on les surveille pour toi et on t'avertit avant qu'ils soient en rupture. Tu passes, c'est prêt.\n\nC'est gratuit, sans engagement. Juste un service en plus parce que tu le mérites.\n\nIntéressée ? Réponds à ce message ou demande en boutique.\n\nBisous,\nChristy de LMDE\n\n––\nPour ne plus recevoir nos messages : réponds STOP`,
      },
      {
        label: 'S1 — SMS rappel mensuel',
        segment: 'actifs_30j',
        channel: 'sms',
        subject: '',
        message: `Coucou {prénom} ! Christy de LMDE. Tes produits habituels sont en stock. Passe quand tu veux ! A bientot - STOP 36111`,
      },
      {
        label: 'S2 — SMS dernier flacon',
        segment: 'actifs_30j',
        channel: 'sms',
        subject: '',
        message: `{prénom} ! Il reste peu de stock de ton produit habituel. Passe avant rupture. On t'en met de cote si tu reponds OUI - Christy LMDE - STOP 36111`,
      },
    ],
  },

  // ── S4 : Le Guide ────────────────────────────────────────────────────────
  {
    category: 'S4 — Le Guide LMDE',
    icon: '📖',
    sequence: 'S4',
    description: 'Séquence guide — résultats non garantis, variables selon les personnes.',
    templates: [
      {
        label: 'E1 — Présentation du guide',
        segment: 'tous',
        channel: 'email',
        subject: '{prénom}, notre guide beauté est disponible',
        message: `Coucou {prénom},\n\nJ'ai une bonne nouvelle à te partager...\n\nOn a créé un guide beauté complet pour t'aider à prendre soin de toi au quotidien, adapté à notre peau et notre climate martiniquais.\n\nDedans tu trouveras :\n– Les routines par type de peau\n– Les techniques d'application pas à pas\n– Les associations de produits qui fonctionnent vraiment\n– Nos conseils pour les cheveux naturels\n\nLes résultats varient selon chaque personne, mais nos clientes qui l'ont suivi nous donnent des retours positifs régulièrement.\n\nDisponible en boutique. Passe nous voir pour en savoir plus.\n\nBisous,\nChristy de LMDE\n\n––\nPour ne plus recevoir nos messages : réponds STOP`,
      },
      {
        label: 'E2 J+3 — Témoignage',
        segment: 'tous',
        channel: 'email',
        subject: 'Ce que nos clientes disent du guide {prénom}',
        message: `Coucou {prénom},\n\nJe t'avais parlé de notre guide beauté il y a quelques jours...\n\nJe voulais partager avec toi ce qu'une de nos clientes m'a dit la semaine dernière :\n\n« Depuis que j'applique les conseils du guide, ma peau est beaucoup mieux hydratée et mes ongles tiennent plus longtemps. »\n\nÉvidemment, les résultats varient selon chaque personne et chaque type de peau. Mais quand on applique des gestes adaptés régulièrement, ça fait la différence.\n\nSi tu veux le découvrir, il t'attend en boutique.\n\nBisous,\nChristy de LMDE\n\n––\nPour ne plus recevoir nos messages : réponds STOP`,
      },
      {
        label: 'S1 — SMS guide',
        segment: 'tous',
        channel: 'sms',
        subject: '',
        message: `Coucou {prénom} ! Notre guide beaute est disponible en boutique. Routines, techniques, conseils peau et cheveux. Passe le decouvrir ! Christy LMDE - STOP 36111`,
      },
    ],
  },

  // ── S5 : Réactivation ────────────────────────────────────────────────────
  {
    category: 'S5 — Réactivation',
    icon: '⏰',
    sequence: 'S5',
    description: 'Relance clientes inactives 45j et 90j.',
    templates: [
      {
        label: 'E1 Pros 45j — Message exclusif',
        segment: 'pro',
        channel: 'email',
        subject: '{prénom}, vos nouveaux arrivages professionnels',
        message: `Bonjour {prénom},\n\nCela fait un moment que je ne vous ai pas eu en boutique...\n\nJe voulais vous informer en priorité : on vient de recevoir de nouveaux produits professionnels, notamment [catégorie produits]. Des articles que je pense adaptés à votre activité.\n\nSi vous souhaitez un devis ou voir les références disponibles, répondez à ce message ou passez directement — je prendrai le temps de vous présenter les nouveautés.\n\nCordialement,\nChristy de LMDE\n\n––\nPour ne plus recevoir nos messages : réponds STOP`,
      },
      {
        label: 'E2 Particulières 45j — Message doux',
        segment: 'a_reactiver_45j',
        channel: 'email',
        subject: 'On pensait à toi {prénom}',
        message: `Coucou {prénom},\n\nÇa fait un petit moment qu'on ne t'a pas vue... et on pense à toi.\n\nPas de message commercial, juste l'envie de prendre de tes nouvelles sincèrement.\n\nSi tu as besoin d'un conseil beauté, si tu cherches un produit particulier, ou si tu veux qu'on te propose une routine adaptée à ta peau — on est là.\n\nÀ très bientôt j'espère,\nChristy & l'équipe LMDE 💕\n\n––\nPour ne plus recevoir nos messages : réponds STOP`,
      },
      {
        label: 'S1 45j — SMS personnel',
        segment: 'a_reactiver_45j',
        channel: 'sms',
        subject: '',
        message: `Coucou {prénom} ! Christy de LMDE. On pensait a toi. Des nouveautes sont arrivees en boutique. Passe quand tu veux, on sera ravies ! Bisous - STOP 36111`,
      },
      {
        label: 'E3 90j — Dernière tentative',
        segment: 'inactifs_90j',
        channel: 'email',
        subject: 'Une dernière chose {prénom}',
        message: `Coucou {prénom},\n\nJe t'écris une dernière fois — promis, je ne t'embête plus après ça.\n\nÇa fait maintenant 3 mois qu'on ne t'a pas revue chez LMDE. La vie est chargée, on comprend complètement.\n\nMais si un jour l'envie te reprend de prendre soin de toi, de découvrir de nouveaux produits, ou simplement de passer nous dire bonjour — on sera toujours là avec le sourire.\n\nEt si tu ne souhaites plus recevoir nos messages, c'est totalement normal : réponds juste STOP.\n\nBisous et prends soin de toi,\nChristy de LMDE 💕\n\n––\nPour ne plus recevoir nos messages : réponds STOP`,
      },
    ],
  },

  // ── S6 : Ateliers & Événements ───────────────────────────────────────────
  {
    category: 'S6 — Ateliers & Événements',
    icon: '🎉',
    sequence: 'S6',
    description: 'Invitations et suivi événements LMDE.',
    templates: [
      {
        label: 'E1 — Invitation atelier',
        segment: 'tous',
        channel: 'email',
        subject: '{prénom}, tu es invitée à notre prochain atelier',
        message: `Coucou {prénom},\n\nJ'ai le plaisir de t'inviter à notre prochain atelier LMDE !\n\n📅 Date : {date_atelier}\n📍 Lieu : {lieu}\n\nAu programme :\n– Techniques pratiques de [thème]\n– Conseils personnalisés selon ton type de peau/ongles\n– Moment convivial entre femmes passionnées de beauté\n\nLes places sont limitées, il vaut mieux réserver à l'avance. Réponds à ce message ou appelle-nous directement.\n\nOn espère te voir là-bas !\nChristy & l'équipe LMDE 🌸\n\n––\nPour ne plus recevoir nos messages : réponds STOP`,
      },
      {
        label: 'S1 J-2 — Rappel SMS',
        segment: 'tous',
        channel: 'sms',
        subject: '',
        message: `Rappel {prénom} ! Notre atelier est dans 2 jours - {date_atelier} a {lieu}. Tu es inscrite ? Reponds pour confirmer. Bisous - Christy LMDE - STOP 36111`,
      },
      {
        label: 'S2 — SMS multilingue (FR/CR/EN)',
        segment: 'tous',
        channel: 'sms',
        subject: '',
        message: `LMDE Atelier {date_atelier} a {lieu}. FR: Inscriptions ouvertes ! CR: Enregistrement ouvert ! EN: Registrations open! Reponds pour reserver. STOP 36111`,
      },
      {
        label: 'E2 J+1 — Email post-atelier',
        segment: 'tous',
        channel: 'email',
        subject: '{prénom}, merci d\'avoir été là hier',
        message: `Coucou {prénom},\n\nMerci d'avoir participé à notre atelier hier — c'était un vrai plaisir de vous retrouver toutes !\n\nJ'espère que tu repars avec des techniques utiles et de belles inspirations. N'oublie pas de pratiquer — c'est là que tout se passe.\n\nSi tu as des questions sur ce qu'on a vu ensemble, ou si tu veux un produit qu'on a mentionné, réponds à ce message.\n\nÀ très bientôt pour le prochain événement !\nChristy de LMDE 💕\n\n––\nPour ne plus recevoir nos messages : réponds STOP`,
      },
      {
        label: 'E3 — Soirée November',
        segment: 'tous',
        channel: 'email',
        subject: '{prénom}, soirée beauté chez LMDE ce mois-ci',
        message: `Coucou {prénom},\n\nCe mois de novembre, on organise quelque chose de spécial...\n\nUne soirée beauté chez LMDE pour nos clientes : démos produits, conseils personnalisés, ambiance conviviale et bonne humeur garantie.\n\n📅 {date_atelier}\n📍 {lieu}\n\nEntrée libre pour nos clientes. Les places sont limitées — inscris-toi dès maintenant en répondant à ce message.\n\nOn te réserve une belle soirée,\nChristy & l'équipe LMDE ✨\n\n––\nPour ne plus recevoir nos messages : réponds STOP`,
      },
    ],
  },

  // ── S8 : Avis ────────────────────────────────────────────────────────────
  {
    category: 'S8 — Demande d\'avis',
    icon: '⭐',
    sequence: 'S8',
    description: 'Email J+7 après achat — collecte avis clientes.',
    templates: [
      {
        label: 'E1 J+7 — Demande avis',
        segment: 'actifs_30j',
        channel: 'email',
        subject: '{prénom}, une question rapide',
        message: `Coucou {prénom},\n\nJ'espère que tu es heureuse de ton dernier achat !\n\nJe voulais juste te demander : est-ce que tout se passe bien ? Est-ce que le produit répond à tes attentes ?\n\nTon avis compte vraiment pour nous — ça nous aide à mieux vous servir.\n\nSi tu as une minute pour nous laisser un commentaire sur Google, c'est ici : {lien_avis}\n\nEt si quelque chose ne va pas, réponds directement à ce message — on s'en occupe.\n\nMerci d'être des nôtres,\nChristy de LMDE 💕\n\n––\nPour ne plus recevoir nos messages : réponds STOP`,
      },
    ],
  },

  // ── S9 : Programme Ambassadrices ─────────────────────────────────────────
  {
    category: 'S9 — Ambassadrices',
    icon: '🌺',
    sequence: 'S9',
    description: 'Recrutement et animation programme ambassadrices.',
    templates: [
      {
        label: 'E1 — Invitation programme',
        segment: 'vip',
        channel: 'email',
        subject: '{prénom}, une opportunité pour toi',
        message: `Coucou {prénom},\n\nJe voulais te parler de quelque chose de particulier.\n\nTu es une de nos clientes les plus fidèles, et je me disais que notre programme Ambassadrices pourrait t'intéresser.\n\nConcrètement : tu partages ton expérience LMDE autour de toi (amies, famille, réseaux) — et chaque nouvelle cliente que tu amènes te rapporte des avantages exclusifs. Pas de pression, pas d'objectif obligatoire. Juste une façon de te remercier pour ce que tu fais déjà naturellement.\n\nTu veux en savoir plus ? Réponds à ce message et on prend 5 minutes pour t'expliquer tout ça.\n\nBisous,\nChristy de LMDE 💕\n\n––\nPour ne plus recevoir nos messages : réponds STOP`,
      },
      {
        label: 'S1 — SMS code ambassadrice',
        segment: 'ambassadrice',
        channel: 'sms',
        subject: '',
        message: `Coucou {prénom} ! Rappel : ton code ambassadrice {code_ambassadrice} offre -15% a tes filleules. Partage-le ! Questions ? Reponds a ce SMS. Bisous - Christy LMDE - STOP 36111`,
      },
    ],
  },

  // ── S10 : Fidélité ───────────────────────────────────────────────────────
  {
    category: 'S10 — Fidélité',
    icon: '🥇',
    sequence: 'S10',
    description: 'Notification points fidélité — récompense clientes fidèles.',
    templates: [
      {
        label: 'S1 — SMS notification points',
        segment: 'fidelite_300pts',
        channel: 'sms',
        subject: '',
        message: `Coucou {prénom} ! Tu as {points} points fidelite chez LMDE. Tu peux les utiliser pour [avantage]. Viens en profiter ! Bisous - Christy - STOP 36111`,
      },
      {
        label: 'Email — Palier atteint',
        segment: 'fidelite_300pts',
        channel: 'email',
        subject: '{prénom}, tu as atteint un nouveau palier',
        message: `Coucou {prénom},\n\nFélicitations ! Tu viens d'atteindre {points} points de fidélité chez LMDE.\n\nC'est notre façon de te dire merci — tu fais vraiment partie de nos clientes les plus précieuses.\n\nTes points te donnent droit à : {offre}\n\nMentionne-le lors de ta prochaine visite ou réponds à ce message pour en savoir plus.\n\nBisous,\nChristy & l'équipe LMDE ✨\n\n––\nPour ne plus recevoir nos messages : réponds STOP`,
      },
    ],
  },

  // ── S11 : Anniversaire ───────────────────────────────────────────────────
  {
    category: 'S11 — Anniversaire',
    icon: '🎂',
    sequence: 'S11',
    description: 'Message anniversaire — cadeau à définir par campagne.',
    templates: [
      {
        label: 'S1 — SMS anniversaire',
        segment: 'anniversaire_mois',
        channel: 'sms',
        subject: '',
        message: `Joyeux anniversaire {prénom} ! Toute l'equipe LMDE te souhaite une belle journee. On t'a reserve une surprise en boutique ce mois-ci. Passe nous voir ! Bisous - Christy - STOP 36111`,
      },
      {
        label: 'Email — Joyeux anniversaire',
        segment: 'anniversaire_mois',
        channel: 'email',
        subject: 'Joyeux anniversaire {prénom}',
        message: `Coucou {prénom},\n\nToute l'équipe LMDE te souhaite un très joyeux anniversaire !\n\nPour fêter ça avec toi, on t'a préparé une petite surprise : {offre}\n\nValable ce mois-ci uniquement — passe nous voir pour en profiter.\n\nOn t'embrasse fort,\nChristy & l'équipe LMDE 🎉💕\n\n––\nPour ne plus recevoir nos messages : réponds STOP`,
      },
    ],
  },

  // ── S12 : Événements saisonniers ─────────────────────────────────────────
  {
    category: 'S12 — Halloween & Saisonnier',
    icon: '🎃',
    sequence: 'S12',
    description: 'Campagnes liées aux fêtes et saisons — à utiliser ponctuellement.',
    templates: [
      {
        label: 'E1 — Email Halloween',
        segment: 'tous',
        channel: 'email',
        subject: '{prénom}, un look Halloween qui fait peur (de beauté)',
        message: `Coucou {prénom},\n\nHalloween approche... et si on créait un look qui impressionne ?\n\nCette semaine chez LMDE, on te propose nos meilleurs produits pour un make-up Halloween :\n– Faux ongles et gels couleur nuit\n– Effets pailletés et nacres profondes\n– Accessoires et contours dramatiques\n\nPasse en boutique, on te conseille selon le look que tu veux créer !\n\nBisous,\nChristy de LMDE 🎃\n\n––\nPour ne plus recevoir nos messages : réponds STOP`,
      },
      {
        label: 'S1 — SMS Halloween',
        segment: 'tous',
        channel: 'sms',
        subject: '',
        message: `Halloween chez LMDE {prénom} ! Gels, faux ongles et look spectacular. Passe en boutique cette semaine. Bisous - Christy LMDE - STOP 36111`,
      },
    ],
  },

  // ── S13 : Messages de service ────────────────────────────────────────────
  {
    category: 'S13 — Messages Service',
    icon: '📦',
    sequence: 'S13',
    description: 'Confirmations et suivi commandes — ne comptent pas dans la fréquence commerciale.',
    templates: [
      {
        label: 'E1 — Confirmation commande France',
        segment: 'nouvelles',
        channel: 'email',
        subject: 'Ta commande LMDE est confirmée {prénom}',
        message: `Bonjour {prénom},\n\nTa commande est bien confirmée ! Merci de nous faire confiance.\n\nImportant pour les livraisons vers la France métropolitaine : des frais de douane peuvent s'appliquer à la réception de ton colis. Ces frais sont à la charge du destinataire et dépendent des règles douanières en vigueur. En cas de question, n'hésite pas à nous contacter.\n\nOn prépare ta commande avec soin. Tu recevras un message quand elle sera expédiée.\n\nÀ très bientôt,\nChristy & l'équipe LMDE\n\n––\nCeci est un message de service. Pour toute question : réponds à cet email.`,
      },
      {
        label: 'S1 — SMS colis prêt',
        segment: 'actifs_30j',
        channel: 'sms',
        subject: '',
        message: `{prénom} ton colis LMDE est pret ! Passe le recuperer en boutique ou contacte-nous pour la livraison. Merci ! Christy LMDE`,
      },
    ],
  },

  // ── Piliers classiques ───────────────────────────────────────────────────
  {
    category: 'La Copine Beauté',
    icon: '💕',
    description: 'Chaleureux, proche — comme un message d\'une amie. Taux d\'ouverture ×3.',
    templates: [
      {
        label: 'Coucou, tu nous manques',
        segment: 'inactifs_90j',
        channel: 'sms+email',
        subject: 'On pensait à toi',
        message: `Coucou {prénom},\n\nCa fait un petit moment qu'on ne t'a pas vue... tu nous manques vraiment !\n\nPas de discours de vente, juste l'envie de prendre de tes nouvelles et te dire qu'on t'attend avec le sourire.\n\nSi tu cherches quelque chose de particulier ou si tu veux un conseil, réponds à ce message — on sera ravies de t'aider.\n\nA très bientôt j'espère,\nChristy & l'équipe LMDE\n\n––\nPour ne plus recevoir nos messages : réponds STOP`,
      },
      {
        label: '6 mois — message du coeur',
        segment: 'inactifs_6mois',
        channel: 'email',
        subject: 'Un message personnel pour toi {prénom}',
        message: `Bonjour {prénom},\n\nJe voulais t'écrire personnellement.\n\nCa fait maintenant 6 mois qu'on ne t'a pas vue chez LMDE et franchement, tu nous manques.\n\nLa vie est parfois bien chargée — on comprend complètement. Mais si l'envie te reprend de prendre soin de toi, toute l'équipe t'attend avec le sourire.\n\nEt entre nous, on a reçu des produits que je suis sûre que tu vas adorer.\n\nA très bientôt j'espère,\nChristy\nLe Monde de l'Esthétique\n\n––\nPour ne plus recevoir nos messages : réponds STOP`,
      },
      {
        label: 'Invitation douce (SMS)',
        segment: 'tièdes_90j',
        channel: 'sms',
        subject: '',
        message: `Coucou {prénom} ca fait un moment ! Chez LMDE on a recu de belles choses et j'ai pense a toi. Passe nous voir ? Bisous - Christy - STOP 36111`,
      },
    ],
  },
  {
    category: 'Conseil d\'Experte',
    icon: '💡',
    description: 'Astuce sans vente → confiance → achat naturel.',
    templates: [
      {
        label: 'Astuce peau tropicale',
        segment: 'actifs_30j',
        channel: 'email',
        subject: 'Un conseil de pro pour ta peau {prénom}',
        message: `Coucou {prénom},\n\nUne astuce qu'on partage avec nos clientes...\n\nPar la chaleur et l'humidité de la Martinique, le fond de teint tient bien mieux si tu appliques une brume hydratante AVANT ta base. La peau est légèrement humide, la formule accroche mieux — résultat impeccable toute la journée, même sous 30 degrés.\n\nPetit plus : une touche de poudre translucide sur la zone T, et c'est parfait.\n\nOn a tout ce qu'il faut en boutique. Passe nous voir et on te compose ta routine idéale.\n\nBisous,\nChristy de LMDE\n\n––\nPour ne plus recevoir nos messages : réponds STOP`,
      },
      {
        label: 'Astuce sérum (SMS)',
        segment: 'actifs_30j',
        channel: 'sms',
        subject: '',
        message: `Astuce LMDE {prénom} : applique ton sérum sur peau légèrement humide — il penètre 2x mieux ! On a les meilleurs sérums adaptés a notre climat. A bientôt - Christy - STOP 36111`,
      },
      {
        label: 'Conseil cheveux naturels',
        segment: 'tous',
        channel: 'email',
        subject: '{prénom}, tu connais cette astuce cheveux ?',
        message: `Coucou {prénom},\n\nDans notre humidité martiniquaise, les cheveux naturels ont besoin d'une hydratation renforcée, surtout en saison de pluie.\n\nLa méthode LOC (Leave-in → Huile → Crème) garde les boucles définies et hydratées 2 fois plus longtemps. Un vrai game changer !\n\nOn a sélectionné les meilleures huiles et crèmes adaptées à nos cheveux. Viens en découvrir quelques-unes.\n\nA très bientôt,\nChristy de LMDE\n\n––\nPour ne plus recevoir nos messages : réponds STOP`,
      },
    ],
  },
  {
    category: 'Avant tout le monde',
    icon: '✨',
    description: 'Exclusivité et VIP — fait se sentir privilégiée.',
    templates: [
      {
        label: 'Nouveauté VIP en priorité',
        segment: 'vip',
        channel: 'sms+email',
        subject: 'Avant tout le monde {prénom}',
        message: `Bonjour {prénom},\n\nJe t'écris avant d'en parler à tout le monde...\n\nOn vient de recevoir [décris la nouveauté en 2-3 phrases] et j'ai pensé à toi en premier.\n\nLes quantités sont limitées et je voulais que tu aies la priorité.\n\nTu veux qu'on t'en mette de côté ? Réponds à ce message ou passe directement en boutique.\n\nBisous,\nChristy de LMDE\n\n––\nPour ne plus recevoir nos messages : réponds STOP`,
      },
    ],
  },
  {
    category: 'Gratitude & Lien',
    icon: '🙏',
    description: 'La relation avant tout. Crée des clientes à vie.',
    templates: [
      {
        label: 'Merci pour ta fidélité',
        segment: 'points_eleves',
        channel: 'email',
        subject: 'Tu le mérites vraiment {prénom}',
        message: `Bonjour {prénom},\n\nJe voulais prendre un moment pour te dire merci.\n\nTa fidélité chez LMDE compte vraiment beaucoup pour nous. Ce n'est pas juste un achat de plus — tu fais partie de notre famille beauté.\n\nPour te remercier : {offre}\n\nPasse nous voir, on sera ravies de te retrouver.\n\nAvec toute notre reconnaissance,\nChristy & l'équipe LMDE\n\n––\nPour ne plus recevoir nos messages : réponds STOP`,
      },
      {
        label: 'Invitation Box Beauté',
        segment: 'sans_abonnement',
        channel: 'email',
        subject: '{prénom}, et si on prenait soin de toi chaque mois ?',
        message: `Bonjour {prénom},\n\nJe voulais te parler d'une chose que nos abonnées adorent...\n\nChaque mois, elles reçoivent leur Box Beauté avec des produits sélectionnés selon leurs besoins — sans avoir à penser à rien.\n\n[Décris l'avantage principal de l'abonnement]\n\nTu veux en savoir plus ? Réponds à ce message ou passe nous voir.\n\nBisous,\nChristy de LMDE\n\n––\nPour ne plus recevoir nos messages : réponds STOP`,
      },
    ],
  },
];

// ── Compliance helpers ───────────────────────────────────────────────────────
const FORBIDDEN_SUBJECT_WORDS = ['PROMO', 'OFFRE', 'GRATUIT', 'URGENT', 'SOLDES', 'REDUCTION', 'REMISE'];
function hasForbiddenWords(text: string): string[] {
  const upper = text.toUpperCase();
  return FORBIDDEN_SUBJECT_WORDS.filter(w => upper.includes(w) || text.includes('%'));
}
function hasEmoji(text: string): boolean {
  return /\p{Emoji_Presentation}|\p{Extended_Pictographic}/u.test(text);
}
function smsSegmentCount(text: string): { segments: number; charsPerSeg: number; total: number } {
  const unicode = hasEmoji(text);
  const charsPerSeg = unicode ? 70 : 160;
  const segments = Math.ceil(text.length / charsPerSeg) || 1;
  return { segments, charsPerSeg, total: text.length };
}

// ── Segment display helper ────────────────────────────────────────────────────
function parseSegmentStr(raw: string): { key: string; channel: Channel; ids: string[] | null } {
  const parts = raw.split('|');
  const key = parts[0];
  const isChannel = (s?: string): s is Channel => s === 'sms' || s === 'email' || s === 'sms+email';
  if (key === 'custom') {
    if (parts.length >= 3 && isChannel(parts[1])) return { key, channel: parts[1], ids: parts[2].split(',').filter(Boolean) };
    if (parts.length >= 2) return { key, channel: 'sms+email', ids: parts[1].split(',').filter(Boolean) };
    return { key, channel: 'sms+email', ids: [] };
  }
  return { key, channel: isChannel(parts[1]) ? parts[1] : 'sms+email', ids: null };
}

function segmentDisplay(raw: string): string {
  const { key, channel, ids } = parseSegmentStr(raw);
  const channelLabel = channel === 'sms' ? ' · SMS' : channel === 'email' ? ' · Email' : '';
  if (key === 'custom') return `🎯 Sélection manuelle (${ids?.length ?? 0} clientes)${channelLabel}`;
  const seg = SEGMENTS.find(s => s.key === key);
  return seg ? `${seg.icon} ${seg.label}${channelLabel}` : raw;
}

const STATUT_LABELS: Record<string, { label: string; color: string }> = {
  brouillon: { label: 'Brouillon', color: 'bg-gray-100 text-gray-700' },
  en_cours: { label: 'En cours', color: 'bg-blue-100 text-blue-700' },
  terminee: { label: 'Terminée', color: 'bg-green-100 text-green-700' },
  erreur: { label: 'Erreur', color: 'bg-red-100 text-red-700' },
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

async function safeJson(res: Response): Promise<any> {
  const text = await res.text();
  try { return JSON.parse(text); }
  catch { return { error: `Réponse invalide du serveur: ${text.slice(0, 120)}` }; }
}

function clientName(c: ClientResult): string {
  const f = c.first_name?.trim() ?? '';
  const l = c.last_name?.trim() ?? '';
  if (f && !/^\d+$/.test(f)) return `${f} ${l}`.trim();
  return l || c.phone || 'Cliente';
}

export default function MarketingPage() {
  const [activeTab, setActiveTab] = useState<Tab>('creer');
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  // Form state
  const [nom, setNom] = useState('');
  const [sujet, setSujet] = useState('');
  const [segment, setSegment] = useState<SegmentKey>('tous');
  const [message, setMessage] = useState('');
  const [channel, setChannel] = useState<Channel>('sms+email');
  const [selectionMode, setSelectionMode] = useState<SelectionMode>('segment');

  // Manual client selection
  const [manualSearch, setManualSearch] = useState('');
  const [manualResults, setManualResults] = useState<ClientResult[]>([]);
  const [manualSearchLoading, setManualSearchLoading] = useState(false);
  const [selectedClients, setSelectedClients] = useState<ClientResult[]>([]);

  // Image URL for email
  const [imageUrl, setImageUrl] = useState('');

  // Clickable product links (email only)
  const [links, setLinks] = useState<{ label: string; url: string }[]>([]);

  // Template bank
  const [showTemplates, setShowTemplates] = useState(false);

  // Send state
  const [segmentPreview, setSegmentPreview] = useState<{ count: number; preview: { id: string; name: string; phone: string }[] } | null>(null);
  const [segmentLoading, setSegmentLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [sendResult, setSendResult] = useState<SendResultState | null>(null);

  // AI
  const [aiStrategy, setAiStrategy] = useState<AiStrategy | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiMock, setAiMock] = useState(false);

  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const res = await fetch('/api/marketing/dashboard-stats');
      if (res.ok) setStats(await res.json());
    } finally {
      setStatsLoading(false);
    }
  }, []);

  useEffect(() => { loadStats(); }, [loadStats]);

  const loadSegmentPreview = useCallback(async (seg: SegmentKey) => {
    setSegmentLoading(true);
    setSegmentPreview(null);
    try {
      const res = await fetch(`/api/marketing/segment-preview?segment=${encodeURIComponent(seg)}`);
      if (res.ok) setSegmentPreview(await res.json());
    } finally {
      setSegmentLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectionMode === 'segment') loadSegmentPreview(segment);
  }, [segment, selectionMode, loadSegmentPreview]);

  // Debounced client search
  useEffect(() => {
    if (manualSearch.length < 2) { setManualResults([]); return; }
    const t = setTimeout(async () => {
      setManualSearchLoading(true);
      try {
        const res = await fetch(`/api/marketing/client-search?q=${encodeURIComponent(manualSearch)}`);
        if (res.ok) {
          const data: ClientResult[] = await res.json();
          setManualResults(data.filter(c => !selectedClients.find(s => s.id === c.id)));
        }
      } finally { setManualSearchLoading(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [manualSearch, selectedClients]);

  const addLink = () => setLinks(prev => [...prev, { label: '', url: '' }]);
  const updateLink = (i: number, field: 'label' | 'url', val: string) =>
    setLinks(prev => prev.map((l, idx) => idx === i ? { ...l, [field]: val } : l));
  const removeLink = (i: number) => setLinks(prev => prev.filter((_, idx) => idx !== i));

  const addClient = (c: ClientResult) => {
    if (selectedClients.find(s => s.id === c.id)) return;
    setSelectedClients(prev => [...prev, c]);
    setManualSearch('');
    setManualResults([]);
  };

  const removeClient = (id: string) => setSelectedClients(prev => prev.filter(c => c.id !== id));

  const applyTemplate = (t: typeof TEMPLATE_BANK[0]['templates'][0]) => {
    setMessage(t.message);
    setChannel(t.channel);
    setSujet(t.subject ?? '');
    if (selectionMode === 'segment') setSegment(t.segment);
    setShowTemplates(false);
  };

  const handleCreate = async () => {
    if (!nom.trim() || !message.trim()) return;
    if (selectionMode === 'manual' && selectedClients.length === 0) {
      setSendResult({ ok: false, error: 'Sélectionnez au moins une cliente' });
      return;
    }
    setCreating(true);
    setSendResult(null);
    try {
      const res = await fetch('/api/marketing/campagnes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nom,
          sujet: sujet.trim() || undefined,
          image_url: imageUrl.trim() || undefined,
          links: links.filter(l => l.url.startsWith('http') && l.label.trim()).length > 0
            ? links.filter(l => l.url.startsWith('http') && l.label.trim())
            : undefined,
          segment,
          message,
          channel,
          client_ids: selectionMode === 'manual' ? selectedClients.map(c => c.id) : undefined,
        }),
      });
      const data = await safeJson(res);
      if (!res.ok) { setSendResult({ ok: false, error: data.error }); return; }

      setSendingId(data.id);
      const sendRes = await fetch(`/api/marketing/campagnes/${data.id}/envoyer`, { method: 'POST' });
      const sendData = await safeJson(sendRes);
      if (sendRes.ok) {
        const noneReached = (sendData.envoyes ?? 0) === 0 && (sendData.erreurs ?? 0) > 0;
        if (noneReached) {
          // Delivery fully failed — keep form content so user can adjust and retry
          setSendResult({
            ok: false,
            envoyes: 0,
            erreurs: sendData.erreurs,
            smsSent: 0,
            emailSent: 0,
            errorSample: sendData.errorSample,
            error: `Aucune cliente atteinte${sendData.errorSample ? ` — ${sendData.errorSample}` : ''}. Vérifiez que les clientes ont une adresse email/numéro valide pour ce canal.`,
          });
        } else {
          setSendResult({ ok: true, envoyes: sendData.envoyes, erreurs: sendData.erreurs, smsSent: sendData.smsSent, emailSent: sendData.emailSent });
          setNom(''); setSujet(''); setMessage(''); setImageUrl(''); setLinks([]); setSelectedClients([]); setManualSearch('');
          loadStats();
        }
      } else {
        setSendResult({ ok: false, error: sendData.error });
      }
    } catch (e: any) {
      setSendResult({ ok: false, error: e.message });
    } finally {
      setCreating(false);
      setSendingId(null);
    }
  };

  const handleResend = async (id: string) => {
    setSendingId(id);
    setSendResult(null);
    try {
      const res = await fetch(`/api/marketing/campagnes/${id}/envoyer`, { method: 'POST' });
      const data = await safeJson(res);
      if (res.ok) {
        const noneReached = (data.envoyes ?? 0) === 0 && (data.erreurs ?? 0) > 0;
        setSendResult(noneReached
          ? { ok: false, envoyes: 0, erreurs: data.erreurs, error: `Aucune cliente atteinte${data.errorSample ? ` — ${data.errorSample}` : ''}` }
          : { ok: true, envoyes: data.envoyes, erreurs: data.erreurs, smsSent: data.smsSent, emailSent: data.emailSent }
        );
        loadStats();
      } else {
        setSendResult({ ok: false, error: data.error });
      }
    } catch (e: any) {
      setSendResult({ ok: false, error: e.message });
    } finally {
      setSendingId(null);
    }
  };

  const handleAiStrategy = async () => {
    setAiLoading(true);
    setAiStrategy(null);
    try {
      const res = await fetch('/api/ai/marketing-strategy', { method: 'POST' });
      const data = await safeJson(res);
      if (res.ok) { setAiStrategy(data.strategy); setAiMock(data.usedMock ?? false); }
    } catch (e: any) {
      console.error('[ai-strategy]', e.message);
    } finally {
      setAiLoading(false);
    }
  };

  const segInfo = SEGMENTS.find(s => s.key === segment);
  const charCount = message.length;
  const canSend = nom.trim() && message.trim() && (selectionMode === 'segment' || selectedClients.length > 0);

  const isSmsChannel = channel === 'sms' || channel === 'sms+email';
  const isEmailChannel = channel === 'email' || channel === 'sms+email';
  const forbiddenInSubject = hasForbiddenWords(sujet);
  const smsInfo = isSmsChannel ? smsSegmentCount(message) : null;
  const smsUnicode = smsInfo ? hasEmoji(message) : false;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Portail Marketing</h1>
        <p className="text-muted-foreground text-sm mt-1">Campagnes multi-canal (SMS + Email) — segmentation clientes — stratégie IA</p>
      </div>

      {/* KPI row */}
      {!statsLoading && stats && (
        <div className="grid grid-cols-4 gap-4 mb-6">
          {[
            { label: 'Clientes totales', value: stats.segmentStats['tous'] ?? 0, color: 'text-blue-600' },
            { label: 'Campagnes envoyées', value: stats.totalCampaigns, color: 'text-pink-600' },
            { label: 'Messages envoyés', value: stats.totalSent, color: 'text-green-600' },
            { label: 'Taux de succès', value: `${stats.successRate}%`, color: 'text-purple-600' },
          ].map(k => (
            <div key={k.label} className="bg-white border border-border rounded-xl p-4">
              <p className="text-xs text-muted-foreground">{k.label}</p>
              <p className={`text-2xl font-bold ${k.color}`}>{k.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-muted rounded-lg p-1 w-fit flex-wrap">
        {([
          { id: 'creer', label: '📣 Créer une campagne' },
          { id: 'sequences', label: '🔁 Séquences' },
          { id: 'historique', label: '📋 Historique' },
          { id: 'ia', label: '🤖 Analyse IA' },
        ] as { id: Tab; label: string }[]).map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${activeTab === t.id ? 'bg-white shadow text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── TAB: Créer ── */}
      {activeTab === 'creer' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Form */}
          <div className="lg:col-span-2 space-y-5">
            <div className="bg-white border border-border rounded-xl p-5 space-y-5">
              <h2 className="font-semibold text-foreground">Nouvelle campagne</h2>

              {/* Nom */}
              <div>
                <label className="text-sm font-medium text-foreground">Nom de la campagne</label>
                <input
                  type="text"
                  value={nom}
                  onChange={e => setNom(e.target.value)}
                  placeholder="ex: Promo Été Juin 2026"
                  className="mt-1 w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400"
                />
              </div>

              {/* Canal d'envoi */}
              <div>
                <label className="text-sm font-medium text-foreground">Canal d'envoi</label>
                <div className="grid grid-cols-3 gap-2 mt-2">
                  {([
                    { value: 'sms+email', label: '📱+✉️ SMS + Email', desc: 'Recommandé' },
                    { value: 'sms', label: '📱 SMS', desc: 'Numéro requis' },
                    { value: 'email', label: '✉️ Email', desc: 'Adresse requise' },
                  ] as { value: Channel; label: string; desc: string }[]).map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setChannel(opt.value)}
                      className={`flex flex-col items-center justify-center border rounded-xl px-2 py-2.5 text-sm font-medium transition-all ${
                        channel === opt.value
                          ? 'bg-pink-500 text-white border-pink-500 shadow'
                          : 'border-border text-muted-foreground hover:border-pink-300 hover:text-foreground'
                      }`}
                    >
                      <span className="text-base leading-tight">{opt.label}</span>
                      <span className={`text-[11px] mt-0.5 ${channel === opt.value ? 'text-pink-100' : 'text-muted-foreground'}`}>{opt.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Sujet email */}
              {isEmailChannel && (
                <div className="space-y-3">
                  <div>
                    <label className="text-sm font-medium text-foreground">Sujet de l'email</label>
                    <input
                      type="text"
                      value={sujet}
                      onChange={e => setSujet(e.target.value)}
                      placeholder='ex: "On pensait à toi {prénom}" — personnel, pas commercial'
                      className={`mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400 ${forbiddenInSubject.length > 0 ? 'border-red-400 bg-red-50' : 'border-border'}`}
                    />
                    {forbiddenInSubject.length > 0 ? (
                      <p className="text-[11px] text-red-600 mt-1 font-medium">
                        🚫 Mots interdits détectés : {forbiddenInSubject.join(', ')} — Gmail classera ce message en "Promotions"
                      </p>
                    ) : (
                      <p className="text-[11px] text-amber-600 mt-1">
                        ⚠️ Évitez : PROMO, OFFRE, %, URGENT, GRATUIT — Préférez un sujet personnel avec {'{prénom}'}.
                      </p>
                    )}
                  </div>

                  {/* Image banner */}
                  <div>
                    <label className="text-sm font-medium text-foreground">
                      Photo / bannière <span className="text-muted-foreground font-normal">(optionnel)</span>
                    </label>
                    <input
                      type="url"
                      value={imageUrl}
                      onChange={e => setImageUrl(e.target.value)}
                      placeholder="https://... URL publique d'une image produit ou ambiance"
                      className="mt-1 w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400"
                    />
                    {imageUrl && (
                      <div className="mt-2 rounded-lg overflow-hidden border border-pink-200">
                        <img src={imageUrl} alt="Aperçu" className="w-full max-h-32 object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                      </div>
                    )}
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Copiez l'URL d'une photo depuis votre Shopify, Instagram ou Google Drive (lien direct). Elle apparaîtra en bannière sous le header rose.
                    </p>
                  </div>

                  {/* Liens cliquables */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-sm font-medium text-foreground">
                        Liens produits cliquables <span className="text-muted-foreground font-normal">(optionnel)</span>
                      </label>
                      <button
                        onClick={addLink}
                        disabled={links.length >= 4}
                        className="text-xs text-pink-600 hover:text-pink-700 border border-pink-200 hover:border-pink-400 rounded-lg px-2.5 py-1 transition-colors disabled:opacity-40"
                      >
                        + Ajouter un lien
                      </button>
                    </div>
                    {links.length === 0 && (
                      <p className="text-[11px] text-muted-foreground">Boutons cliquables dans l'email (ex: "Voir ce produit" → lien Shopify).</p>
                    )}
                    {links.map((link, i) => (
                      <div key={i} className="flex gap-2 mb-2">
                        <input
                          type="text"
                          value={link.label}
                          onChange={e => updateLink(i, 'label', e.target.value)}
                          placeholder="Texte du bouton"
                          className="flex-1 border border-border rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-pink-400"
                        />
                        <input
                          type="url"
                          value={link.url}
                          onChange={e => updateLink(i, 'url', e.target.value)}
                          placeholder="https://..."
                          className="flex-[2] border border-border rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-pink-400"
                        />
                        <button onClick={() => removeLink(i)} className="text-muted-foreground hover:text-red-500 px-1 text-sm font-bold">×</button>
                      </div>
                    ))}
                    {links.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {links.filter(l => l.label && l.url.startsWith('http')).map((l, i) => (
                          <span key={i} className="inline-block bg-pink-600 text-white text-[11px] font-semibold rounded px-3 py-1.5">{l.label}</span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Clientes ciblées */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-foreground">Clientes ciblées</label>
                  <div className="flex rounded-lg border border-border overflow-hidden text-xs">
                    <button
                      onClick={() => setSelectionMode('segment')}
                      className={`px-3 py-1.5 font-medium transition-colors ${selectionMode === 'segment' ? 'bg-pink-500 text-white' : 'text-muted-foreground hover:bg-muted'}`}
                    >
                      📊 Segments
                    </button>
                    <button
                      onClick={() => setSelectionMode('manual')}
                      className={`px-3 py-1.5 font-medium transition-colors border-l border-border ${selectionMode === 'manual' ? 'bg-pink-500 text-white' : 'text-muted-foreground hover:bg-muted'}`}
                    >
                      🎯 Sélection manuelle
                    </button>
                  </div>
                </div>

                {selectionMode === 'segment' ? (
                  <>
                    <select
                      value={segment}
                      onChange={e => setSegment(e.target.value as SegmentKey)}
                      className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400"
                    >
                      {SEGMENTS.map(s => (
                        <option key={s.key} value={s.key}>
                          {s.icon} {s.label} {stats?.segmentStats[s.key] !== undefined ? `(${stats.segmentStats[s.key]})` : ''}
                        </option>
                      ))}
                    </select>
                    {segInfo && <p className="text-xs text-muted-foreground mt-1">{segInfo.description}</p>}
                  </>
                ) : (
                  <div className="space-y-2">
                    <div className="relative">
                      <input
                        type="text"
                        value={manualSearch}
                        onChange={e => setManualSearch(e.target.value)}
                        placeholder="Rechercher une cliente (prénom, nom, téléphone)..."
                        className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400 pr-8"
                      />
                      {manualSearchLoading && (
                        <div className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-pink-400 border-t-transparent rounded-full animate-spin" />
                      )}
                    </div>

                    {manualResults.length > 0 && (
                      <div className="border border-border rounded-lg overflow-hidden">
                        {manualResults.slice(0, 8).map(c => (
                          <button
                            key={c.id}
                            onClick={() => addClient(c)}
                            className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-pink-50 transition-colors text-left border-b border-border last:border-b-0"
                          >
                            <div className="w-7 h-7 rounded-full bg-pink-100 flex items-center justify-center text-pink-600 text-xs font-bold shrink-0">
                              {(clientName(c)[0] || '?').toUpperCase()}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium truncate">{clientName(c)}</p>
                              <p className="text-xs text-muted-foreground">{c.phone}{c.email ? ` · ${c.email}` : ''}</p>
                            </div>
                            <span className="text-xs text-pink-500 shrink-0">+ Ajouter</span>
                          </button>
                        ))}
                      </div>
                    )}

                    {selectedClients.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1.5">{selectedClients.length} cliente{selectedClients.length > 1 ? 's' : ''} sélectionnée{selectedClients.length > 1 ? 's' : ''}</p>
                        <div className="flex flex-wrap gap-1.5">
                          {selectedClients.map(c => (
                            <span key={c.id} className="inline-flex items-center gap-1 bg-pink-100 text-pink-700 border border-pink-200 rounded-full px-2.5 py-1 text-xs font-medium">
                              {clientName(c)}
                              <button onClick={() => removeClient(c.id)} className="ml-0.5 hover:text-pink-900 font-bold leading-none">×</button>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {selectedClients.length === 0 && manualSearch.length < 2 && (
                      <p className="text-xs text-muted-foreground">Tapez au moins 2 caractères pour rechercher.</p>
                    )}
                  </div>
                )}
              </div>

              {/* Message */}
              <div>
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-foreground">Message</label>
                  {smsInfo ? (
                    <span className={`text-xs font-mono font-medium ${smsInfo.segments > 1 ? 'text-orange-500' : 'text-green-600'}`}>
                      {charCount} car. · {smsInfo.segments} SMS{smsUnicode ? ' (Unicode)' : ''}
                    </span>
                  ) : (
                    <span className="text-xs font-mono text-muted-foreground">{charCount} car.</span>
                  )}
                </div>
                <textarea
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  rows={6}
                  placeholder={`Bonjour {prénom},\n\nVotre message ici...\n\nChristy de LMDE - STOP 36111`}
                  className="mt-1 w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400 resize-none"
                />
                <div className="flex flex-col gap-1 mt-1">
                  <div className="flex items-center gap-2">
                    <p className="text-xs text-muted-foreground">
                      Variables : <code className="bg-muted px-1 rounded">{'{prénom}'}</code> <code className="bg-muted px-1 rounded">{'{points}'}</code> <code className="bg-muted px-1 rounded">{'{offre}'}</code>
                    </p>
                    <div className="flex items-center gap-1 ml-auto">
                      {isSmsChannel && <span className="text-xs bg-blue-50 text-blue-600 border border-blue-200 rounded px-1.5 py-0.5">📱 SMS</span>}
                      {isEmailChannel && <span className="text-xs bg-purple-50 text-purple-600 border border-purple-200 rounded px-1.5 py-0.5">✉️ Email</span>}
                    </div>
                  </div>
                  {isSmsChannel && smsUnicode && (
                    <p className="text-[11px] text-orange-600 bg-orange-50 border border-orange-200 rounded px-2 py-1">
                      ⚠️ Le message contient des emojis — mode Unicode activé (70 car./SMS au lieu de 160). Envisagez de supprimer les emojis pour économiser des SMS.
                    </p>
                  )}
                  {isSmsChannel && !message.toUpperCase().includes('STOP') && message.length > 0 && (
                    <p className="text-[11px] text-amber-600 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                      ⚠️ Rappel : les SMS commerciaux doivent contenir une mention STOP (ex: "STOP 36111" à la fin).
                    </p>
                  )}
                </div>
              </div>

              {/* Template bank toggle */}
              <div>
                <button
                  onClick={() => setShowTemplates(v => !v)}
                  className="flex items-center gap-1.5 text-xs font-medium text-pink-600 hover:text-pink-700 transition-colors"
                >
                  <span>{showTemplates ? '▲' : '▼'}</span>
                  📚 {showTemplates ? 'Masquer les modèles' : 'Choisir un modèle de message'}
                </button>

                {showTemplates && (
                  <div className="mt-3 border border-pink-200 rounded-xl bg-pink-50 p-4 space-y-5">
                    <p className="text-xs text-pink-700 bg-pink-100 border border-pink-200 rounded-lg px-3 py-2">
                      💡 <strong>Stratégie</strong> : les messages qui convertissent le mieux ne parlent pas de promotion. Ils créent une relation, donnent un conseil utile, ou font se sentir privilégiée. La vente vient naturellement.
                    </p>
                    {TEMPLATE_BANK.map(cat => (
                      <div key={cat.category}>
                        <div className="mb-2">
                          <p className="text-xs font-bold text-pink-800 uppercase tracking-wide">{cat.icon} {cat.category}</p>
                          <p className="text-[11px] text-pink-600">{cat.description}</p>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {cat.templates.map(t => (
                            <button
                              key={t.label}
                              onClick={() => applyTemplate(t)}
                              className="text-left bg-white border border-pink-200 hover:border-pink-400 rounded-lg p-3 transition-all hover:shadow-sm"
                            >
                              <div className="flex items-center justify-between mb-1.5">
                                <span className="text-xs font-semibold text-foreground">{t.label}</span>
                                <span className={`text-[10px] px-1.5 py-0.5 rounded-full border shrink-0 ml-1 ${t.channel === 'sms' ? 'bg-blue-50 text-blue-600 border-blue-200' : t.channel === 'email' ? 'bg-purple-50 text-purple-600 border-purple-200' : 'bg-gray-50 text-gray-500 border-gray-200'}`}>
                                  {t.channel === 'sms' ? '📱 SMS' : t.channel === 'email' ? '✉️ Email' : '📱+✉️'}
                                </span>
                              </div>
                              {t.subject && (
                                <p className="text-[10px] text-purple-600 bg-purple-50 rounded px-1.5 py-0.5 mb-1.5 font-medium">Sujet : {t.subject}</p>
                              )}
                              <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">{t.message.split('\n').filter(Boolean)[0]}</p>
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Result feedback */}
              {sendResult && (
                <div className={`rounded-lg p-3 text-sm ${
                  sendResult.ok
                    ? (sendResult.erreurs ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-green-50 text-green-700 border border-green-200')
                    : 'bg-red-50 text-red-700 border border-red-200'
                }`}>
                  {sendResult.ok ? (
                    <div className="space-y-1">
                      <p className="font-medium">
                        {sendResult.erreurs ? '⚠️' : '✅'} Campagne envoyée — {sendResult.envoyes} cliente{(sendResult.envoyes ?? 0) > 1 ? 's' : ''} atteinte{(sendResult.envoyes ?? 0) > 1 ? 's' : ''}
                        {sendResult.erreurs ? ` · ${sendResult.erreurs} sans canal valide` : ''}
                      </p>
                      <div className="flex gap-3 text-xs opacity-80">
                        {sendResult.smsSent !== undefined && <span>📱 {sendResult.smsSent} SMS</span>}
                        {sendResult.emailSent !== undefined && <span>✉️ {sendResult.emailSent} emails</span>}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <p className="font-medium">❌ {sendResult.error}</p>
                      {sendResult.errorSample && (
                        <p className="text-xs opacity-80">Raison : {sendResult.errorSample}</p>
                      )}
                      <p className="text-xs opacity-70 mt-1">Votre campagne a été sauvegardée. Corrigez les infos et relancez.</p>
                    </div>
                  )}
                </div>
              )}

              <button
                onClick={handleCreate}
                disabled={creating || !canSend}
                className="w-full bg-pink-500 hover:bg-pink-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-2.5 rounded-lg text-sm transition-colors"
              >
                {creating ? (sendingId ? '📤 Envoi en cours...' : '⏳ Création...') : '📤 Créer et envoyer'}
              </button>
            </div>
          </div>

          {/* Right column */}
          <div className="space-y-4">
            {/* Aperçu */}
            <div className="bg-white border border-border rounded-xl p-5">
              <h3 className="font-semibold text-foreground mb-3">
                {selectionMode === 'manual' ? 'Sélection manuelle' : 'Aperçu du segment'}
              </h3>

              {selectionMode === 'manual' ? (
                <div className="bg-pink-50 border border-pink-200 rounded-lg p-3 text-center">
                  <p className="text-3xl font-bold text-pink-600">{selectedClients.length}</p>
                  <p className="text-xs text-pink-700">cliente{selectedClients.length !== 1 ? 's' : ''} sélectionnée{selectedClients.length !== 1 ? 's' : ''}</p>
                  {selectedClients.length === 0 && (
                    <p className="text-xs text-muted-foreground mt-2">Recherchez et ajoutez des clientes ci-contre</p>
                  )}
                </div>
              ) : segmentLoading ? (
                <div className="text-center py-6 text-muted-foreground text-sm">Chargement...</div>
              ) : segmentPreview ? (
                <>
                  <div className="bg-pink-50 border border-pink-200 rounded-lg p-3 text-center mb-4">
                    <p className="text-3xl font-bold text-pink-600">{segmentPreview.count}</p>
                    <p className="text-xs text-pink-700">clientes dans ce segment</p>
                  </div>
                  {(segmentPreview.preview?.length ?? 0) > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Exemples</p>
                      {(segmentPreview.preview ?? []).map(c => (
                        <div key={c.id} className="flex items-center gap-2 text-sm">
                          <div className="w-7 h-7 rounded-full bg-pink-100 flex items-center justify-center text-pink-600 text-xs font-bold shrink-0">
                            {(c.name[0] || '?').toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate font-medium">{c.name || 'Cliente'}</p>
                            <p className="text-xs text-muted-foreground">{c.phone}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : null}
            </div>

            {/* Segments quick view — only in segment mode */}
            {selectionMode === 'segment' && (
              <div className="bg-white border border-border rounded-xl p-5">
                <h3 className="font-semibold text-foreground mb-3">Tous les segments</h3>
                <div className="space-y-1.5">
                  {SEGMENTS.map(s => (
                    <button
                      key={s.key}
                      onClick={() => setSegment(s.key)}
                      className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-sm transition-colors ${segment === s.key ? 'bg-pink-50 text-pink-700' : 'hover:bg-muted text-foreground'}`}
                    >
                      <span>{s.icon} {s.label}</span>
                      <span className="font-mono text-xs font-bold">{stats?.segmentStats[s.key] ?? '—'}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TAB: Séquences ── */}
      {activeTab === 'sequences' && (
        <div className="space-y-5">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
            <p className="font-semibold mb-1">⚠️ Règles d'envoi — À respecter obligatoirement</p>
            <ul className="list-disc list-inside space-y-0.5 text-xs">
              <li>Maximum 1 message commercial par semaine par cliente (tous canaux confondus)</li>
              <li>Les messages de service (confirmation commande, colis prêt) ne comptent pas</li>
              <li>Toujours tester sur ta propre fiche avant d'envoyer à de vraies clientes</li>
              <li>Jamais de fausse urgence — seulement les vraies limitations de stock ou places</li>
              <li>Pour le guide : "Résultats variables selon les personnes" obligatoire</li>
              <li>Livraisons France : toujours mentionner "Frais de douane possibles"</li>
            </ul>
          </div>

          {TEMPLATE_BANK.filter(cat => cat.sequence).map(cat => (
            <div key={cat.category} className="bg-white border border-border rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-border bg-muted/30 flex items-center justify-between">
                <div>
                  <span className="font-semibold text-foreground">{cat.icon} {cat.category}</span>
                  <p className="text-xs text-muted-foreground mt-0.5">{cat.description}</p>
                </div>
                <span className="text-xs bg-pink-100 text-pink-700 border border-pink-200 rounded-full px-3 py-1 font-medium">{cat.templates.length} message{cat.templates.length > 1 ? 's' : ''}</span>
              </div>
              <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {cat.templates.map(t => {
                  const segInfo = SEGMENTS.find(s => s.key === t.segment);
                  return (
                    <div key={t.label} className="border border-border rounded-lg p-3 hover:border-pink-300 transition-colors">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <span className="text-xs font-semibold text-foreground leading-tight">{t.label}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full border shrink-0 ${t.channel === 'sms' ? 'bg-blue-50 text-blue-600 border-blue-200' : t.channel === 'email' ? 'bg-purple-50 text-purple-600 border-purple-200' : 'bg-gray-50 text-gray-500 border-gray-200'}`}>
                          {t.channel === 'sms' ? '📱' : t.channel === 'email' ? '✉️' : '📱+✉️'}
                        </span>
                      </div>
                      {t.subject && (
                        <p className="text-[10px] text-purple-600 bg-purple-50 rounded px-1.5 py-0.5 mb-1.5">Sujet : {t.subject}</p>
                      )}
                      <p className="text-[10px] text-muted-foreground bg-muted rounded px-1.5 py-0.5 mb-2">
                        {segInfo ? `${segInfo.icon} ${segInfo.label}` : t.segment}
                      </p>
                      <p className="text-[11px] text-muted-foreground line-clamp-2 mb-3">{t.message.split('\n').filter(Boolean)[0]}</p>
                      <button
                        onClick={() => { applyTemplate(t); setActiveTab('creer'); }}
                        className="w-full text-xs bg-pink-500 hover:bg-pink-600 text-white rounded-lg py-1.5 transition-colors font-medium"
                      >
                        Utiliser ce modèle
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── TAB: Historique ── */}
      {activeTab === 'historique' && (
        <div className="bg-white border border-border rounded-xl overflow-hidden">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <h2 className="font-semibold text-foreground">Historique des campagnes</h2>
            <button onClick={loadStats} className="text-xs text-muted-foreground hover:text-foreground border border-border rounded-lg px-3 py-1.5">
              Actualiser
            </button>
          </div>

          {statsLoading ? (
            <div className="text-center py-12 text-muted-foreground">Chargement...</div>
          ) : !stats?.campaigns?.length ? (
            <div className="text-center py-12 text-muted-foreground">
              <p className="text-4xl mb-3">📭</p>
              <p>Aucune campagne envoyée</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    {['Campagne', 'Segment / Sélection', 'Statut', 'Clientes', 'Envoyés', 'Erreurs', 'Date', 'Actions'].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {stats.campaigns.map(c => {
                    const st = STATUT_LABELS[c.statut] ?? STATUT_LABELS['brouillon'];
                    return (
                      <tr key={c.id} className="hover:bg-muted/30">
                        <td className="px-4 py-3 font-medium">{c.nom.split('|||')[0]}</td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">{segmentDisplay(c.segment)}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${st.color}`}>{st.label}</span>
                        </td>
                        <td className="px-4 py-3 text-center tabular-nums">{c.total_clients}</td>
                        <td className="px-4 py-3 text-center tabular-nums text-green-600 font-medium">{c.envoyes}</td>
                        <td className="px-4 py-3 text-center tabular-nums text-red-500">{c.erreurs}</td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">{c.sent_at ? fmtDate(c.sent_at) : fmtDate(c.created_at)}</td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => handleResend(c.id)}
                            disabled={!!sendingId || c.statut === 'en_cours'}
                            className="text-xs border border-border rounded-lg px-2.5 py-1 hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            {sendingId === c.id ? '⏳' : '🔄 Renvoyer'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {sendResult && (
            <div className={`m-4 rounded-lg p-3 text-sm ${sendResult.ok ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
              {sendResult.ok ? (
                <div className="space-y-1">
                  <p className="font-medium">✅ {sendResult.envoyes} clientes atteintes{sendResult.erreurs ? ` · ${sendResult.erreurs} sans canal valide` : ''}</p>
                  <div className="flex gap-3 text-xs opacity-80">
                    {sendResult.smsSent !== undefined && <span>📱 {sendResult.smsSent} SMS</span>}
                    {sendResult.emailSent !== undefined && <span>✉️ {sendResult.emailSent} emails</span>}
                  </div>
                </div>
              ) : (
                <div>
                  <p className="font-medium">❌ {sendResult.error}</p>
                  {sendResult.errorSample && <p className="text-xs opacity-80 mt-0.5">Raison : {sendResult.errorSample}</p>}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── TAB: Analyse IA ── */}
      {activeTab === 'ia' && (
        <div className="space-y-5">
          <div className="bg-white border border-border rounded-xl p-5">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="font-semibold text-foreground">Stratégie Marketing IA</h2>
                <p className="text-sm text-muted-foreground mt-1">Analyse de vos segments et recommandations personnalisées</p>
              </div>
              <button
                onClick={handleAiStrategy}
                disabled={aiLoading}
                className="bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
              >
                {aiLoading ? '⏳ Analyse...' : '🤖 Générer la stratégie'}
              </button>
            </div>

            {!aiStrategy && !aiLoading && (
              <div className="text-center py-12 text-muted-foreground">
                <p className="text-5xl mb-4">🤖</p>
                <p className="font-medium">Cliquez sur "Générer la stratégie" pour obtenir une analyse IA de votre base clientes</p>
                <p className="text-xs mt-2">Basée sur vos {stats?.segmentStats['tous'] ?? 0} clientes et leurs comportements d'achat</p>
              </div>
            )}

            {aiLoading && (
              <div className="text-center py-12 text-muted-foreground">
                <div className="w-10 h-10 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                <p>Analyse de vos données en cours...</p>
              </div>
            )}

            {aiStrategy && (
              <div className="space-y-5">
                {aiMock && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-700">
                    ⚠️ Stratégie de démonstration — Configurez <code className="bg-amber-100 px-1 rounded">ANTHROPIC_API_KEY</code> pour des analyses IA personnalisées
                  </div>
                )}
                <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                  <h3 className="font-semibold text-purple-800 mb-1">📊 Résumé</h3>
                  <p className="text-sm text-purple-700">{aiStrategy.resume}</p>
                </div>
                <div className="bg-pink-50 border border-pink-200 rounded-lg p-4">
                  <h3 className="font-semibold text-pink-800 mb-1">💡 Conseil principal</h3>
                  <p className="text-sm text-pink-700">{aiStrategy.conseil_principal}</p>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: "Taux d'ouverture", value: aiStrategy.kpi_cibles?.taux_ouverture },
                    { label: 'Taux de conversion', value: aiStrategy.kpi_cibles?.taux_conversion },
                    { label: 'CA additionnel estimé', value: aiStrategy.kpi_cibles?.ca_additionnel_estime },
                  ].map(k => (
                    <div key={k.label} className="bg-white border border-border rounded-lg p-3 text-center">
                      <p className="text-xl font-bold text-foreground">{k.value ?? '—'}</p>
                      <p className="text-xs text-muted-foreground">{k.label}</p>
                    </div>
                  ))}
                </div>
                {aiStrategy.segments_prioritaires?.length > 0 && (
                  <div>
                    <h3 className="font-semibold text-foreground mb-3">🎯 Segments prioritaires</h3>
                    <div className="space-y-3">
                      {aiStrategy.segments_prioritaires.map((sp, i) => {
                        const seg = SEGMENTS.find(s => s.key === sp.segment);
                        return (
                          <div key={i} className="bg-white border border-border rounded-lg p-4">
                            <div className="flex items-start gap-3">
                              <span className="text-2xl">{seg?.icon ?? '📌'}</span>
                              <div className="flex-1">
                                <p className="font-medium text-foreground">{seg?.label ?? sp.segment}</p>
                                <p className="text-sm text-muted-foreground mt-0.5">{sp.raison}</p>
                                <div className="mt-2 bg-green-50 border border-green-200 rounded-md px-3 py-1.5">
                                  <p className="text-sm text-green-700">✅ {sp.action}</p>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                {aiStrategy.messages_suggeres?.length > 0 && (
                  <div>
                    <h3 className="font-semibold text-foreground mb-3">💬 Messages suggérés</h3>
                    <div className="space-y-3">
                      {aiStrategy.messages_suggeres.map((ms, i) => {
                        const seg = SEGMENTS.find(s => s.key === ms.segment);
                        return (
                          <div key={i} className="bg-white border border-border rounded-lg p-4">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-sm font-medium text-foreground">
                                {seg ? `${seg.icon} ${seg.label}` : ms.segment}
                              </span>
                              <button
                                onClick={() => { setSegment((ms.segment as SegmentKey) || 'tous'); setMessage(ms.message); setActiveTab('creer'); }}
                                className="text-xs bg-pink-500 text-white px-3 py-1 rounded-lg hover:bg-pink-600 transition-colors"
                              >
                                Utiliser ce message
                              </button>
                            </div>
                            <p className="text-sm text-muted-foreground whitespace-pre-wrap font-mono bg-muted rounded-md p-3">{ms.message}</p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                {aiStrategy.calendrier?.length > 0 && (
                  <div>
                    <h3 className="font-semibold text-foreground mb-3">📅 Calendrier recommandé</h3>
                    <div className="space-y-2">
                      {aiStrategy.calendrier.map((cal, i) => (
                        <div key={i} className="flex items-start gap-3 bg-white border border-border rounded-lg p-3">
                          <span className="w-16 shrink-0 text-xs font-bold text-purple-600 bg-purple-50 rounded-md px-2 py-1 text-center">S{cal.semaine}</span>
                          <p className="text-sm text-foreground">{cal.action}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
