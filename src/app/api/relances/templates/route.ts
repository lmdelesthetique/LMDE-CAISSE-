import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET() {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('relance_templates')
    .select('*')
    .order('sequence', { ascending: true })
    .order('delai_jours', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ templates: data ?? [] });
}

// POST — seed default templates (only if table is empty)
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const force = body.force === true;
  const supabase = createAdminClient();

  // Check if already populated
  if (!force) {
    const { count } = await supabase.from('relance_templates').select('id', { count: 'exact', head: true });
    if ((count ?? 0) > 0) return NextResponse.json({ skipped: true, message: 'Templates déjà présents' });
  }

  const now = new Date().toISOString();
  const templates = [
    // ── Séquence A : Invitation fiche ──────────────────────────────────────────
    { sequence: 'A', etape: 'j1',  canal: 'whatsapp', delai_jours: 1,  sujet: null, apercu: null, actif: true,
      corps: `Bonjour {prénom} 🌸\n\nMerci pour votre visite chez Le Monde de l'Esthétique !\n\nPour bénéficier de nos offres exclusives et de votre programme fidélité, créez votre fiche client ici 👇\n{lien_fiche}\n\nÀ très bientôt 💖\n— LMDE` },
    { sequence: 'A', etape: 'j3',  canal: 'mail',     delai_jours: 3,  sujet: 'Votre espace client LMDE vous attend 🌸', apercu: 'Accédez à vos avantages exclusifs', actif: true,
      corps: `Bonjour {prénom},\n\nVous n'avez pas encore créé votre fiche client. C'est rapide et vous permet de :\n• Suivre vos achats\n• Accéder à votre programme fidélité\n• Recevoir nos offres en avant-première\n\nCréer ma fiche : {lien_fiche}\n\nÀ bientôt,\nL'équipe LMDE` },
    { sequence: 'A', etape: 'j7',  canal: 'whatsapp', delai_jours: 7,  sujet: null, apercu: null, actif: true,
      corps: `Bonjour {prénom} 💅\n\nDernière chance pour créer votre fiche client et profiter de vos avantages fidélité !\n\n{lien_fiche}\n\nOn compte sur vous 😊\n— LMDE` },

    // ── Séquence B : Fiche non validée ─────────────────────────────────────────
    { sequence: 'B', etape: 'j3',  canal: 'whatsapp', delai_jours: 3,  sujet: null, apercu: null, actif: true,
      corps: `Bonjour {prénom} 🌸\n\nNous avons préparé votre fiche client mais elle n'a pas encore été validée.\n\nRetrouvez-la ici : {lien_fiche}\n\nDes questions ? Répondez directement à ce message 😊\n— LMDE` },
    { sequence: 'B', etape: 'j7',  canal: 'mail',     delai_jours: 7,  sujet: 'Votre fiche client attend votre validation', apercu: 'Validez pour accéder à vos avantages', actif: true,
      corps: `Bonjour {prénom},\n\nVotre fiche client LMDE est prête mais n'a pas encore été validée.\n\nAccédez à votre espace : {lien_fiche}\n\nEn validant votre fiche vous bénéficiez immédiatement de votre programme fidélité.\n\nCordialement,\nL'équipe LMDE` },

    // ── Séquence C : Réassort mensuel ──────────────────────────────────────────
    { sequence: 'C', etape: 'j_moins_7', canal: 'whatsapp', delai_jours: -7,  sujet: null, apercu: null, actif: true,
      corps: `Bonjour {prénom} 🌸\n\nVotre commande habituelle arrive bientôt ! Pensez à passer votre commande de réassort avant le {date}.\n\n{produits}\n\nRépondez à ce message ou contactez-nous pour confirmer 😊\n— LMDE` },
    { sequence: 'C', etape: 'j_0',       canal: 'whatsapp', delai_jours: 0,   sujet: null, apercu: null, actif: true,
      corps: `Bonjour {prénom} 💅\n\nC'est le moment de votre réassort mensuel ! Vos produits habituels vous attendent :\n\n{produits}\n\nMontant habituel : {montant} €\n\nConfirmez votre commande en répondant "OUI" ou appelez-nous 📞\n— LMDE` },
    { sequence: 'C', etape: 'j_plus_3',  canal: 'mail',     delai_jours: 3,   sujet: 'Votre commande de réassort LMDE', apercu: 'Vos produits sont disponibles', actif: true,
      corps: `Bonjour {prénom},\n\nNous n'avons pas encore reçu votre commande de réassort.\n\nVos produits habituels :\n{produits}\n\nTotal estimé : {montant} €\n\nCommandez en ligne ou contactez-nous directement.\n\nCordialement,\nL'équipe LMDE` },
    { sequence: 'C', etape: 'j_plus_15', canal: 'whatsapp', delai_jours: 15,  sujet: null, apercu: null, actif: true,
      corps: `Bonjour {prénom} ✨\n\nOn espère que vous allez bien ! Votre réassort {date} n'a pas été passé. Nous sommes disponibles si vous avez besoin d'aide ou si votre commande a changé 😊\n— LMDE` },

    // ── Séquence D : Dormante (cliente inactive) ────────────────────────────────
    { sequence: 'D', etape: 'j60', canal: 'whatsapp', delai_jours: 60,  sujet: null, apercu: null, actif: true,
      corps: `Bonjour {prénom} 🌸\n\nCela fait un moment qu'on ne vous a pas vue ! Vous nous manquez ☺️\n\n{conseil}\n\nN'hésitez pas à passer nous voir ou à nous écrire. On sera ravies de vous retrouver !\n— LMDE` },
    { sequence: 'D', etape: 'j75', canal: 'mail',     delai_jours: 75,  sujet: 'On pensait à vous 🌸', apercu: 'Une surprise vous attend', actif: true,
      corps: `Bonjour {prénom},\n\nCela fait quelque temps que nous n'avons pas eu le plaisir de vous accueillir.\n\n{conseil}\n\nNous avons de nouveaux produits qui pourraient vous plaire. Venez découvrir nos nouveautés !\n\nÀ très bientôt,\nL'équipe LMDE` },
    { sequence: 'D', etape: 'j90', canal: 'whatsapp', delai_jours: 90,  sujet: null, apercu: null, actif: true,
      corps: `Bonjour {prénom} 💖\n\nUne petite pensée pour vous ! Avez-vous besoin de renouveler vos produits ?\n\n{conseil}\n\nOn est là pour vous accompagner 😊\n— LMDE` },

    // ── Séquence E : Après achat ────────────────────────────────────────────────
    { sequence: 'E', etape: 'j1',  canal: 'whatsapp', delai_jours: 1,  sujet: null, apercu: null, actif: true,
      corps: `Bonjour {prénom} 🌸\n\nMerci pour votre achat hier ! On espère que vous êtes ravie de vos nouveaux produits ✨\n\nSi vous avez des questions sur leur utilisation, n'hésitez pas à nous écrire 😊\n— LMDE` },
    { sequence: 'E', etape: 'j3',  canal: 'mail',     delai_jours: 3,  sujet: 'Comment se passent vos nouveaux produits ? 🌸', apercu: 'On aimerait avoir votre avis', actif: true,
      corps: `Bonjour {prénom},\n\nNous espérons que vous êtes satisfaite de votre achat !\n\n{conseil}\n\nN'hésitez pas à nous laisser votre avis — c'est précieux pour nous et pour nos clientes.\n\nÀ bientôt,\nL'équipe LMDE` },
    { sequence: 'E', etape: 'j14', canal: 'whatsapp', delai_jours: 14, sujet: null, apercu: null, actif: true,
      corps: `Bonjour {prénom} 💅\n\nCela fait 2 semaines depuis votre dernier achat. Avez-vous pensé à renouveler certains produits ?\n\n{produits}\n\nOn est là si vous avez besoin de conseils 😊\n— LMDE` },
  ].map((t) => ({ ...t, id: crypto.randomUUID(), created_at: now, updated_at: now }));

  if (force) {
    await supabase.from('relance_templates').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  }

  const { error } = await supabase.from('relance_templates').insert(templates);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, count: templates.length });
}

export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { id, sujet, apercu, corps, actif } = body;
  if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 });

  const supabase = createAdminClient();
  const update: any = { updated_at: new Date().toISOString() };
  if (sujet !== undefined) update.sujet = sujet;
  if (apercu !== undefined) update.apercu = apercu;
  if (corps !== undefined) update.corps = corps;
  if (actif !== undefined) update.actif = actif;

  const { error } = await supabase
    .from('relance_templates')
    .update(update)
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
