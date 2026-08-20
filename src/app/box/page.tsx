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
      { emoji: '😬', label: 'Oui une fois — c\'était stressant', value: 1 },
      { emoji: '😭', label: 'Oui plusieurs fois — c\'est mon cauchemar', value: 2 },
    ],
  },
  {
    q: 'Qu\'est-ce qui te stresse le plus dans ton stock ?',
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
  '87% des esthéticiennes qui commandent en urgence perdent en moyenne 2 clientes par mois. Ça représente plus de 90€ de chiffre d\'affaires chaque mois. 🤯',
  'Tu n\'es pas seule. Annuler une cliente coûte en moyenne 45€ de CA perdu, plus le stress et la réputation. La Box Beauté a été créée exactement pour ça.',
  "Tu n'es pas seule. C'est la situation n°1 que vivent les esthéticiennes aux Antilles. Et c'est exactement ce que la Box Beauté LMDE vient résoudre. 💪",
  'Les esthéticiennes qui maîtrisent leur stock gagnent en moyenne 1h par semaine. Soit 52h par an libérées pour ce qui compte vraiment.',
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

// ─── Page ─────────────────────────────────────────────────────────────────────

type Step = 'quiz' | 'reassurance' | 'result' | 'form' | 'loading';

export default function BoxOnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('quiz');
  const [questionIdx, setQuestionIdx] = useState(0);
  const [numericAnswers, setNumericAnswers] = useState<Record<number, number>>({});
  const [recommendedPlan, setRecommendedPlan] = useState<PlanKey>('pro');
  const [reassuranceText, setReassuranceText] = useState('');
  const [animating, setAnimating] = useState(false);

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

  const handleAnswer = (choice: { value: number | PlanKey }) => {
    if (animating) return;
    setAnimating(true);

    const isLastQ = questionIdx === QUESTIONS.length - 1;

    if (isLastQ) {
      // Q5 → plan recommendation
      const plan = choice.value as PlanKey;
      setRecommendedPlan(plan);
      setForm((f) => ({ ...f, plan }));
      setAnimating(false);
      setStep('result');
    } else {
      const val = choice.value as number;
      setNumericAnswers((prev) => ({ ...prev, [questionIdx]: val }));
      setReassuranceText(REASSURANCES[questionIdx] ?? '');
      setStep('reassurance');
      setAnimating(false);
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
      if (!res.ok) throw new Error(json.error ?? 'Erreur lors de l\'inscription');

      // Auto-login: call verify_client_pin and store session in localStorage
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
      }
      router.push('/client-portal/dashboard');
    } catch (err: any) {
      setFormError(err.message);
      setStep('form');
      setSubmitting(false);
    }
  };

  const losses = calcLosses(numericAnswers);
  const plan = PLANS[recommendedPlan];

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
      <div className="min-h-screen bg-gradient-to-br from-rose-50 via-pink-50/30 to-fuchsia-50 flex flex-col items-center justify-start p-5 pt-10 pb-20">
        <div className="w-full max-w-md">
          <div className="text-center mb-6">
            <div className="text-4xl mb-3">🎯</div>
            <h2 className="text-2xl font-black text-gray-900">Ta formule idéale</h2>
            <p className="text-sm text-gray-500 mt-1">Calculée selon ton profil d'activité</p>
          </div>

          {/* Pertes actuelles */}
          {losses.total > 0 && (
            <div className="bg-red-50 border border-red-100 rounded-2xl p-5 mb-4">
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
            </div>
          )}

          {/* Plan card */}
          <div className={`bg-white rounded-3xl shadow-xl p-6 border-2 mb-4 ${plan.recommended ? 'border-pink-400' : 'border-rose-100'}`}>
            {plan.recommended && (
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

          {/* Témoignage */}
          <div className="bg-white/70 rounded-2xl p-4 mb-5 border border-rose-100">
            <p className="text-xs text-gray-500 italic leading-relaxed">
              {recommendedPlan === 'starter' && '"Depuis que j\'ai la Box Starter, je ne commande plus en urgence. 21€ économisés par mois, la box se rembourse toute seule !" — Sandrine, esthéticienne Martinique'}
              {recommendedPlan === 'pro' && '"La Box Pro a changé ma façon de travailler. Je ne stresse plus jamais pour mon stock. Marlène économise 51€/mois depuis 3 mois." — Marlène, salon beauté Martinique'}
              {recommendedPlan === 'elite' && '"Avec Elite et la livraison offerte, j\'ai économisé 91€ le premier mois. Mes 28 clientes sont toujours servies, sans stress." — Nadège, esthéticienne Fort-de-France'}
            </p>
          </div>

          <button
            onClick={() => setStep('form')}
            className="w-full py-4 bg-gradient-to-r from-pink-500 to-rose-500 text-white font-bold rounded-2xl shadow-lg hover:opacity-90 active:scale-[.98] transition-all text-base"
          >
            ✨ Valider mon plan {plan.name}
          </button>
          <button
            onClick={() => { setQuestionIdx(0); setNumericAnswers({}); setStep('quiz'); }}
            className="w-full mt-3 py-3 text-gray-400 text-sm hover:text-gray-600 transition-colors"
          >
            Refaire le quiz
          </button>
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
