'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

// ─── Data (INCHANGÉ) ──────────────────────────────────────────────────────────

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

// Cartes de réassurance structurées (redesignées mais même contenu)
const REASSURANCE_CARDS = [
  {
    icon: '💸',
    stat: '87%',
    statLabel: 'des esthéticiennes commandent en urgence',
    body: "Ça représente en moyenne 2 clientes perdues par mois, soit plus de 90€ de chiffre d'affaires chaque mois qui s'évapore.",
  },
  {
    icon: '😔',
    stat: '45€',
    statLabel: 'perdus à chaque cliente annulée',
    body: "Tu n'es pas seule. Annuler une cliente coûte en moyenne 45€ de CA perdu, plus le stress et la réputation. La Box Beauté a été créée exactement pour ça.",
  },
  {
    icon: '🏃',
    stat: 'N°1',
    statLabel: 'problème des esthéticiennes aux Antilles',
    body: "Tu n'es pas seule. C'est la situation n°1 que vivent les esthéticiennes aux Antilles. Et c'est exactement ce que la Box Beauté LMDE vient résoudre. 💪",
  },
  {
    icon: '⏰',
    stat: '52h',
    statLabel: 'libérées par an',
    body: "Les esthéticiennes qui maîtrisent leur stock gagnent en moyenne 1h par semaine. Soit 52h par an libérées pour ce qui compte vraiment.",
  },
];

// Micro-yes cartes structurées (clé = "questionIdx_value")
const MICRO_YES_CARDS: Record<string, { icon: string; stat: string; statLabel: string; body: string }> = {
  '0_1': {
    icon: '💸',
    stat: '25€',
    statLabel: 'perdus en livraisons inutiles chaque mois',
    body: "Même 1-2 commandes urgentes par mois représentent 300€ gaspillés par an. Sans compter le stress.",
  },
  '0_3': {
    icon: '📊',
    stat: '73%',
    statLabel: 'des esthéticiennes aux Antilles sont dans ce cas',
    body: "Ce n'est pas un problème individuel — c'est un problème de système. La Box est la solution.",
  },
  '1_2': {
    icon: '😔',
    stat: '90€',
    statLabel: 'perdus en clientes annulées par mois',
    body: "Chaque rendez-vous annulé, c'est du chiffre d'affaires perdu et de la réputation abîmée. Tu n'es pas seule.",
  },
  '2_2': {
    icon: '💡',
    stat: '',
    statLabel: '',
    body: "Ce moment existe parce que personne n'avait créé la bonne solution. Jusqu'à maintenant. La Box Beauté LMDE change ça.",
  },
};

const MICRO_YES_Q4_CARD = {
  icon: '🎯',
  stat: '',
  statLabel: '',
  body: "Tu as identifié ton problème principal. La Box est faite exactement pour ça. Plus qu'une étape.",
};

// Social proof pour la page résultat
const SOCIAL_PROOF = [
  { name: 'Marlène', lieu: 'Guadeloupe', action: 'vient de rejoindre', time: '3 minutes' },
  { name: 'Sandra', lieu: 'Martinique', action: 'vient de composer sa box', time: '7 minutes' },
  { name: 'Priya', lieu: 'Saint-Martin', action: 'vient de valider son abonnement', time: '12 minutes' },
];

const ISLANDS = ['Martinique', 'Guadeloupe', 'Guyane', 'Saint-Martin', 'France métropolitaine', 'Autre'];

const SESSION_KEY = 'client_portal_session';

// ─── Logique (INCHANGÉE) ───────────────────────────────────────────────────────

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

// ─── Sous-composants ──────────────────────────────────────────────────────────

function ProgressBar({ current, total }: { current: number; total: number }) {
  const pct = Math.round(((current + 1) / total) * 100);
  return (
    <div className="mb-6">
      <div className="h-2 bg-pink-100 rounded-full overflow-hidden shadow-inner">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${pct}%`,
            background: 'linear-gradient(90deg, #D4535E 0%, #C9A052 100%)',
            boxShadow: '0 2px 8px rgba(212,83,94,0.3)',
          }}
        />
      </div>
      <p className="text-xs text-gray-400 mt-2 text-center">Question {current + 1} / {total}</p>
    </div>
  );
}

function Brand() {
  return (
    <div className="text-center mb-6">
      <p className="text-[11px] font-black text-[#D4535E] uppercase tracking-[3px] mb-1">Le Monde de l'Esthétique</p>
      <h1 className="text-2xl font-black text-gray-900">Box Beauté Pro <span className="text-[#D4535E]">💅</span></h1>
    </div>
  );
}

function Avatar({ src, alt }: { src: string; alt: string }) {
  const [err, setErr] = useState(false);
  if (err) {
    return (
      <div className="w-14 h-14 rounded-full border-2 border-pink-300 bg-gradient-to-br from-pink-100 to-rose-200 flex items-center justify-center shrink-0 shadow-sm">
        <span className="text-xl">💅</span>
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      onError={() => setErr(true)}
      className="w-14 h-14 rounded-full object-cover shrink-0"
      style={{ border: '2px solid #D4535E', boxShadow: '0 4px 12px rgba(212,83,94,0.2)' }}
    />
  );
}

// Carte redesignée (microyes + reassurance)
function InsightCard({ icon, stat, statLabel, body, onContinue }: {
  icon: string; stat: string; statLabel: string; body: string; onContinue: () => void;
}) {
  return (
    <div
      style={{
        background: 'linear-gradient(135deg, #FFF0EE 0%, #FFF8F7 100%)',
        borderLeft: '4px solid #D4535E',
        borderRadius: 16,
        padding: 28,
        animation: 'slideUp 400ms ease-out',
        boxShadow: '0 8px 32px rgba(212,83,94,0.08)',
      }}
    >
      <div
        className="flex items-center justify-center mb-5"
        style={{
          width: 56, height: 56,
          borderRadius: '50%',
          background: 'rgba(212,83,94,0.08)',
          fontSize: 28,
        }}
      >
        {icon}
      </div>

      {stat && (
        <div className="mb-4">
          <p style={{ fontSize: 36, fontWeight: 900, color: '#D4535E', lineHeight: 1, marginBottom: 4 }}>{stat}</p>
          <p style={{ fontSize: 14, color: '#2C1810', fontWeight: 600 }}>{statLabel}</p>
        </div>
      )}

      <p style={{ fontSize: 15, color: '#6B5249', lineHeight: 1.7 }}>{body}</p>

      <button
        onClick={onContinue}
        className="mt-6 w-full py-3.5 text-white font-bold rounded-xl transition-all active:scale-[.98] hover:opacity-90"
        style={{ background: 'linear-gradient(90deg, #D4535E, #C9A052)', fontSize: 15 }}
      >
        Continuer →
      </button>
    </div>
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
  const [animating, setAnimating] = useState(false);

  // Micro-yes card data
  const [microYesCard, setMicroYesCard] = useState<{ icon: string; stat: string; statLabel: string; body: string } | null>(null);
  // Reassurance card index
  const [reassuranceIdx, setReassuranceIdx] = useState(0);

  // Result page state
  const [committed, setCommitted] = useState(false);
  const [timeLeft, setTimeLeft] = useState(10 * 60);
  const [socialProofIdx, setSocialProofIdx] = useState(0);
  const [socialVisible, setSocialVisible] = useState(true);

  // Credentials fallback
  const [credentials, setCredentials] = useState<{ phone: string; pin: string } | null>(null);

  // Form
  const [form, setForm] = useState({
    firstName: '', lastName: '', email: '', phone: '',
    address: '', island: 'Martinique', plan: 'pro' as PlanKey,
  });
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Redirect already-logged-in subscribers
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

  // Timer: 10 minutes countdown on result page
  useEffect(() => {
    if (step !== 'result') return;
    setTimeLeft(10 * 60);
    const t = setInterval(() => setTimeLeft(s => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [step]);

  // Social proof rotation with fade (every 6s)
  useEffect(() => {
    if (step !== 'result') return;
    const t = setInterval(() => {
      setSocialVisible(false);
      setTimeout(() => {
        setSocialProofIdx(i => (i + 1) % SOCIAL_PROOF.length);
        setSocialVisible(true);
      }, 400);
    }, 6000);
    return () => clearInterval(t);
  }, [step]);

  const formatTime = (s: number) =>
    `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

  // ── Handlers (logique INCHANGÉE) ───────────────────────────────────────────

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

      // Check for micro-yes card
      const microCard = questionIdx === 3 ? MICRO_YES_Q4_CARD : MICRO_YES_CARDS[`${questionIdx}_${val}`];

      if (microCard) {
        setMicroYesCard(microCard);
        setAnimating(false);
        setStep('microyes');
      } else {
        setReassuranceIdx(questionIdx);
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

  // ── CSS Animations ─────────────────────────────────────────────────────────
  const cssAnimations = `
    @keyframes slideUp {
      from { transform: translateY(20px); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }
    @keyframes slideInRight {
      from { transform: translateX(28px); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
    @keyframes fadeUp {
      from { transform: translateY(16px); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }
    @keyframes pulseArrow {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(6px); }
    }
    .anim-fadein { animation: fadeUp 500ms ease-out both; }
  `;

  // ── CREDENTIALS ────────────────────────────────────────────────────────────
  if (step === 'credentials' && credentials) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-5" style={{ background: '#FBF4F3' }}>
        <style>{cssAnimations}</style>
        <div className="w-full max-w-md" style={{ animation: 'slideUp 400ms ease-out' }}>
          <div className="text-center mb-6">
            <div className="text-5xl mb-3">🎉</div>
            <h2 className="text-2xl font-black text-gray-900">Ton compte est créé !</h2>
            <p className="text-sm text-gray-500 mt-1">Note tes identifiants de connexion</p>
          </div>
          <div className="bg-white rounded-2xl shadow-lg p-6 border border-rose-100 space-y-4">
            <div className="rounded-xl p-4 space-y-3" style={{ background: '#FFF0EE' }}>
              <div className="flex justify-between items-center">
                <span className="text-xs font-semibold text-gray-500">Téléphone</span>
                <span className="text-sm font-bold text-gray-900 font-mono">{credentials.phone}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs font-semibold text-gray-500">Code PIN</span>
                <span className="text-2xl font-black font-mono tracking-widest" style={{ color: '#D4535E' }}>{credentials.pin}</span>
              </div>
            </div>
            <p className="text-xs text-gray-400 text-center">Utilise ces identifiants sur <strong>lmdecaisse.com/client-portal/login</strong></p>
            <div className="space-y-3 pt-2">
              <a
                href={stripeLink}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-4 text-white font-bold rounded-xl text-sm flex items-center justify-center gap-2 hover:opacity-90 transition-opacity"
                style={{ background: 'linear-gradient(90deg, #D4535E, #C9A052)' }}
              >
                💳 Activer mon abonnement — payer maintenant
              </a>
              <button
                onClick={() => router.push('/client-portal/login')}
                className="w-full py-3 border border-gray-200 text-gray-600 font-medium rounded-xl text-sm hover:bg-gray-50 transition-colors"
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
      <div className="min-h-screen flex flex-col items-center justify-center gap-5" style={{ background: '#FBF4F3' }}>
        <style>{cssAnimations}</style>
        <div className="w-14 h-14 border-4 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#D4535E40', borderTopColor: '#D4535E' }} />
        <p className="text-sm font-semibold text-gray-600">Création de ton espace beauté…</p>
        <p className="text-xs text-gray-400">Tu vas être redirigée automatiquement ✨</p>
      </div>
    );
  }

  // ── INTRO ─────────────────────────────────────────────────────────────────
  if (step === 'intro') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-5" style={{ background: '#FBF4F3' }}>
        <style>{cssAnimations}</style>
        <div className="w-full max-w-md" style={{ animation: 'slideUp 400ms ease-out' }}>
          {/* Live bandeau */}
          <div
            className="flex items-center justify-center gap-2 mb-6 mx-auto w-fit px-4 py-2.5 rounded-full"
            style={{ background: '#fff', border: '1px solid #F5DDD9', boxShadow: '0 2px 12px rgba(212,83,94,0.08)' }}
          >
            <span className="w-2 h-2 rounded-full animate-pulse shrink-0" style={{ background: '#22C55E' }} />
            <span className="text-xs font-semibold" style={{ color: '#6B5249' }}>
              En direct · <span style={{ color: '#D4535E', fontWeight: 700 }}>14 esthéticiennes</span> ont complété ce quiz aujourd'hui
            </span>
          </div>

          <Brand />

          <div
            className="p-8 text-center"
            style={{ background: '#fff', borderRadius: 24, boxShadow: '0 8px 40px rgba(212,83,94,0.10)', border: '1px solid #F5DDD9' }}
          >
            <div className="text-5xl mb-5">⏰</div>
            <h2 className="font-black text-gray-900 leading-tight mb-3" style={{ fontSize: 24 }}>
              Arrête de gérer ton stock<br />à la dernière minute.
            </h2>
            <p className="text-sm leading-relaxed mb-8" style={{ color: '#6B5249' }}>
              Réponds à 5 questions et découvre combien tu perdes chaque mois sans le savoir.
            </p>
            <button
              onClick={() => setStep('quiz')}
              className="w-full py-4 text-white font-bold rounded-xl text-base hover:opacity-90 active:scale-[.98] transition-all"
              style={{ background: 'linear-gradient(90deg, #D4535E, #C9A052)', boxShadow: '0 8px 24px rgba(212,83,94,0.30)' }}
            >
              Découvrir ma formule gratuite →
            </button>
            <p className="text-xs mt-4" style={{ color: '#A08C87' }}>2 minutes · Gratuit · Sans engagement</p>
          </div>
        </div>
      </div>
    );
  }

  // ── MICRO-YES (redesigné, bouton manuel) ───────────────────────────────────
  if (step === 'microyes' && microYesCard) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-5" style={{ background: '#FBF4F3' }}>
        <style>{cssAnimations}</style>
        <div className="w-full max-w-md">
          <InsightCard
            icon={microYesCard.icon}
            stat={microYesCard.stat}
            statLabel={microYesCard.statLabel}
            body={microYesCard.body}
            onContinue={handleNextQuestion}
          />
        </div>
      </div>
    );
  }

  // ── QUIZ ───────────────────────────────────────────────────────────────────
  if (step === 'quiz') {
    const q = QUESTIONS[questionIdx];
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-5" style={{ background: '#FBF4F3' }}>
        <style>{cssAnimations}</style>
        <div className="w-full max-w-md">
          <Brand />
          <ProgressBar current={questionIdx} total={QUESTIONS.length} />

          <div
            key={`q-${questionIdx}`}
            style={{
              background: '#fff',
              borderRadius: 20,
              padding: 36,
              boxShadow: '0 8px 32px rgba(212,83,94,0.08)',
              border: '1px solid #F5DDD9',
              animation: 'slideInRight 350ms ease-out',
            }}
          >
            <p className="font-bold mb-6 leading-snug" style={{ fontSize: 20, color: '#2C1810' }}>{q.q}</p>
            <div className="space-y-3">
              {q.choices.map((choice) => (
                <button
                  key={choice.label}
                  onClick={() => handleAnswer(choice)}
                  className="w-full flex items-center gap-4 text-left group transition-all active:scale-[.98]"
                  style={{
                    minHeight: 64,
                    padding: '18px 20px',
                    border: '2px solid #EDE5E0',
                    borderRadius: 14,
                    background: '#FDFBFA',
                    transition: 'border-color 200ms, background 200ms, transform 200ms',
                  }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLElement).style.borderColor = '#D4535E';
                    (e.currentTarget as HTMLElement).style.background = '#FFF0EE';
                    (e.currentTarget as HTMLElement).style.transform = 'translateX(4px)';
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLElement).style.borderColor = '#EDE5E0';
                    (e.currentTarget as HTMLElement).style.background = '#FDFBFA';
                    (e.currentTarget as HTMLElement).style.transform = 'translateX(0)';
                  }}
                >
                  <div
                    className="shrink-0 flex items-center justify-center"
                    style={{ width: 44, height: 44, borderRadius: '50%', background: '#FFF0EE', fontSize: 22 }}
                  >
                    {choice.emoji}
                  </div>
                  <span className="font-semibold" style={{ fontSize: 15, color: '#2C1810' }}>{choice.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── REASSURANCE (redesignée) ────────────────────────────────────────────────
  if (step === 'reassurance') {
    const card = REASSURANCE_CARDS[reassuranceIdx] ?? REASSURANCE_CARDS[0];
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-5" style={{ background: '#FBF4F3' }}>
        <style>{cssAnimations}</style>
        <div className="w-full max-w-md">
          <InsightCard
            icon={card.icon}
            stat={card.stat}
            statLabel={card.statLabel}
            body={card.body}
            onContinue={handleNextQuestion}
          />
        </div>
      </div>
    );
  }

  // ── RESULT ─────────────────────────────────────────────────────────────────
  if (step === 'result') {
    const sp = SOCIAL_PROOF[socialProofIdx];
    return (
      <div className="min-h-screen flex flex-col items-center justify-start pb-20" style={{ background: '#FBF4F3' }}>
        <style>{cssAnimations}</style>

        {/* Live bandeau sticky */}
        <div
          className="w-full flex items-center justify-center gap-2.5 px-4 py-3"
          style={{ background: '#fff', borderBottom: '1px solid #F5DDD9', position: 'sticky', top: 0, zIndex: 10 }}
        >
          <span className="w-2 h-2 rounded-full animate-pulse shrink-0" style={{ background: '#22C55E' }} />
          <span
            className="text-xs font-medium transition-opacity duration-400"
            style={{ color: '#6B5249', opacity: socialVisible ? 1 : 0 }}
          >
            <span style={{ color: '#D4535E', fontWeight: 700 }}>{sp.name}</span> de {sp.lieu} {sp.action} · il y a {sp.time}
          </span>
        </div>

        <div className="w-full max-w-md px-5 pt-6 space-y-5">

          {/* Timer urgence */}
          <div
            className="anim-fadein flex items-center justify-between px-5 py-3 rounded-xl"
            style={{ background: '#FFF5F5', border: '1px solid #FECACA', animationDelay: '0ms' }}
          >
            <p className="text-xs font-semibold" style={{ color: '#DC2626' }}>
              ⏱ Cette offre est réservée pour les 10 prochaines minutes
            </p>
            <span className="font-black text-lg tabular-nums shrink-0 ml-3" style={{ color: '#DC2626' }}>
              {formatTime(timeLeft)}
            </span>
          </div>

          {/* Header */}
          <div className="anim-fadein text-center" style={{ animationDelay: '80ms' }}>
            <div className="text-4xl mb-2">🎯</div>
            <h2 className="font-black text-gray-900" style={{ fontSize: 26 }}>Ta formule idéale</h2>
            <p className="text-sm mt-1" style={{ color: '#6B5249' }}>Calculée selon ton profil d'activité</p>
          </div>

          {/* Pertes */}
          {losses.total > 0 && (
            <div
              className="anim-fadein rounded-2xl p-5"
              style={{ background: '#FFF5F5', border: '1px solid #FCA5A5', animationDelay: '160ms' }}
            >
              <p className="text-xs font-bold uppercase tracking-wide mb-3" style={{ color: '#DC2626' }}>💸 Tes pertes actuelles estimées</p>
              {losses.deliveryCost > 0 && (
                <div className="flex justify-between text-sm mb-1" style={{ color: '#B91C1C' }}>
                  <span>Frais de livraison urgents</span>
                  <span className="font-bold">−{losses.deliveryCost} €/mois</span>
                </div>
              )}
              {losses.lostClients > 0 && (
                <div className="flex justify-between text-sm mb-1" style={{ color: '#B91C1C' }}>
                  <span>Clientes perdues / annulées</span>
                  <span className="font-bold">−{losses.lostClients} €/mois</span>
                </div>
              )}
              <div className="flex justify-between font-bold pt-2 mt-2" style={{ color: '#991B1B', borderTop: '1px solid #FCA5A5', fontSize: 16 }}>
                <span>Total perdu chaque mois</span>
                <span>−{losses.total} €</span>
              </div>
              <div className="mt-3 pt-3 text-center" style={{ borderTop: '1px solid #FCA5A5' }}>
                <p className="font-black" style={{ fontSize: 22, color: '#DC2626' }}>
                  Soit −{losses.total * 12} € perdus sur 1 an 🔴
                </p>
              </div>
            </div>
          )}

          {/* Plan card premium */}
          <div
            className="anim-fadein rounded-2xl p-6"
            style={{
              background: 'linear-gradient(135deg, #fff 0%, #FFF8F7 100%)',
              border: '2px solid #D4535E',
              boxShadow: '0 16px 48px rgba(212,83,94,0.15)',
              animationDelay: '240ms',
            }}
          >
            {'recommended' in plan && plan.recommended && (
              <div className="text-center mb-4">
                <span
                  className="text-white text-xs font-bold px-4 py-1.5"
                  style={{ background: 'linear-gradient(90deg, #D4535E, #C9A052)', borderRadius: 100 }}
                >
                  ⭐ PLAN RECOMMANDÉ POUR TOI
                </span>
              </div>
            )}
            <div className="text-center mb-5">
              <p className="font-black text-gray-900" style={{ fontSize: 22 }}>Formule {plan.name}</p>
              <p className="mt-1">
                <span className="font-black" style={{ fontSize: 52, color: '#D4535E', lineHeight: 1 }}>{plan.price}</span>
                <span style={{ fontSize: 16, color: '#A08C87' }}>€/mois</span>
              </p>
            </div>
            <div className="space-y-2.5 mb-5">
              <div className="flex justify-between text-sm">
                <span style={{ color: '#A08C87' }}>Produits reçus</span>
                <span className="font-bold text-gray-900">{plan.quota} € de valeur</span>
              </div>
              <div className="flex justify-between text-sm">
                <span style={{ color: '#A08C87' }}>Économie mensuelle</span>
                <span className="font-bold text-emerald-600">+{plan.gain} €/mois</span>
              </div>
              <div className="flex justify-between text-sm">
                <span style={{ color: '#A08C87' }}>Gain sur 1 an</span>
                <span className="font-bold text-emerald-600">+{plan.gainYear} €/an</span>
              </div>
              {plan.livraison && (
                <div className="flex justify-between text-sm">
                  <span style={{ color: '#A08C87' }}>Livraison</span>
                  <span className="font-bold text-emerald-600">✅ Offerte</span>
                </div>
              )}
            </div>
            <div className="rounded-xl p-4 text-center" style={{ background: '#E8F5E9' }}>
              <p className="text-sm font-semibold text-emerald-700">
                {losses.total > 0
                  ? `La Box te fait récupérer ${losses.total + plan.gain} €/mois 💚`
                  : `Tu économises ${plan.gain} € chaque mois 💚`}
              </p>
            </div>
          </div>

          {/* Urgence */}
          <div className="anim-fadein flex items-center justify-center gap-2" style={{ animationDelay: '300ms' }}>
            <span className="w-2 h-2 rounded-full animate-pulse shrink-0" style={{ background: '#DC2626' }} />
            <p className="text-sm font-bold" style={{ color: '#DC2626' }}>6 places disponibles ce mois-ci · Offre de lancement</p>
          </div>

          {/* Témoignages */}
          <div className="anim-fadein space-y-3" style={{ animationDelay: '360ms' }}>
            {[
              {
                src: '/testimonials/marie-sophie.jpg',
                name: 'Marie-Sophie B.',
                lieu: 'Fort-de-France, Martinique',
                text: '"Je pensais que 89€ c\'était trop. Et là je reçois 110€ de produits. Plus jamais je commande en urgence 💕"',
                badge: '+21€ économisés par mois',
              },
              {
                src: '/testimonials/minutelle.jpg',
                name: 'Minutelle M.',
                lieu: 'Martinique',
                text: '"L\'appli est trop simple. Je confirme avant le 25, ma box arrive au salon. Mes collègues veulent toutes s\'abonner maintenant ✨"',
                badge: '2h gagnées par mois',
              },
            ].map((t) => (
              <div
                key={t.name}
                className="bg-white rounded-2xl p-4"
                style={{ border: '1px solid #F5DDD9', boxShadow: '0 4px 16px rgba(212,83,94,0.06)' }}
              >
                <div className="flex items-start gap-3">
                  <Avatar src={t.src} alt={t.name} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                      <p className="text-sm font-bold text-gray-900">{t.name}</p>
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ color: '#2E7D32', background: '#E8F5E9', border: '1px solid #C8E6C9' }}>✅ Cliente vérifiée</span>
                    </div>
                    <p className="text-[11px] mb-2" style={{ color: '#A08C87' }}>{t.lieu}</p>
                    <p className="text-xs leading-relaxed" style={{ color: '#4A3728', fontStyle: 'italic', fontFamily: 'Georgia, serif' }}>{t.text}</p>
                    <span
                      className="mt-2 inline-block text-[11px] font-bold px-2 py-0.5 rounded-full"
                      style={{ color: '#2E7D32', background: '#E8F5E9', border: '1px solid #C8E6C9' }}
                    >
                      {t.badge}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Ce qui se passe quand tu cliques — timeline */}
          <div
            className="anim-fadein bg-white rounded-2xl p-5"
            style={{ border: '1px solid #F5DDD9', animationDelay: '420ms' }}
          >
            <p className="text-xs font-bold uppercase tracking-wide mb-4" style={{ color: '#A08C87' }}>Voici ce qui se passe quand tu cliques :</p>
            <div className="relative">
              <div className="absolute left-5 top-6 bottom-6 w-0.5" style={{ background: 'linear-gradient(to bottom, #D4535E, #C9A052)' }} />
              {[
                { icon: '✅', label: 'Tu crées ton compte', sub: '2 minutes' },
                { icon: '📦', label: 'Tu explores le catalogue LMDE', sub: 'Centaines de produits' },
                { icon: '🛍️', label: 'Tu composes ta box librement', sub: 'Selon ton budget mensuel' },
                { icon: '💳', label: 'Tu paies seulement quand tu valides', sub: 'Zéro engagement immédiat' },
              ].map((item, i) => (
                <div key={i} className="flex items-start gap-4 mb-4 last:mb-0 relative">
                  <div
                    className="flex items-center justify-center shrink-0 z-10"
                    style={{ width: 40, height: 40, borderRadius: '50%', background: '#FFF0EE', fontSize: 18, border: '2px solid #D4535E40' }}
                  >
                    {item.icon}
                  </div>
                  <div className="pt-1">
                    <p className="text-sm font-semibold text-gray-900">{item.label}</p>
                    <p className="text-xs mt-0.5" style={{ color: '#A08C87' }}>{item.sub}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Checkbox micro-engagement */}
          <div className="anim-fadein space-y-3" style={{ animationDelay: '480ms' }}>
            {!committed && (
              <div className="flex justify-center" style={{ animation: 'pulseArrow 1s ease-in-out infinite' }}>
                <span style={{ fontSize: 22, color: '#D4535E' }}>↓</span>
              </div>
            )}
            <label className="flex items-start gap-3 cursor-pointer group p-4 rounded-xl transition-all" style={{ background: committed ? '#FFF0EE' : '#F9F5F4', border: `2px solid ${committed ? '#D4535E' : '#EDE5E0'}` }}>
              <div className="relative mt-0.5 shrink-0">
                <input
                  type="checkbox"
                  checked={committed}
                  onChange={(e) => setCommitted(e.target.checked)}
                  className="sr-only"
                />
                <div
                  className="w-6 h-6 rounded-md flex items-center justify-center transition-all"
                  style={{ background: committed ? '#D4535E' : '#fff', border: `2px solid ${committed ? '#D4535E' : '#D1C4BC'}` }}
                >
                  {committed && (
                    <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                  )}
                </div>
              </div>
              <span className="text-sm font-semibold leading-snug" style={{ color: '#2C1810' }}>
                ✓ Oui, je veux arrêter de commander en urgence
              </span>
            </label>
          </div>

          {/* CTA */}
          <div className="anim-fadein" style={{ animationDelay: '540ms' }}>
            <button
              onClick={() => setStep('form')}
              disabled={!committed}
              className="w-full py-4 text-white font-black rounded-xl text-base transition-all active:scale-[.98]"
              style={{
                background: committed ? 'linear-gradient(90deg, #D4535E, #C9A052)' : '#D1C4BC',
                boxShadow: committed ? '0 8px 24px rgba(212,83,94,0.35)' : 'none',
                cursor: committed ? 'pointer' : 'not-allowed',
                fontSize: 17,
              }}
            >
              {committed ? 'Accéder à ma Box Beauté maintenant →' : 'Cochez pour continuer'}
            </button>
          </div>

          {/* Refaire le quiz */}
          <button
            onClick={() => { setQuestionIdx(0); setNumericAnswers({}); setCommitted(false); setStep('quiz'); }}
            className="w-full py-3 text-sm hover:text-gray-600 transition-colors"
            style={{ color: '#A08C87' }}
          >
            Refaire le quiz
          </button>

          {/* Garantie */}
          <div
            className="anim-fadein rounded-xl px-4 py-3 text-center"
            style={{ background: '#FFF8E1', border: '1px solid #F5E6C0', animationDelay: '600ms' }}
          >
            <p className="text-xs" style={{ color: '#7B6520' }}>
              🛡️ <strong>Satisfaite ou remboursée 30 jours</strong> · Sans engagement · Résiliable à tout moment
            </p>
          </div>

          {/* WhatsApp */}
          <a
            href="https://wa.me/message/QBWQFIG2EHXCI1"
            target="_blank"
            rel="noopener noreferrer"
            className="anim-fadein w-full py-4 text-white font-bold rounded-xl text-sm flex items-center justify-center gap-2.5 hover:opacity-90 transition-opacity"
            style={{
              background: '#25D366',
              boxShadow: '0 6px 24px rgba(37,211,102,0.30)',
              animationDelay: '660ms',
            }}
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
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
    <div className="min-h-screen flex flex-col items-center justify-start pt-10 pb-24 px-5" style={{ background: '#FBF4F3' }}>
      <style>{cssAnimations}</style>
      <div className="w-full max-w-md" style={{ animation: 'slideUp 400ms ease-out' }}>
        <div className="text-center mb-6">
          <div className="text-3xl mb-2">📋</div>
          <h2 className="text-2xl font-bold text-gray-900">Crée ton compte</h2>
          <p className="text-sm mt-1" style={{ color: '#6B5249' }}>
            Formule <strong style={{ color: '#D4535E' }}>{plan.name}</strong> · {plan.price} €/mois
          </p>
        </div>

        <div className="rounded-2xl p-4 mb-5" style={{ background: '#FFF5F5', border: '2px solid #FCA5A5' }}>
          <p className="text-sm font-bold mb-1" style={{ color: '#DC2626' }}>⚠️ Important — Lis avant de continuer</p>
          <p className="text-xs leading-relaxed" style={{ color: '#B91C1C' }}>
            Utilise exactement la même adresse email ici et sur le paiement Stripe. C'est elle qui active ton compte automatiquement.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-2xl p-6 space-y-4"
          style={{ border: '1px solid #F5DDD9', boxShadow: '0 8px 32px rgba(212,83,94,0.08)' }}
        >
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-500 mb-1.5 block">Prénom *</label>
              <input value={form.firstName} onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-rose-200" placeholder="Marlène" required />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 mb-1.5 block">Nom *</label>
              <input value={form.lastName} onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-rose-200" placeholder="Dupont" required />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1.5 block">Email * <span className="text-red-500 font-normal">(même que sur Stripe)</span></label>
            <input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-rose-200" placeholder="marlene@email.com" required />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1.5 block">Téléphone * <span className="text-gray-400 font-normal">(identifiant de connexion)</span></label>
            <input type="tel" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-rose-200" placeholder="+596 696 00 00 00" required />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1.5 block">Adresse de livraison</label>
            <input value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-rose-200" placeholder="12 rue de la Santé, Fort-de-France" />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1.5 block">Île / Zone *</label>
            <select value={form.island} onChange={(e) => setForm((f) => ({ ...f, island: e.target.value }))}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-rose-200 bg-white">
              {ISLANDS.map((i) => <option key={i} value={i}>{i}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1.5 block">Formule choisie</label>
            <select value={form.plan} onChange={(e) => setForm((f) => ({ ...f, plan: e.target.value as PlanKey }))}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-rose-200 bg-white">
              <option value="starter">Starter — 89€/mois · quota 110€</option>
              <option value="pro">Pro — 149€/mois · quota 200€ ⭐</option>
              <option value="elite">Elite — 229€/mois · quota 320€ + livraison offerte</option>
            </select>
          </div>
          {formError && (
            <div className="rounded-xl p-3" style={{ background: '#FFF5F5', border: '1px solid #FCA5A5' }}>
              <p className="text-xs font-medium" style={{ color: '#DC2626' }}>{formError}</p>
            </div>
          )}
          <button
            type="submit"
            disabled={submitting}
            className="w-full py-4 text-white font-bold rounded-xl text-base transition-all disabled:opacity-60 mt-2 hover:opacity-90 active:scale-[.98]"
            style={{ background: 'linear-gradient(90deg, #D4535E, #C9A052)', boxShadow: '0 8px 24px rgba(212,83,94,0.30)' }}
          >
            {submitting ? 'Création du compte…' : '🎁 Accéder à ma Box Beauté'}
          </button>
        </form>

        <p className="text-center text-xs mt-4 leading-relaxed" style={{ color: '#A08C87' }}>
          En créant ton compte, tu pourras composer ta box immédiatement.<br />
          Le paiement se fait après, via Stripe sécurisé.
        </p>
      </div>
    </div>
  );
}
