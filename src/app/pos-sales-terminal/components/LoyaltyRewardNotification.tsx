'use client';

import React, { useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import type { LoyaltyTier } from '@/lib/services/loyaltyService';
import { REWARD_TYPE_LABELS, REWARD_TYPE_ICONS } from '@/lib/services/loyaltyService';

interface LoyaltyRewardNotificationProps {
  unlockedTiers: LoyaltyTier[];
  nextTier: LoyaltyTier | null;
  pointsToNext: number;
  currentPoints: number;
  pointsEarned: number;
  onValidate: (tier: LoyaltyTier) => void;
  onDismiss: () => void;
}

export default function LoyaltyRewardNotification({
  unlockedTiers,
  nextTier,
  pointsToNext,
  currentPoints,
  pointsEarned,
  onValidate,
  onDismiss,
}: LoyaltyRewardNotificationProps) {
  const [validatedIds, setValidatedIds] = useState<Set<string>>(new Set());

  const handleValidate = (tier: LoyaltyTier) => {
    setValidatedIds((prev) => new Set([...prev, tier.id]));
    onValidate(tier);
  };

  const allValidated = unlockedTiers.every((t) => validatedIds.has(t.id));

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" />
      <div className="relative bg-white rounded-2xl shadow-modal w-full max-w-md mx-4 overflow-hidden">
        {/* Animated header */}
        <div className="bg-gradient-to-r from-amber-400 to-orange-400 px-6 py-5 text-white text-center">
          <div className="text-4xl mb-2 animate-bounce">🎉</div>
          <h2 className="text-xl font-700">Récompense débloquée !</h2>
          <p className="text-sm opacity-90 mt-1">
            +{pointsEarned} points · Total : {currentPoints.toLocaleString('fr-FR')} pts
          </p>
        </div>

        <div className="p-5 space-y-4">
          {/* Unlocked tiers */}
          {unlockedTiers.map((tier) => {
            const isValidated = validatedIds.has(tier.id);
            return (
              <div key={tier.id} className={`rounded-xl border-2 p-4 transition-all ${isValidated ? 'border-emerald-300 bg-emerald-50' : 'border-amber-300 bg-amber-50'}`}>
                <div className="flex items-start gap-3">
                  <span className="text-2xl shrink-0">{REWARD_TYPE_ICONS[tier.rewardType] ?? '🎁'}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-700 text-foreground">{tier.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{tier.rewardDescription}</p>
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className="text-[10px] font-600 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">
                        {REWARD_TYPE_LABELS[tier.rewardType] ?? tier.rewardType}
                      </span>
                      {tier.rewardValue > 0 && (
                        <span className="text-[10px] font-700 text-rose-600">-{tier.rewardValue}%</span>
                      )}
                    </div>
                  </div>
                  {isValidated ? (
                    <div className="shrink-0 w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center">
                      <Icon name="CheckIcon" size={16} className="text-white" />
                    </div>
                  ) : (
                    <button
                      onClick={() => handleValidate(tier)}
                      className="shrink-0 px-3 py-1.5 bg-amber-500 text-white text-xs font-700 rounded-lg hover:bg-amber-600 transition-colors active:scale-95"
                    >
                      Valider
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {/* Next tier progress */}
          {nextTier && (
            <div className="rounded-xl border border-border bg-muted/30 p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-base">🔥</span>
                <p className="text-sm font-600 text-foreground">
                  Plus que <span className="text-primary font-700">{pointsToNext.toLocaleString('fr-FR')} points</span> avant la prochaine récompense
                </p>
              </div>
              <p className="text-xs text-muted-foreground mb-2">
                Prochain palier : <strong>{nextTier.name}</strong> — {nextTier.rewardDescription}
              </p>
              {/* Progress bar */}
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-amber-400 to-orange-400 rounded-full transition-all"
                  style={{
                    width: `${Math.min(100, Math.max(5, ((currentPoints - (nextTier.pointsRequired - pointsToNext)) / nextTier.pointsRequired) * 100))}%`,
                  }}
                />
              </div>
              <p className="text-[10px] text-muted-foreground mt-1 text-right tabular-nums">
                {currentPoints.toLocaleString('fr-FR')} / {nextTier.pointsRequired.toLocaleString('fr-FR')} pts
              </p>
            </div>
          )}

          {!nextTier && (
            <div className="rounded-xl border border-purple-200 bg-purple-50 p-4 text-center">
              <span className="text-2xl">👑</span>
              <p className="text-sm font-700 text-purple-800 mt-1">Niveau maximum atteint !</p>
              <p className="text-xs text-purple-600 mt-0.5">Cliente au sommet du programme fidélité</p>
            </div>
          )}

          {/* Actions */}
          <button
            onClick={onDismiss}
            disabled={!allValidated && unlockedTiers.length > 0}
            className="w-full py-3 bg-primary text-primary-foreground rounded-xl text-sm font-700 hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {allValidated || unlockedTiers.length === 0 ? (
              <><Icon name="CheckIcon" size={16} />Fermer</>
            ) : (
              <>Validez toutes les récompenses pour continuer</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
