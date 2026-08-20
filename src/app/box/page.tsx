'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

// ─── Data ─────────────────────────────────────────────────────────────────────

const STRIPE_LINKS: Record<string, string> = {
  starter: 'https://buy.stripe.com/14A4gAdjtgy3cb89pJ7IY06',
  pro: 'https://buy.stripe.com/aFa28sdjt95B2Ay45p7IY08',
  elite: 'https://buy.stripe.com/6oUdRaa7h3Lh8YWeK37IY07',
};

const PLANS = {
  starter: { name: 'Starter', price: 89, quota: 110, gain: 21, gainYear: 252, livraison: false },
  pro: { name: 'Pro', price: 149, quota: 200, gain: 51, gainYear: 612, livraison: false, recommended: true },
  elite: { name: 'Elite', price: 229, quota: 320, gain: 91, gainYear: 1092, livraison: true },
} as const;

type PlanKey = keyof typeof PLANS;

const QUESTIONS = [
  {
    q: 'Combien de fois par mois tu commandes tes produits en urgence ?',
    choices: [
      { emoji: '😌', label: 'Jamais', value: 0 },
      { emoji: '😅', label: '1-2 fois', value: 1 },
      { emoji: '😰', label: '3 fois et plus', value: 3 },
    ],
  },
  {
    q: "T'es-tu déjà retrouvée à annuler une cliente par manque de produit ?",
    choices: [
      { emoji: '🙅', label: 'Jamais', value: 0 },
      { emoji: '😬', label: 'Parfois', value: 1 },
      { emoji: '😭', label: "Souvent — c'est ma hantise", value: 2 },
    ],
  },
  {
    q: "Est-ce que ça t'est déjà arrivé de courir chez ton fournisseur en urgence... et d'arriver là-bas pour constater qu'il n'a plus le produit dont tu as besoin ?",
    choices: [
      { emoji: '😅', label: "Non jamais — j'anticipe toujours", value: 0 },
      { emoji: '😬', label: "Oui une fois — c'était stressant", value: 1 },
      { emoji: '😭', label: "Oui plusieurs fois — c'est mon cauchemar", value: 2 },
    ],
  },
  {
    q: "Qu'est-ce qui te stresse le plus dans ton stock ?",
    choices: [
      { emoji: '⚠️', label: 'Les ruptures imprévues', value: 0 },
      { emoji: '💸', label: 'Le budget non maîtrisé', value: 1 },
      { emoji: '⏰', label: 'Le temps perdu à commander', value: 2 },
    ],
  },
  {
    q: 'Combien de clientes par mois ?',
    choices: [
      { emoji: '🌱', label: '5 à 10 clientes', value: 'starter' as PlanKey },
      { emoji: '💪', label: '10 à 20 clientes', value: 'pro' as PlanKey },
      { emoji: '🚀', label: '20 à 35 clientes', value: 'elite' as PlanKey },
    ],
  },
] as const;

const REASSURANCES = [
  "87% des esthéticiennes qui commandent en urgence perdent en moyenne 2 clientes par mois. Ça représente plus de 90€ de chiffre d'affaires chaque mois. 🤯",
  "Tu n'es pas seule. Annuler une cliente coûte en moyenne 45€ de CA perdu, plus le stress et la réputation. La Box Beauté a été créée exactement pour ça.",
  "Tu n'es pas seule. C'est la situation n°1 que vivent les esthéticiennes aux Antilles. Et c'est exactement ce que la Box Beauté LMDE vient résoudre. 💪",
  "Les esthéticiennes qui maîtrisent leur stock gagnent en moyenne 1h par semaine. Soit 52h par an libérées pour ce qui compte vraiment.",
];

// Micro-yes messages after specific answers (questionIdx_value)
const MICRO_YES: Record<string, string> = {
  '0_1': "✅ Même 1 fois par mois coûte en moyenne 25€ de livraison inutile. Continue →",
  '0_3': "✅ C'est le cas de 73% des esthéticiennes aux Antilles. Continue →",
  '1_2': "✅ Chaque cliente annulée = 45 à 90€ perdus. Tu n'es pas seule. Continue →",
  '2_2': "✅ Ce moment existe parce que personne n'avait créé la bonne solution. Jusqu'à maintenant. Continue →",
};
const MICRO_YES_Q4 = "✅ Tu as identifié ton problème principal. La Box est faite pour ça. Continue →";

// Social proof messages for result page
const SOCIAL_PROOF = [
  "👁 Marlène de Guadeloupe vient de rejoindre · il y a 3 minutes",
  "👁 Sandra de Martinique vient de composer sa box · il y a 7 minutes",
  "👁 Priya de Saint-Martin vient de valider son abonnement · il y a 12 minutes",
];

const ISLANDS = ['Martinique', 'Guadeloupe', 'Guyane', 'Saint-Martin', 'France métropolitaine', 'Autre'];

const SESSION_KEY = 'client_portal_session';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function calcLosses(answers: Record<number, number>) {
  let deliveryCost = 0;
  let lostClients = 0;
  const urgency = answers[0] ?? 0;
  if (urgency === 1) deliveryCost = 20;
  if (urgency === 3) deliveryCost = 60;
  const cancelled = answers[1] ?? 0;
  if (cancelled === 1) lostClients = 45;
  if (cancelled === 2) lostClients = 135;
  const supplierFail = answers[2] ?? 0;
  if (supplierFail === 1) lostClients += 45;
  if (supplierFail === 2) lostClients += 90;
  return { deliveryCost, lostClients, total: deliveryCost + lostClients };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ProgressBar({ current, total }: { current: number; total: number }) {
  const pct = Math.round(((current + 1) / total) * 100);
  return (
    <div className="mb-6">
      <div className="flex justify-between text-xs text-gray-400 mb-1.5">
        <span>Question {current + 1} / {total}</span>
        <span>{pct}%</span>
      </div>
      <div className="h-1.5 bg-pink-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-pink-400 to-rose-500 rounded-full transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function Brand() {
  return (
    <div className="text-center mb-7">
      <p className="text-[11px] font-semibold text-pink-400 uppercase tracking-widest mb-1">Le Monde de l'Esthétique</p>
      <h1 className="text-xl font-bold text-gray-900">Box Beauté Pro 💅</h1>
    </div>
  );
}

function Avatar({ src, alt }: { src: string; alt: string }) {
  const [err, setErr] = useState(false);
  if (err) {
    return (
      <div className="w-12 h-12 rounded-full border-2 border-pink-300 bg-gradient-to-br from-pink-200 to-rose-300 flex items-center justify-center shrink-0">
        <span className="text-lg">💅</span>
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      onError={() => setErr(true)}
      className="w-12 h-12 rounded-full border-2 border-pink-300 object-cover shrink-0"
    />
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type Step = 'intro' | 'quiz' | 'microyes' | 'reassurance' | 'result' | 'form' | 'loading' | 'credentials';

export default function BoxOnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('intro');
  const [questionIdx, setQuestionIdx] = useState(0);
  const [numericAnswers, setNumericAnswers] = useState<Record<number, number>>({});
  const [recommendedPlan, setRecommendedPlan] = useState<PlanKey>('pro');
  const [reassuranceText, setReassuranceText] = useState('');
  const [animating, setAnimating] = useState(false);

  // New state
  const [microYesText, setMicroYesText] = useState('');
  const [committed, setCommitted] = useState(false);
  const [socialProofIdx, setSocialProofIdx] = useState(0);

  // Fallback credentials shown if auto-login fails
  const [credentials, setCredentials] = useState<{ phone: string; pin: string } | null>(null);

  // Form
  const [form, setForm] = useState({
    firstName: '', lastName: '', email: '', phone: '',
    address: '', island: 'Martinique', plan: 'pro' as PlanKey,
  });
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Redirect already-logged-in subscribers straight to their dashboard
  useEffect(() => {
    try {
      const stored = localStorage.getItem(SESSION_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed?.subscriptionId) router.replace('/client-portal/dashboard');
      }
    } catch {}
  }, [router]);

  // Scroll to top on step change
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'smooth' }); }, [step, questionIdx]);

  // Auto-advance from microyes → reassurance after 1.2s
  useEffect(() => {
    if (step !== 'microyes') return;
    const t = setTimeout(() => setStep('reassurance'), 1200);
    return () => clearTimeout(t);
  }, [step]);

  // Rotate social proof every 8s on result page
  useEffect(() => {
    if (step !== 'result') return;
    const t = setInterval(() => setSocialProofIdx(i => (i + 1) % SOCIAL_PROOF.length), 8000);
    return () => clearInterval(t);
  }, [step]);

  const handleAnswer = (choice: { value: number | PlanKey }) => {
    if (animating) return;
    setAnimating(true);

    const isLastQ = questionIdx === QUESTIONS.length - 1;

    if (isLastQ) {
      const plan = choice.value as PlanKey;
      setRecommendedPlan(plan);
      setForm((f) => ({ ...f, plan }));
      setAnimating(false);
      setStep('result');
    } else {
      const val = choice.value as number;
      setNumericAnswers((prev) => ({ ...prev, [questionIdx]: val }));
      setReassuranceText(REASSURANCES[questionIdx] ?? '');

      // Check for micro-yes message
      const microMsg = questionIdx === 3 ? MICRO_YES_Q4 : MICRO_YES[`${questionIdx}_${val}`];
      if (microMsg) {
        setMicroYesText(microMsg);
        setAnimating(false);
        setStep('microyes');
      } else {
        setAnimating(false);
        setStep('reassurance');
      }
    }
  };

  const handleNextQuestion = () => {
    setQuestionIdx((q) => q + 1);
    setStep('quiz');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const { firstName, lastName, email, phone } = form;
    if (!firstName.trim() || !lastName.trim() || !email.trim() || !phone.trim()) {
      setFormError('Merci de remplir tous les champs obligatoires.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setFormError('Adresse email invalide.');
      return;
    }
    setFormError('');
    setSubmitting(true);
    setStep('loading');

    try {
      const res = await fetch('/api/box/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erreur lors de l'inscription");

      const supabase = createClient();
      const { data: rows } = await supabase.rpc('verify_client_pin', {
        p_phone: json.phone,
        p_pin: json.pin,
      });
      if (rows && rows.length > 0) {
        const r = rows[0];
        const session = {
          subscriptionId: r.subscription_id,
          clientId: r.client_id,
          clientName: r.client_name,
          planName: r.plan_name,
          planPrice: Number(r.plan_price),
          quotaAmount: Number(r.quota_amount),
          shippingFree: Boolean(r.shipping_free),
          shippingCost: Number(r.shipping_cost),
          launchOffer: Boolean(r.launch_offer),
        };
        localStorage.setItem(SESSION_KEY, JSON.stringify(session));
        router.push('/client-portal/dashboard');
      } else {
        setCredentials({ phone: json.phone, pin: json.pin });
        setStep('credentials');
        setSubmitting(false);
      }
    } catch (err: any) {
      setFormError(err.message);
      setStep('form');
      setSubmitting(false);
    }
  };

  const stripeLink = (() => {
    const base = STRIPE_LINKS[form.plan] ?? STRIPE_LINKS.pro;
    return form.email ? `${base}?prefilled_email=${encodeURIComponent(form.email)}` : base;
  })();

  const losses = calcLosses(numericAnswers);
  const plan = PLANS[recommendedPlan];

  // ── CREDENTIALS FALLBACK ───────────────────────────────────────────────────
  if (step === 'credentials' && credentials) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-rose-50 via-pink-50/30 to-fuchsia-50 flex flex-col items-center justify-center p-5">
        <div className="w-full max-w-md">
          <div className="text-center mb-6">
            <div className="text-5xl mb-3">🎉</div>
            <h2 className="text-2xl font-black text-gray-900">Ton compte est créé !</h2>
            <p className="text-sm text-gray-500 mt-1">Note tes identifiants de connexion</p>
          </div>
          <div className="bg-white rounded-3xl shadow-xl p-6 border border-rose-100 space-y-4">
            <div className="bg-pink-50 rounded-2xl p-4 space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-xs font-semibold text-gray-500">Téléphone</span>
                <span className="text-sm font-bold text-gray-900 font-mono">{credentials.phone}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs font-semibold text-gray-500">Code PIN</span>
                <span className="text-2xl font-black text-pink-600 font-mono tracking-widest">{credentials.pin}</span>
              </div>
            </div>
            <p className="text-xs text-gray-400 text-center">Utilise ces identifiants sur <strong>lmdecaisse.com/client-portal/login</strong></p>
            <div className="space-y-3 pt-2">
              <a
                href={stripeLink}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-4 bg-gradient-to-r from-pink-500 to-rose-500 text-white font-bold rounded-2xl shadow-lg hover:opacity-90 active:scale-[.98] transition-all text-sm flex items-center justify-center gap-2"
              >
                💳 Activer mon abonnement — payer maintenant
              </a>
              <button
                onClick={() => router.push('/client-portal/login')}
                className="w-full py-3 border border-gray-200 text-gray-600 font-medium rounded-2xl text-sm hover:bg-gray-50 transition-colors"
              >
                Se connecter à mon espace
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── LOADING ────────────────────────────────────────────────────────────────
  if (step === 'loading') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-rose-50 via-pink-50/30 to-fuchsia-50 flex flex-col items-center justify-center gap-5">
        <div className="w-14 h-14 border-4 border-pink-200 border-t-pink-500 rounded-full animate-spin" />
        <p className="text-sm font-semibold text-gray-600">Création de ton espace beauté…</p>
        <p className="text-xs text-gray-400">Tu vas être redirigée automatiquement ✨</p>
      </div>
    );
  }

  // ── INTRO ─────────────────────────────────────────────────────────────────
  if (step === 'intro') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-rose-50 via-pink-50/30 to-fuchsia-50 flex flex-col items-center justify-center p-5">
        {/* Live bandeau */}
        <div className="w-full max-w-md mb-6">
          <div className="flex items-center justify-center gap-2 bg-white border border-red-100 rounded-full px-4 py-2 shadow-sm mx-auto w-fit">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse shrink-0" />
            <span className="text-xs font-semibold text-gray-700">En direct · 14 esthéticiennes ont complété ce quiz aujourd'hui</span>
          </div>
        </div>

        <div className="w-full max-w-md">
          <Brand />
          <div className="bg-white rounded-3xl shadow-xl p-8 border border-rose-100 text-center">
            <div className="text-5xl mb-5">⏰</div>
            <h2 className="text-2xl font-black text-gray-900 leading-tight mb-3">
              Arrête de gérer ton stock<br />à la dernière minute.
            </h2>
            <p className="text-sm text-gray-500 leading-relaxed mb-8">
              Réponds à 5 questions et découvre combien tu perdes chaque mois sans le savoir.
            </p>
            <button
              onClick={() => setStep('quiz')}
              className="w-full py-4 bg-gradient-to-r from-pink-500 to-rose-500 text-white font-bold rounded-2xl shadow-lg hover:opacity-90 active:scale-[.98] transition-all text-base"
            >
              Découvrir ma formule gratuite →
            </button>
            <p className="text-xs text-gray-400 mt-4">2 minutes · Gratuit · Sans engagement</p>
          </div>
        </div>
      </div>
    );
  }

  // ── MICRO-YES ─────────────────────────────────────────────────────────────
  if (step === 'microyes') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-rose-50 via-pink-50/30 to-fuchsia-50 flex flex-col items-center justify-center p-5">
        <div className="w-full max-w-md text-center">
          <div className="bg-white rounded-3xl shadow-xl p-8 border border-emerald-100">
            <div className="text-5xl mb-5">✅</div>
            <p className="text-base font-semibold text-gray-800 leading-relaxed">{microYesText}</p>
            <div className="mt-6 flex justify-center gap-1">
              {[0, 1, 2].map(i => (
                <div key={i} className={`w-1.5 h-1.5 rounded-full bg-pink-300 animate-bounce`} style={{ animationDelay: `${i * 0.15}s` }} />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── QUIZ ───────────────────────────────────────────────────────────────────
  if (step === 'quiz') {
    const q = QUESTIONS[questionIdx];
    return (
      <div className="min-h-screen bg-gradient-to-br from-rose-50 via-pink-50/30 to-fuchsia-50 flex flex-col items-center justify-center p-5">
        <div className="w-full max-w-md">
          <Brand />
          <ProgressBar current={questionIdx} total={QUESTIONS.length} />
          <div className="bg-white rounded-3xl shadow-xl p-7 border border-rose-100">
            <p className="text-base font-semibold text-gray-900 mb-6 leading-relaxed">{q.q}</p>
            <div className="space-y-3">
              {q.choices.map((choice) => (
                <button
                  key={choice.label}
                  onClick={() => handleAnswer(choice)}
                  className="w-full flex items-center gap-4 p-4 rounded-2xl border-2 border-gray-100 hover:border-pink-300 hover:bg-pink-50 active:scale-[.98] transition-all text-left group"
                >
                  <span className="text-2xl shrink-0 group-hover:scale-110 transition-transform">{choice.emoji}</span>
                  <span className="text-sm font-medium text-gray-800">{choice.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── REASSURANCE ────────────────────────────────────────────────────────────
  if (step === 'reassurance') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-rose-50 via-pink-50/30 to-fuchsia-50 flex flex-col items-center justify-center p-5">
        <div className="w-full max-w-md text-center">
          <div className="bg-white rounded-3xl shadow-xl p-8 border border-rose-100 mb-6">
            <div className="text-5xl mb-5">💡</div>
            <p className="text-base font-semibold text-gray-800 leading-relaxed">{reassuranceText}</p>
          </div>
          <button
            onClick={handleNextQuestion}
            className="w-full py-4 bg-gradient-to-r from-pink-500 to-rose-500 text-white font-bold rounded-2xl shadow-lg hover:opacity-90 active:scale-[.98] transition-all text-sm"
          >
            Continuer →
          </button>
        </div>
      </div>
    );
  }

  // ── RESULT ─────────────────────────────────────────────────────────────────
  if (step === 'result') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-rose-50 via-pink-50/30 to-fuchsia-50 flex flex-col items-center justify-start p-5 pt-6 pb-20">
        <div className="w-full max-w-md space-y-4">

          {/* Live social proof banner */}
          <div className="flex items-center gap-2 bg-white border border-gray-100 rounded-full px-4 py-2.5 shadow-sm text-xs text-gray-600 font-medium transition-all duration-700">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
            <span key={socialProofIdx}>{SOCIAL_PROOF[socialProofIdx]}</span>
          </div>

          {/* Header */}
          <div className="text-center">
            <div className="text-4xl mb-2">🎯</div>
            <h2 className="text-2xl font-black text-gray-900">Ta formule idéale</h2>
            <p className="text-sm text-gray-500 mt-1">Calculée selon ton profil d'activité</p>
          </div>

          {/* Pertes actuelles */}
          {losses.total > 0 && (
            <div className="bg-red-50 border border-red-100 rounded-2xl p-5">
              <p className="text-xs font-bold text-red-500 uppercase tracking-wide mb-3">💸 Tes pertes actuelles estimées</p>
              {losses.deliveryCost > 0 && (
                <div className="flex justify-between text-sm text-red-700 mb-1">
                  <span>Frais de livraison urgents</span>
                  <span className="font-bold">−{losses.deliveryCost} €/mois</span>
                </div>
              )}
              {losses.lostClients > 0 && (
                <div className="flex justify-between text-sm text-red-700 mb-1">
                  <span>Clientes perdues / annulées</span>
                  <span className="font-bold">−{losses.lostClients} €/mois</span>
                </div>
              )}
              <div className="flex justify-between text-base font-bold text-red-800 pt-2 border-t border-red-200 mt-2">
                <span>Total perdu chaque mois</span>
                <span>−{losses.total} €</span>
              </div>
              {/* Annual loss */}
              <div className="mt-3 pt-3 border-t border-red-200 text-center">
                <p className="text-lg font-black text-red-600">
                  Soit −{losses.total * 12} € perdus sur 1 an 🔴
                </p>
              </div>
            </div>
          )}

          {/* Plan card */}
          <div className={`bg-white rounded-3xl shadow-xl p-6 border-2 ${'recommended' in plan && plan.recommended ? 'border-pink-400' : 'border-rose-100'}`}>
            {'recommended' in plan && plan.recommended && (
              <div className="text-center mb-4">
                <span className="bg-gradient-to-r from-pink-500 to-rose-500 text-white text-xs font-bold px-4 py-1.5 rounded-full shadow">
                  ⭐ PLAN RECOMMANDÉ POUR TOI
                </span>
              </div>
            )}
            <div className="text-center mb-5">
              <p className="text-2xl font-black text-gray-900">Formule {plan.name}</p>
              <p className="mt-1">
                <span className="text-4xl font-black text-pink-600">{plan.price} €</span>
                <span className="text-base text-gray-400 font-normal">/mois</span>
              </p>
            </div>
            <div className="space-y-2.5 mb-5">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Produits reçus</span>
                <span className="font-bold text-gray-900">{plan.quota} € de valeur</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Économie mensuelle</span>
                <span className="font-bold text-emerald-600">+{plan.gain} €/mois</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Gain sur 1 an</span>
                <span className="font-bold text-emerald-600">+{plan.gainYear} €/an</span>
              </div>
              {plan.livraison && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Livraison</span>
                  <span className="font-bold text-emerald-600">✅ Offerte</span>
                </div>
              )}
            </div>
            <div className="bg-emerald-50 rounded-2xl p-4 text-center">
              <p className="text-sm font-semibold text-emerald-700">
                {losses.total > 0
                  ? `La Box te fait récupérer ${losses.total + plan.gain} €/mois 💚`
                  : `Tu économises ${plan.gain} € chaque mois 💚`}
              </p>
            </div>
          </div>

          {/* Urgence */}
          <div className="flex items-center justify-center gap-2">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse shrink-0" />
            <p className="text-sm font-bold text-red-600">6 places disponibles ce mois-ci · Offre de lancement</p>
          </div>

          {/* Témoignages avec photos */}
          <div className="space-y-3">
            <div className="bg-white rounded-2xl p-4 border border-rose-100 shadow-sm">
              <div className="flex items-start gap-3">
                <Avatar src="/testimonials/marie-sophie.jpg" alt="Marie-Sophie B." />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <p className="text-sm font-bold text-gray-900">Marie-Sophie B.</p>
                    <span className="text-[10px] text-emerald-600 font-semibold bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 rounded-full">✅ Cliente vérifiée</span>
                  </div>
                  <p className="text-[11px] text-gray-400 mb-2">Fort-de-France, Martinique</p>
                  <p className="text-xs text-gray-700 italic leading-relaxed">
                    "Je pensais que 89€ c'était trop. Et là je reçois 110€ de produits. Plus jamais je commande en urgence 💕"
                  </p>
                  <span className="mt-2 inline-block text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">+21€ économisés par mois</span>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl p-4 border border-rose-100 shadow-sm">
              <div className="flex items-start gap-3">
                <Avatar src="/testimonials/minutelle.jpg" alt="Minutelle M." />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <p className="text-sm font-bold text-gray-900">Minutelle M.</p>
                    <span className="text-[10px] text-emerald-600 font-semibold bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 rounded-full">✅ Cliente vérifiée</span>
                  </div>
                  <p className="text-[11px] text-gray-400 mb-2">Martinique</p>
                  <p className="text-xs text-gray-700 italic leading-relaxed">
                    "L'appli est trop simple. Je confirme avant le 25, ma box arrive au salon. Mes collègues veulent toutes s'abonner maintenant ✨"
                  </p>
                  <span className="mt-2 inline-block text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">2h gagnées par mois</span>
                </div>
              </div>
            </div>
          </div>

          {/* Ce qui se passe après */}
          <div className="bg-gray-50 rounded-2xl p-5 border border-gray-100">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Voici ce qui se passe quand tu cliques :</p>
            <div className="space-y-2">
              {[
                'Tu crées ton compte en 2 minutes',
                'Tu explores le catalogue complet LMDE',
                'Tu composes ta box librement',
                'Tu paies seulement quand tu valides ta box',
              ].map((item) => (
                <div key={item} className="flex items-center gap-2.5">
                  <span className="text-emerald-500 shrink-0 font-bold text-sm">✅</span>
                  <span className="text-sm text-gray-700">{item}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Micro-engagement checkbox */}
          <label className="flex items-start gap-3 cursor-pointer group">
            <div className="relative mt-0.5 shrink-0">
              <input
                type="checkbox"
                checked={committed}
                onChange={(e) => setCommitted(e.target.checked)}
                className="sr-only"
              />
              <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${committed ? 'bg-pink-500 border-pink-500' : 'border-gray-300 bg-white group-hover:border-pink-300'}`}>
                {committed && (
                  <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                )}
              </div>
            </div>
            <span className="text-sm font-medium text-gray-700 leading-snug">
              Je confirme que je veux arrêter de commander en urgence
            </span>
          </label>

          {/* CTA principal */}
          <button
            onClick={() => setStep('form')}
            disabled={!committed}
            className={`w-full py-4 text-white font-bold rounded-2xl shadow-lg active:scale-[.98] transition-all text-base ${committed ? 'bg-gradient-to-r from-pink-600 to-rose-600 hover:opacity-90' : 'bg-gradient-to-r from-pink-300 to-rose-300 opacity-60 cursor-not-allowed'}`}
          >
            Accéder à ma Box Beauté maintenant →
          </button>

          {/* Refaire le quiz */}
          <button
            onClick={() => { setQuestionIdx(0); setNumericAnswers({}); setCommitted(false); setStep('quiz'); }}
            className="w-full py-3 text-gray-400 text-sm hover:text-gray-600 transition-colors"
          >
            Refaire le quiz
          </button>

          {/* Garantie */}
          <p className="text-center text-xs text-gray-400 leading-relaxed">
            🛡️ Satisfaite ou remboursée 30 jours · Sans engagement · Résiliable à tout moment
          </p>

          {/* WhatsApp */}
          <a
            href="https://wa.me/message/QBWQFIG2EHXCI1"
            target="_blank"
            rel="noopener noreferrer"
            className="w-full py-3 bg-[#25D366] text-white font-semibold rounded-2xl text-sm flex items-center justify-center gap-2 hover:opacity-90 transition-opacity"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
            </svg>
            Une question ? Écris-moi directement 💕
          </a>

        </div>
      </div>
    );
  }

  // ── FORM ───────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50 via-pink-50/30 to-fuchsia-50 flex flex-col items-center justify-start p-5 pt-10 pb-24">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="text-3xl mb-2">📋</div>
          <h2 className="text-2xl font-bold text-gray-900">Crée ton compte</h2>
          <p className="text-sm text-gray-500 mt-1">
            Formule <strong className="text-pink-600">{plan.name}</strong> · {plan.price} €/mois
          </p>
        </div>

        {/* Email warning */}
        <div className="bg-red-50 border-2 border-red-200 rounded-2xl p-4 mb-5">
          <p className="text-sm font-bold text-red-700 mb-1">⚠️ Important — Lis avant de continuer</p>
          <p className="text-xs text-red-600 leading-relaxed">
            Utilise exactement la même adresse email ici et sur le paiement Stripe. C'est elle qui active ton compte automatiquement.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-3xl shadow-xl p-6 border border-rose-100 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-500 mb-1.5 block">Prénom *</label>
              <input
                value={form.firstName}
                onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300"
                placeholder="Marlène"
                required
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 mb-1.5 block">Nom *</label>
              <input
                value={form.lastName}
                onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300"
                placeholder="Dupont"
                required
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1.5 block">
              Email * <span className="text-red-500 font-normal">(même que sur Stripe)</span>
            </label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300"
              placeholder="marlene@email.com"
              required
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1.5 block">
              Téléphone * <span className="text-gray-400 font-normal">(identifiant de connexion)</span>
            </label>
            <input
              type="tel"
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300"
              placeholder="+596 696 00 00 00"
              required
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1.5 block">Adresse de livraison</label>
            <input
              value={form.address}
              onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300"
              placeholder="12 rue de la Santé, Fort-de-France"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1.5 block">Île / Zone *</label>
            <select
              value={form.island}
              onChange={(e) => setForm((f) => ({ ...f, island: e.target.value }))}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300 bg-white"
            >
              {ISLANDS.map((i) => <option key={i} value={i}>{i}</option>)}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1.5 block">Formule choisie</label>
            <select
              value={form.plan}
              onChange={(e) => setForm((f) => ({ ...f, plan: e.target.value as PlanKey }))}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300 bg-white"
            >
              <option value="starter">Starter — 89€/mois · quota 110€</option>
              <option value="pro">Pro — 149€/mois · quota 200€ ⭐</option>
              <option value="elite">Elite — 229€/mois · quota 320€ + livraison offerte</option>
            </select>
          </div>

          {formError && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3">
              <p className="text-xs text-red-600 font-medium">{formError}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-4 bg-gradient-to-r from-pink-500 to-rose-500 text-white font-bold rounded-2xl shadow-lg hover:opacity-90 active:scale-[.98] transition-all disabled:opacity-60 text-base mt-2"
          >
            {submitting ? 'Création du compte…' : '🎁 Accéder à ma Box Beauté'}
          </button>
        </form>

        <p className="text-center text-xs text-gray-400 mt-4 leading-relaxed">
          En créant ton compte, tu pourras composer ta box immédiatement.<br />
          Le paiement se fait après, via Stripe sécurisé.
        </p>
      </div>
    </div>
  );
}
