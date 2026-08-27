'use client';

// ── Types ──────────────────────────────────────────────────────────────────────

export type RewardType =
  | 'discount' |'free_product' |'double_points' |'private_offer' |'vip_access' |'buy_one_get_one' |'free_shipping' |'surprise_gift' |'category_discount' |'gift_category_pick';

export type RewardStatus = 'available' | 'used' | 'expired' | 'cancelled';

export interface LoyaltyTier {
  id: string;
  name: string;
  pointsRequired: number;
  rewardType: RewardType;
  rewardDescription: string;
  rewardValue: number;
  rewardProductId: string | null;
  categoryConstraint: string | null;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface LoyaltyRewardProduct {
  id: string;
  productName: string;
  sku: string | null;
  description: string | null;
  stockQuantity: number;
  rewardCategory: string;
  isActive: boolean;
  createdAt: string;
}

export interface LoyaltyRedemption {
  id: string;
  clientId: string;
  tierId: string | null;
  pointsAtRedemption: number;
  rewardType: string;
  rewardDescription: string;
  rewardValue: number;
  rewardProductId: string | null;
  status: 'pending' | 'validated' | 'cancelled';
  redeemedAt: string;
  cashierName: string | null;
  notes: string | null;
}

export interface LoyaltyDashboardStats {
  totalClients: number;
  totalPointsIssued: number;
  totalPointsUsed: number;
  totalRedemptions: number;
  avgBasket: number;
  topClients: TopLoyaltyClient[];
  rewardBreakdown: RewardBreakdown[];
  recentRedemptions: RecentRedemption[];
}

export interface TopLoyaltyClient {
  id: string;
  fullName: string;
  phone: string | null;
  loyaltyPoints: number;
  totalSpent: number;
  totalVisits: number;
  loyaltyTier: string | null;
}

export interface RewardBreakdown {
  rewardType: string;
  count: number;
  label: string;
}

export interface RecentRedemption {
  id: string;
  clientName: string;
  rewardDescription: string;
  rewardType: string;
  pointsAtRedemption: number;
  redeemedAt: string;
  status: string;
}

export interface CreateTierInput {
  name: string;
  pointsRequired: number;
  rewardType: RewardType;
  rewardDescription: string;
  rewardValue?: number;
  rewardProductId?: string | null;
  categoryConstraint?: string | null;
  isActive?: boolean;
  sortOrder?: number;
}

export interface CreateRedemptionInput {
  clientId: string;
  tierId?: string;
  pointsAtRedemption: number;
  rewardType: string;
  rewardDescription: string;
  rewardValue?: number;
  rewardProductId?: string | null;
  cashierName?: string;
  notes?: string;
}

export interface ClientLoyaltyReward {
  id: string;
  clientId: string;
  tierId: string | null;
  rewardType: string;
  rewardDescription: string;
  rewardValue: number;
  rewardProductId: string | null;
  status: RewardStatus;
  unlockedAt: string;
  pointsAtUnlock: number;
  expiryDate: string | null;
  usedAt: string | null;
  ticketRef: string | null;
  cashierName: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UseRewardInput {
  rewardId: string;
  ticketRef?: string;
  cashierName?: string;
  notes?: string;
}

// ── Mappers ────────────────────────────────────────────────────────────────────

function mapTier(row: any): LoyaltyTier {
  return {
    id: row.id,
    name: row.name,
    pointsRequired: row.points_required,
    rewardType: row.reward_type as RewardType,
    rewardDescription: row.reward_description,
    rewardValue: parseFloat(row.reward_value ?? 0),
    rewardProductId: row.reward_product_id ?? null,
    categoryConstraint: row.category_constraint ?? null,
    isActive: row.is_active,
    sortOrder: row.sort_order ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapRewardProduct(row: any): LoyaltyRewardProduct {
  return {
    id: row.id,
    productName: row.product_name,
    sku: row.sku ?? null,
    description: row.description ?? null,
    stockQuantity: row.stock_quantity ?? 0,
    rewardCategory: row.reward_category ?? 'gift',
    isActive: row.is_active,
    createdAt: row.created_at,
  };
}

function mapRedemption(row: any): LoyaltyRedemption {
  return {
    id: row.id,
    clientId: row.client_id,
    tierId: row.tier_id ?? null,
    pointsAtRedemption: row.points_at_redemption,
    rewardType: row.reward_type,
    rewardDescription: row.reward_description,
    rewardValue: parseFloat(row.reward_value ?? 0),
    rewardProductId: row.reward_product_id ?? null,
    status: row.status ?? 'pending',
    redeemedAt: row.redeemed_at,
    cashierName: row.cashier_name ?? null,
    notes: row.notes ?? null,
  };
}

function mapClientLoyaltyReward(row: any): ClientLoyaltyReward {
  return {
    id: row.id,
    clientId: row.client_id,
    tierId: row.tier_id ?? null,
    rewardType: row.reward_type,
    rewardDescription: row.reward_description,
    rewardValue: parseFloat(row.reward_value ?? 0),
    rewardProductId: row.reward_product_id ?? null,
    status: row.status as RewardStatus,
    unlockedAt: row.unlocked_at,
    pointsAtUnlock: row.points_at_unlock ?? 0,
    expiryDate: row.expiry_date ?? null,
    usedAt: row.used_at ?? null,
    ticketRef: row.ticket_ref ?? null,
    cashierName: row.cashier_name ?? null,
    notes: row.notes ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ── Reward type labels ─────────────────────────────────────────────────────────

export const REWARD_TYPE_LABELS: Record<string, string> = {
  discount: 'Réduction',
  free_product: 'Produit offert',
  double_points: 'Points doublés',
  private_offer: 'Offre privée',
  vip_access: 'Accès VIP',
  buy_one_get_one: '1 acheté = 1 offert',
  free_shipping: 'Livraison offerte',
  surprise_gift: 'Cadeau surprise',
  category_discount: 'Remise catégorie',
  gift_category_pick: 'Produit par catégorie',
};

export const REWARD_TYPE_ICONS: Record<string, string> = {
  discount: '🏷️',
  free_product: '🎁',
  double_points: '⚡',
  private_offer: '🔒',
  vip_access: '💎',
  buy_one_get_one: '🛍️',
  free_shipping: '📦',
  surprise_gift: '🎀',
  category_discount: '✂️',
  gift_category_pick: '🧴',
};

// ── Tier detection helper ──────────────────────────────────────────────────────

/**
 * Given current points and previous points, returns all newly unlocked tiers.
 */
export function detectUnlockedTiers(
  tiers: LoyaltyTier[],
  previousPoints: number,
  currentPoints: number
): LoyaltyTier[] {
  return tiers
    .filter((t) => t.isActive && t.pointsRequired > previousPoints && t.pointsRequired <= currentPoints)
    .sort((a, b) => a.pointsRequired - b.pointsRequired);
}

/**
 * Returns the next tier the client hasn't reached yet.
 */
export function getNextTier(tiers: LoyaltyTier[], currentPoints: number): LoyaltyTier | null {
  const sorted = [...tiers]
    .filter((t) => t.isActive && t.pointsRequired > currentPoints)
    .sort((a, b) => a.pointsRequired - b.pointsRequired);
  return sorted[0] ?? null;
}

/**
 * Points needed to reach the next tier.
 */
export function pointsToNextTier(tiers: LoyaltyTier[], currentPoints: number): number {
  const next = getNextTier(tiers, currentPoints);
  return next ? next.pointsRequired - currentPoints : 0;
}

/**
 * Returns the highest tier the client has already reached.
 */
export function getCurrentTier(tiers: LoyaltyTier[], currentPoints: number): LoyaltyTier | null {
  const sorted = [...tiers]
    .filter((t) => t.isActive && t.pointsRequired <= currentPoints)
    .sort((a, b) => b.pointsRequired - a.pointsRequired);
  return sorted[0] ?? null;
}

// ── Service ────────────────────────────────────────────────────────────────────

export const loyaltyService = {
  // ── Tiers ──────────────────────────────────────────────────────────────────

  async getTiers(): Promise<LoyaltyTier[]> {
    try {
      const res = await fetch('/api/loyalty/tiers');
      if (!res.ok) { console.log('loyaltyService.getTiers error:', res.status); return []; }
      return await res.json();
    } catch (e: any) { console.log('loyaltyService.getTiers exception:', e.message); return []; }
  },

  async createTier(input: CreateTierInput): Promise<LoyaltyTier | null> {
    try {
      const res = await fetch('/api/loyalty/tiers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { console.log('loyaltyService.createTier error:', json.error); return null; }
      return json as LoyaltyTier;
    } catch (e: any) { console.log('loyaltyService.createTier exception:', e.message); return null; }
  },

  async updateTier(id: string, input: Partial<CreateTierInput>): Promise<LoyaltyTier | null> {
    try {
      const res = await fetch(`/api/loyalty/tiers/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { console.log('loyaltyService.updateTier error:', json.error); return null; }
      return json as LoyaltyTier;
    } catch (e: any) { console.log('loyaltyService.updateTier exception:', e.message); return null; }
  },

  async deleteTier(id: string): Promise<boolean> {
    try {
      const res = await fetch(`/api/loyalty/tiers/${id}`, { method: 'DELETE' });
      if (!res.ok) { const j = await res.json().catch(() => ({})); console.log('loyaltyService.deleteTier error:', j.error); return false; }
      return true;
    } catch (e: any) { console.log('loyaltyService.deleteTier exception:', e.message); return false; }
  },

  // ── Reward Products ────────────────────────────────────────────────────────

  async getRewardProductById(id: string): Promise<LoyaltyRewardProduct | null> {
    try {
      const res = await fetch(`/api/loyalty/reward-products/${id}`);
      if (!res.ok) { console.log('loyaltyService.getRewardProductById error:', res.status); return null; }
      const data = await res.json();
      return data ? mapRewardProduct(data) : null;
    } catch (e: any) { console.log('loyaltyService.getRewardProductById exception:', e.message); return null; }
  },

  async deleteRewardProduct(id: string): Promise<boolean> {
    try {
      const res = await fetch(`/api/loyalty/reward-products/${id}`, { method: 'DELETE' });
      if (!res.ok) { const j = await res.json().catch(() => ({})); console.log('loyaltyService.deleteRewardProduct error:', j.error); return false; }
      return true;
    } catch (e: any) { console.log('loyaltyService.deleteRewardProduct exception:', e.message); return false; }
  },

  async getRewardProducts(): Promise<LoyaltyRewardProduct[]> {
    try {
      const res = await fetch('/api/loyalty/reward-products');
      if (!res.ok) { console.log('loyaltyService.getRewardProducts error:', res.status); return []; }
      const data = await res.json();
      return (data ?? []).map(mapRewardProduct);
    } catch (e: any) { console.log('loyaltyService.getRewardProducts exception:', e.message); return []; }
  },

  async getRewardProductsByCategory(category: string): Promise<LoyaltyRewardProduct[]> {
    try {
      const res = await fetch(`/api/loyalty/reward-products?category=${encodeURIComponent(category)}`);
      if (!res.ok) { console.log('loyaltyService.getRewardProductsByCategory error:', res.status); return []; }
      const data = await res.json();
      return (data ?? []).map(mapRewardProduct);
    } catch (e: any) { console.log('loyaltyService.getRewardProductsByCategory exception:', e.message); return []; }
  },

  async createRewardProduct(input: Omit<LoyaltyRewardProduct, 'id' | 'createdAt'>): Promise<LoyaltyRewardProduct | null> {
    try {
      const res = await fetch('/api/loyalty/reward-products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productName: input.productName,
          sku: input.sku ?? null,
          description: input.description ?? null,
          stockQuantity: input.stockQuantity ?? 0,
          rewardCategory: input.rewardCategory ?? 'gift',
          isActive: input.isActive ?? true,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { console.log('loyaltyService.createRewardProduct error:', json.error); return null; }
      return mapRewardProduct(json);
    } catch (e: any) { console.log('loyaltyService.createRewardProduct exception:', e.message); return null; }
  },

  async updateRewardProduct(id: string, input: Partial<LoyaltyRewardProduct>): Promise<LoyaltyRewardProduct | null> {
    try {
      const res = await fetch(`/api/loyalty/reward-products/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productName: input.productName,
          sku: input.sku,
          description: input.description,
          stockQuantity: input.stockQuantity,
          rewardCategory: input.rewardCategory,
          isActive: input.isActive,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { console.log('loyaltyService.updateRewardProduct error:', json.error); return null; }
      return mapRewardProduct(json);
    } catch (e: any) { console.log('loyaltyService.updateRewardProduct exception:', e.message); return null; }
  },

  // ── Redemptions ────────────────────────────────────────────────────────────

  async getRedemptions(limit = 50): Promise<LoyaltyRedemption[]> {
    try {
      const res = await fetch(`/api/loyalty/redemptions?limit=${limit}`);
      if (!res.ok) { console.log('loyaltyService.getRedemptions error:', res.status); return []; }
      const data = await res.json();
      return (data ?? []).map(mapRedemption);
    } catch (e: any) { console.log('loyaltyService.getRedemptions exception:', e.message); return []; }
  },

  async getClientRedemptions(clientId: string): Promise<LoyaltyRedemption[]> {
    try {
      const res = await fetch(`/api/loyalty/redemptions?clientId=${clientId}&limit=200`);
      if (!res.ok) { console.log('loyaltyService.getClientRedemptions error:', res.status); return []; }
      const data = await res.json();
      return (data ?? []).map(mapRedemption);
    } catch (e: any) { console.log('loyaltyService.getClientRedemptions exception:', e.message); return []; }
  },

  async createRedemption(input: CreateRedemptionInput): Promise<LoyaltyRedemption | null> {
    try {
      const res = await fetch('/api/loyalty/redemptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: input.clientId,
          tierId: input.tierId ?? null,
          pointsAtRedemption: input.pointsAtRedemption,
          rewardType: input.rewardType,
          rewardDescription: input.rewardDescription,
          rewardValue: input.rewardValue ?? 0,
          rewardProductId: input.rewardProductId ?? null,
          cashierName: input.cashierName ?? null,
          notes: input.notes ?? null,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { console.log('loyaltyService.createRedemption error:', json.error); return null; }
      return mapRedemption(json);
    } catch (e: any) { console.log('loyaltyService.createRedemption exception:', e.message); return null; }
  },

  async validateRedemption(id: string): Promise<boolean> {
    try {
      const res = await fetch(`/api/loyalty/redemptions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'validated' }),
      });
      if (!res.ok) { const j = await res.json().catch(() => ({})); console.log('loyaltyService.validateRedemption error:', j.error); return false; }
      return true;
    } catch (e: any) { console.log('loyaltyService.validateRedemption exception:', e.message); return false; }
  },

  // ── Client Loyalty Rewards (Persistent) ───────────────────────────────────

  /**
   * Get all rewards for a client (all statuses)
   */
  async getClientRewards(clientId: string): Promise<ClientLoyaltyReward[]> {
    try {
      const res = await fetch(`/api/loyalty/client-rewards?clientId=${clientId}`);
      if (!res.ok) { console.log('loyaltyService.getClientRewards error:', res.status); return []; }
      const json = await res.json();
      return (json.all ?? []).map(mapClientLoyaltyReward);
    } catch (e: any) { console.log('loyaltyService.getClientRewards exception:', e.message); return []; }
  },

  async getClientAvailableRewards(clientId: string): Promise<ClientLoyaltyReward[]> {
    try {
      const res = await fetch(`/api/loyalty/client-rewards?clientId=${clientId}`);
      if (!res.ok) { console.log('loyaltyService.getClientAvailableRewards error:', res.status); return []; }
      const json = await res.json();
      return (json.available ?? []).map(mapClientLoyaltyReward);
    } catch (e: any) { console.log('loyaltyService.getClientAvailableRewards exception:', e.message); return []; }
  },

  async unlockRewardForClient(
    clientId: string,
    tier: LoyaltyTier,
    pointsAtUnlock: number,
    expiryDays?: number
  ): Promise<ClientLoyaltyReward | null> {
    try {
      const res = await fetch('/api/loyalty/client-rewards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId,
          tierId: tier.id,
          rewardType: tier.rewardType,
          rewardDescription: tier.rewardDescription,
          rewardValue: tier.rewardValue,
          rewardProductId: tier.rewardProductId ?? null,
          pointsAtUnlock,
          expiryDays: expiryDays ?? null,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { console.log('loyaltyService.unlockRewardForClient error:', json.error); return null; }
      return mapClientLoyaltyReward(json);
    } catch (e: any) { console.log('loyaltyService.unlockRewardForClient exception:', e.message); return null; }
  },

  async useReward(input: UseRewardInput): Promise<ClientLoyaltyReward | null> {
    try {
      const res = await fetch('/api/loyalty/client-rewards', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rewardId: input.rewardId,
          action: 'use',
          ticketRef: input.ticketRef ?? null,
          cashierName: input.cashierName ?? null,
          notes: input.notes ?? null,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { console.log('loyaltyService.useReward error:', json.error); return null; }
      return mapClientLoyaltyReward(json);
    } catch (e: any) { console.log('loyaltyService.useReward exception:', e.message); return null; }
  },

  async cancelReward(rewardId: string): Promise<boolean> {
    try {
      const res = await fetch('/api/loyalty/client-rewards', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rewardId, action: 'cancel' }),
      });
      if (!res.ok) { const j = await res.json().catch(() => ({})); console.log('loyaltyService.cancelReward error:', j.error); return false; }
      return true;
    } catch (e: any) { console.log('loyaltyService.cancelReward exception:', e.message); return false; }
  },

  /**
   * Get rewards expiring soon (within X days) for a client
   */
  async getExpiringSoonRewards(clientId: string, withinDays = 7): Promise<ClientLoyaltyReward[]> {
    try {
      // Reuse client-rewards API and filter expiring soon on the client side
      const res = await fetch(`/api/loyalty/client-rewards?clientId=${clientId}`);
      if (!res.ok) { console.log('loyaltyService.getExpiringSoonRewards error:', res.status); return []; }
      const json = await res.json();
      const cutoff = new Date(Date.now() + withinDays * 24 * 60 * 60 * 1000);
      const now = new Date();
      return (json.available ?? [])
        .map(mapClientLoyaltyReward)
        .filter((r: ClientLoyaltyReward) => r.expiryDate && new Date(r.expiryDate) > now && new Date(r.expiryDate) <= cutoff);
    } catch (e: any) { console.log('loyaltyService.getExpiringSoonRewards exception:', e.message); return []; }
  },

  // ── Dashboard Stats ────────────────────────────────────────────────────────

  async getDashboardStats(): Promise<LoyaltyDashboardStats> {
    try {
      const res = await fetch('/api/loyalty/dashboard-stats');
      if (!res.ok) { console.log('loyaltyService.getDashboardStats error:', res.status); throw new Error('fetch failed'); }
      return await res.json();
    } catch (e: any) {
      console.log('loyaltyService.getDashboardStats exception:', e.message);
      return {
        totalClients: 0,
        totalPointsIssued: 0,
        totalPointsUsed: 0,
        totalRedemptions: 0,
        avgBasket: 0,
        topClients: [],
        rewardBreakdown: [],
        recentRedemptions: [],
      };
    }
  },
};
