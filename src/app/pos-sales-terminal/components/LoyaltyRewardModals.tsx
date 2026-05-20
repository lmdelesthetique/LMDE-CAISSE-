'use client';

import React, { useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import {
  REWARD_TYPE_LABELS,
  REWARD_TYPE_ICONS,
  type ClientLoyaltyReward,
  type LoyaltyTier,
} from '@/lib/services/loyaltyService';

// ── Available Rewards Modal (shown when client is selected at POS) ─────────────

interface AvailableRewardsModalProps {
  clientName: string;
  availableRewards: ClientLoyaltyReward[];
  nextTier: LoyaltyTier | null;
  pointsToNext: number;
  currentPoints: number;
  onUseNow: (reward: ClientLoyaltyReward) => void;
  onKeepForLater: () => void;
}

export function AvailableRewardsModal({
  clientName,
  availableRewards,
  nextTier,
  pointsToNext,
  currentPoints,
  onUseNow,
  onKeepForLater,
}: AvailableRewardsModalProps) {
  const [selectedReward, setSelectedReward] = useState<ClientLoyaltyReward | null>(
    availableRewards.length === 1 ? availableRewards[0] : null
  );

  const expiringSoon = availableRewards.filter(
    (r) => r.expiryDate && new Date(r.expiryDate).getTime() - Date.now() < 7 * 24 * 60 * 60 * 1000
  );

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" />
      <div className="relative bg-white rounded-2xl shadow-modal w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-violet-500 to-purple-600 px-6 py-5 text-white">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-lg">
              🎁
            </div>
            <div>
              <h2 className="text-lg font-700">Récompense disponible !</h2>
              <p className="text-sm opacity-90">{clientName}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 mt-2 bg-white/10 rounded-lg px-3 py-2">
            <span className="text-sm">⭐</span>
            <span className="text-sm font-600">
              {currentPoints.toLocaleString('fr-FR')} points fidélité
            </span>
            {availableRewards.length > 1 && (
              <span className="ml-auto text-xs bg-white/20 rounded-full px-2 py-0.5 font-700">
                {availableRewards.length} récompenses
              </span>
            )}
          </div>
        </div>

        <div className="p-5 space-y-4 max-h-[60vh] overflow-y-auto">
          {/* Expiring soon warning */}
          {expiringSoon.length > 0 && (
            <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              <span className="text-base">⚠️</span>
              <p className="text-xs font-600 text-amber-800">
                {expiringSoon.length === 1
                  ? '1 récompense expire bientôt !'
                  : `${expiringSoon.length} récompenses expirent bientôt !`}
              </p>
            </div>
          )}

          {/* Reward list */}
          <div className="space-y-3">
            {availableRewards.map((reward) => {
              const isSelected = selectedReward?.id === reward.id;
              const isExpiringSoon =
                reward.expiryDate &&
                new Date(reward.expiryDate).getTime() - Date.now() < 7 * 24 * 60 * 60 * 1000;
              const daysLeft = reward.expiryDate
                ? Math.ceil((new Date(reward.expiryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
                : null;

              return (
                <button
                  key={reward.id}
                  onClick={() => setSelectedReward(isSelected ? null : reward)}
                  className={`w-full text-left rounded-xl border-2 p-4 transition-all ${
                    isSelected
                      ? 'border-violet-400 bg-violet-50'
                      : 'border-border hover:border-violet-200 hover:bg-violet-50/30'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span className="text-2xl shrink-0 mt-0.5">
                      {REWARD_TYPE_ICONS[reward.rewardType] ?? '🎁'}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-700 text-foreground">{reward.rewardDescription}</p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className="text-[10px] font-600 px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 border border-violet-200">
                          {REWARD_TYPE_LABELS[reward.rewardType] ?? reward.rewardType}
                        </span>
                        {reward.rewardValue > 0 && (
                          <span className="text-[10px] font-700 text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">
                            -{reward.rewardValue}%
                          </span>
                        )}
                        {isExpiringSoon && daysLeft !== null && (
                          <span className="text-[10px] font-600 text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                            ⏰ Expire dans {daysLeft}j
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-1">
                        Débloquée le {new Date(reward.unlockedAt).toLocaleDateString('fr-FR')} ·{' '}
                        {reward.pointsAtUnlock.toLocaleString('fr-FR')} pts
                        {reward.expiryDate && !isExpiringSoon && (
                          <> · Expire le {new Date(reward.expiryDate).toLocaleDateString('fr-FR')}</>
                        )}
                      </p>
                    </div>
                    <div
                      className={`shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                        isSelected ? 'border-violet-500 bg-violet-500' : 'border-border'
                      }`}
                    >
                      {isSelected && <Icon name="CheckIcon" size={12} className="text-white" />}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Next tier info */}
          {nextTier && (
            <div className="rounded-xl border border-border bg-muted/20 p-3">
              <div className="flex items-center gap-2">
                <span className="text-base">🔥</span>
                <p className="text-xs font-600 text-foreground">
                  Encore{' '}
                  <span className="text-primary font-700">
                    {pointsToNext.toLocaleString('fr-FR')} pts
                  </span>{' '}
                  pour débloquer : <span className="font-700">{nextTier.name}</span>
                </p>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1 ml-6">
                {nextTier.rewardDescription}
              </p>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="border-t border-border p-4 space-y-2">
          <button
            onClick={() => selectedReward && onUseNow(selectedReward)}
            disabled={!selectedReward}
            className="w-full py-3 bg-violet-600 text-white rounded-xl text-sm font-700 hover:bg-violet-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 active:scale-95"
          >
            <span>🎁</span>
            {selectedReward
              ? `Utiliser maintenant — ${selectedReward.rewardDescription}`
              : 'Sélectionner une récompense'}
          </button>
          <button
            onClick={onKeepForLater}
            className="w-full py-2.5 border border-border rounded-xl text-sm font-600 text-muted-foreground hover:bg-muted transition-colors flex items-center justify-center gap-2 active:scale-95"
          >
            <Icon name="ClockIcon" size={15} />
            Garder pour plus tard
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Newly Unlocked Rewards Modal (shown after payment) ────────────────────────

interface NewlyUnlockedRewardsModalProps {
  unlockedRewards: ClientLoyaltyReward[];
  nextTier: LoyaltyTier | null;
  pointsToNext: number;
  currentPoints: number;
  pointsEarned: number;
  onDismiss: () => void;
}

export function NewlyUnlockedRewardsModal({
  unlockedRewards,
  nextTier,
  pointsToNext,
  currentPoints,
  pointsEarned,
  onDismiss,
}: NewlyUnlockedRewardsModalProps) {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" />
      <div className="relative bg-white rounded-2xl shadow-modal w-full max-w-md mx-4 overflow-hidden">
        {/* Animated header */}
        <div className="bg-gradient-to-r from-amber-400 to-orange-500 px-6 py-5 text-white text-center">
          <div className="text-4xl mb-2 animate-bounce">🎉</div>
          <h2 className="text-xl font-700">Récompense débloquée !</h2>
          <p className="text-sm opacity-90 mt-1">
            +{pointsEarned} points · Total : {currentPoints.toLocaleString('fr-FR')} pts
          </p>
        </div>

        <div className="p-5 space-y-4 max-h-[50vh] overflow-y-auto">
          {unlockedRewards.map((reward) => (
            <div
              key={reward.id}
              className="rounded-xl border-2 border-amber-300 bg-amber-50 p-4"
            >
              <div className="flex items-start gap-3">
                <span className="text-2xl shrink-0">
                  {REWARD_TYPE_ICONS[reward.rewardType] ?? '🎁'}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-700 text-foreground">{reward.rewardDescription}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    Enregistrée dans votre compte · Disponible à tout moment
                  </p>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className="text-[10px] font-600 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">
                      {REWARD_TYPE_LABELS[reward.rewardType] ?? reward.rewardType}
                    </span>
                    {reward.rewardValue > 0 && (
                      <span className="text-[10px] font-700 text-rose-600">
                        -{reward.rewardValue}%
                      </span>
                    )}
                  </div>
                </div>
                <div className="shrink-0 w-8 h-8 rounded-full bg-amber-500 flex items-center justify-center">
                  <Icon name="CheckIcon" size={16} className="text-white" />
                </div>
              </div>
            </div>
          ))}

          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 flex items-center gap-2">
            <span className="text-base">✅</span>
            <p className="text-xs font-600 text-emerald-800">
              Récompense sauvegardée dans la fiche cliente. Elle sera proposée automatiquement au prochain passage en caisse.
            </p>
          </div>

          {nextTier && (
            <div className="rounded-xl border border-border bg-muted/20 p-3">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-600 text-foreground flex items-center gap-1">
                  🔥 Prochain palier : {nextTier.name}
                </span>
                <span className="text-[10px] text-muted-foreground tabular-nums">
                  Encore {pointsToNext.toLocaleString('fr-FR')} pts
                </span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-amber-400 to-orange-400 rounded-full transition-all"
                  style={{
                    width: `${Math.min(100, Math.max(5, ((currentPoints % nextTier.pointsRequired) / nextTier.pointsRequired) * 100))}%`,
                  }}
                />
              </div>
              <p className="text-[10px] text-muted-foreground mt-1 text-right tabular-nums">
                {currentPoints.toLocaleString('fr-FR')} / {nextTier.pointsRequired.toLocaleString('fr-FR')} pts
              </p>
            </div>
          )}
        </div>

        <div className="border-t border-border p-4">
          <button
            onClick={onDismiss}
            className="w-full py-3 bg-primary text-primary-foreground rounded-xl text-sm font-700 hover:opacity-90 transition-opacity flex items-center justify-center gap-2 active:scale-95"
          >
            <Icon name="CheckIcon" size={16} />
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Reward Applied Confirmation Banner ────────────────────────────────────────

interface RewardAppliedBannerProps {
  reward: ClientLoyaltyReward;
  discountAmount: number;
  onRemove: () => void;
}

export function RewardAppliedBanner({ reward, discountAmount, onRemove }: RewardAppliedBannerProps) {
  return (
    <div className="mx-3 mb-2 rounded-xl border-2 border-violet-300 bg-violet-50 px-3 py-2.5 flex items-center gap-2">
      <span className="text-base shrink-0">{REWARD_TYPE_ICONS[reward.rewardType] ?? '🎁'}</span>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-700 text-violet-800">Récompense appliquée</p>
        <p className="text-[10px] text-violet-600 truncate">{reward.rewardDescription}</p>
      </div>
      {discountAmount > 0 && (
        <span className="text-sm font-700 text-rose-600 shrink-0">-{discountAmount.toFixed(2)} €</span>
      )}
      <button
        onClick={onRemove}
        className="shrink-0 p-1 rounded-lg hover:bg-violet-200 text-violet-500 hover:text-violet-700 transition-colors"
        title="Retirer la récompense"
      >
        <Icon name="XMarkIcon" size={14} />
      </button>
    </div>
  );
}
