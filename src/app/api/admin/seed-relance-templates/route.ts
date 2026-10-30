import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

const TEMPLATES = [
  // ── Séquence A : Invitation à la fiche ──────────────────────────────────
  {
    sequence: 'A', etape: 'j1', canal: 'whatsapp', delai_jours: 0,
    sujet: null, apercu: null,
    corps: `Coucou {prénom}, c'est Christy de chez LMDE. J'ai eu mes propres salons pendant des années, je sais ce que c'est de manquer d'un flacon un samedi matin. On vient de créer Ma fiche réassort : tu me dis ce que tu utilises, on te prépare ta commande du mois. Tu as 10 minutes cette semaine pour qu'on en parle ?`,
  },
  {
    sequence: 'A', etape: 'j3', canal: 'mail', delai_jours: 2,
    sujet: `{prénom}, un conseil avant tout`,
    apercu: `Et une idée pour que tu ne manques plus jamais de rien.`,
    corps: `Coucou {prénom},

Je t'écris du fond de la boutique, avec un café qui refroidit à côté de moi, comme d'habitude.

Je voulais te donner un conseil avant de te demander quoi que ce soit : {conseil}

Je te le dis parce que j'ai été à ta place. J'ai eu mes salons, mes bars à ongles, des clientes qui arrivent à 9 h, et ce flacon qui est vide pile quand il ne fallait pas. Ce stress-là, je ne veux plus que tu le vives.

C'est pour ça que j'ai créé Ma fiche réassort. Ce n'est pas un devis, ce n'est pas un contrat. C'est un service : tu me dis ce que tu utilises dans ton mois, et on te prépare ta commande avant que tu en aies besoin. La livraison est offerte dès 150 €.

Ça te prend 10 minutes avec moi ou avec l'équipe. Réponds simplement à ce mail ou écris-moi sur WhatsApp, et on s'en occupe ensemble.

Je suis fière de ce que tu construis, vraiment.

Christy
LMDE, Le Monde de l'Esthétique`,
  },
  {
    sequence: 'A', etape: 'j7', canal: 'whatsapp', delai_jours: 6,
    sujet: null, apercu: null,
    corps: `{prénom}, une seule question : quel produit te manque le plus souvent au mauvais moment ? Réponds-moi juste par un mot, je m'occupe du reste.`,
  },
  {
    sequence: 'A', etape: 'j14', canal: 'mail', delai_jours: 13,
    sujet: `Je ne veux pas t'envahir`,
    apercu: `La porte reste ouverte.`,
    corps: `Coucou {prénom},

Je ne veux pas être celle qui insiste. Je sais que tes journées sont pleines, et que tu as déjà trop de messages.

Alors je te dis simplement ceci : si ce n'est pas le bon moment, aucun souci. Ta fiche réassort sera là quand tu en auras envie, et je serai là aussi.

Le jour où tu en as marre de compter tes stocks, de courir après un produit ou de payer un envoi en urgence, écris-moi un seul mot : FICHE. Je m'occupe du reste.

Prends soin de toi et de tes clientes.

Christy`,
  },

  // ── Séquence B : Fiche envoyée, pas validée ─────────────────────────────
  {
    sequence: 'B', etape: 'j2', canal: 'whatsapp', delai_jours: 1,
    sujet: null, apercu: null,
    corps: `Coucou {prénom}, tu as pu voir ta fiche réassort ? Si quelque chose ne va pas, dis-le-moi, je la modifie avec toi en deux minutes.`,
  },
  {
    sequence: 'B', etape: 'j5', canal: 'mail', delai_jours: 4,
    sujet: `Ta fiche t'attend, {prénom}`,
    apercu: `Un clic pour valider, ou dis-moi ce que tu changes.`,
    corps: `Coucou {prénom},

Petit conseil du jour : {conseil}

Et ta fiche réassort est toujours là, prête pour toi. Elle contient {produits}, d'après ce que tu m'as dit.

Tu peux la valider en un clic ici : {lien_fiche}
Si quelque chose ne te va pas, dis-le-moi sans gêne. C'est ta fiche, pas la mienne. On la refait ensemble autant de fois qu'il faut.

Christy`,
  },
  {
    sequence: 'B', etape: 'j10', canal: 'whatsapp', delai_jours: 9,
    sujet: null, apercu: null,
    corps: `{prénom}, dernier petit mot de ma part : ta fiche reste prête quand tu voudras. Si tu préfères qu'on en parle de vive voix, dis-moi quand je peux t'appeler.`,
  },

  // ── Séquence C : Réassort mensuel (relatif à date_reassort) ─────────────
  {
    sequence: 'C', etape: 'j_moins_7', canal: 'mail', delai_jours: -7,
    sujet: `{prénom}, ta fiche du mois est prête`,
    apercu: `Tu ne manqueras de rien.`,
    corps: `Coucou {prénom},

Ton mois est déjà préparé. Voici ce qu'on a prévu pour toi : {produits}, soit {montant} au total. La livraison est offerte dès 150 €.

Petit conseil au passage : {conseil}

Si quelque chose a changé dans ton mois (une nouvelle prestation, une cliente en plus, un produit en trop), dis-le-moi. Sinon, je prépare tout pour le {date}.

C'est ça qui me fait plaisir dans ce métier : savoir que ton institut tourne sans que tu aies à y penser.

Christy`,
  },
  {
    sequence: 'C', etape: 'j_moins_5', canal: 'whatsapp', delai_jours: -5,
    sujet: null, apercu: null,
    corps: `{prénom}, tu as vu ta fiche du mois ? Si tout te va, tu n'as rien à faire. Sinon, dis-moi ce qu'on change.`,
  },
  {
    sequence: 'C', etape: 'j_moins_3', canal: 'whatsapp', delai_jours: -3,
    sujet: null, apercu: null,
    corps: `{prénom}, ton réassort part dans trois jours. Il te manque quelque chose pour ce mois ? Une couleur, un produit à tester ? Dis-le-moi maintenant.`,
  },
  {
    sequence: 'C', etape: 'j_0', canal: 'whatsapp', delai_jours: 0,
    sujet: null, apercu: null,
    corps: `{prénom}, ta commande est prête ! Tu la récupères en boutique ou on te l'envoie ? Merci pour ta confiance, ça compte beaucoup pour moi.`,
  },
  {
    sequence: 'C', etape: 'j_plus_3', canal: 'mail', delai_jours: 3,
    sujet: `Tout est bien arrivé, {prénom} ?`,
    apercu: `Un petit conseil pour bien utiliser tes produits.`,
    corps: `Coucou {prénom},

J'espère que ta commande est bien arrivée et que tout est en ordre.

Petit conseil pour bien utiliser ce que tu as reçu : {conseil}

Si tu as la moindre question, un geste qui te bloque ou un produit que tu ne sais pas comment poser, écris-moi. Je suis passée par là, je te réponds comme je me répondrais à moi-même.

Christy`,
  },
  {
    sequence: 'C', etape: 'j_plus_15', canal: 'mail', delai_jours: 15,
    sujet: `Le geste que presque personne ne t'a appris`,
    apercu: `Ça change tout dans la tenue.`,
    corps: `Coucou {prénom},

Je pense à ce que tu utilises dans ton institut, et je voulais partager avec toi quelque chose qui m'a fait gagner énormément de temps : {conseil}

Rien à acheter ici, juste un partage entre nous. Si ça t'aide, tu me fais plaisir en me le disant.

À très vite,
Christy`,
  },
  {
    sequence: 'C', etape: 'j_plus_25', canal: 'whatsapp', delai_jours: 25,
    sujet: null, apercu: null,
    corps: `{prénom}, comment s'est passé ton mois ? Qu'est-ce qui a changé dans ton institut ? On ajuste ta fiche pour le prochain réassort.`,
  },

  // ── Séquence D : Cliente dormante ────────────────────────────────────────
  {
    sequence: 'D', etape: 'j60', canal: 'whatsapp', delai_jours: 60,
    sujet: null, apercu: null,
    corps: `{prénom}, je pensais à toi. Ça fait un moment, comment va ton activité ? Qu'est-ce qui a changé de ton côté ?`,
  },
  {
    sequence: 'D', etape: 'j75', canal: 'mail', delai_jours: 75,
    sujet: `Je pensais à toi, {prénom}`,
    apercu: `Pas pour te vendre quelque chose.`,
    corps: `Coucou {prénom},

Je t'écris sans rien te vendre.

Ça fait un moment que je n'ai pas de tes nouvelles, et je me demande comment tu vas. Ton activité a peut-être changé, tu as peut-être traversé une période compliquée, ou tu as simplement eu moins de temps. Tout ça est normal.

Ta fiche est toujours là. Si tu as besoin d'un coup de main, une rupture, une question sur un produit, un conseil, écris-moi. Je te réponds vite.

Et si tu as juste envie de me dire comment ça va, ça me fera plaisir aussi.

Christy`,
  },
  {
    sequence: 'D', etape: 'j90', canal: 'whatsapp', delai_jours: 90,
    sujet: null, apercu: null,
    corps: `{prénom}, dernier message de ma part pour l'instant. Si ton activité a changé, dis-moi ce dont tu as besoin aujourd'hui, on refait ta fiche ensemble. Je te souhaite le meilleur.`,
  },

  // ── Séquence E : Après livre ou formation ────────────────────────────────
  {
    sequence: 'E', etape: 'j1', canal: 'mail', delai_jours: 0,
    sujet: `Bienvenue, {prénom}`,
    apercu: `Ton {produit} est à toi.`,
    corps: `Coucou {prénom},

Merci d'avoir fait le premier pas. Ton {produit} est à toi, et c'est un vrai plaisir de t'accompagner.

Commence par la première page ou la première vidéo, sans te mettre la pression. Tu verras vite la différence dans tes gestes.

J'ai écrit ça pour toi, parce que quand j'ai commencé, personne ne m'a appris ça simplement. Je veux que tu aies ce que j'aurais voulu avoir.

Christy`,
  },
  {
    sequence: 'E', etape: 'j7', canal: 'whatsapp', delai_jours: 6,
    sujet: null, apercu: null,
    corps: `{prénom}, comment ça se passe avec {produit} ? Un geste, une page ou une pose te bloque ? Dis-le-moi, je te réponds.`,
  },
  {
    sequence: 'E', etape: 'j14', canal: 'mail', delai_jours: 13,
    sujet: `La suite, quand tu seras prête`,
    apercu: `Un kit pensé pour ce que tu viens d'apprendre.`,
    corps: `Coucou {prénom},

Ça tient mieux depuis que tu as appris le geste ? J'espère que oui.

Si tu veux aller plus loin, je peux te préparer le kit adapté, avec exactement ce qu'il te faut pour appliquer ce que tu as appris, sans acheter en trop. Réponds simplement « KIT » et je m'en occupe.

Christy`,
  },
];

export async function POST() {
  const supabase = createAdminClient();

  // Upsert: on sequence+etape unique key
  const { data, error } = await supabase
    .from('relance_templates')
    .upsert(TEMPLATES, { onConflict: 'sequence,etape' })
    .select('id');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ inserted: data?.length ?? 0, total: TEMPLATES.length });
}
