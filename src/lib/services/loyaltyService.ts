'use client';

import { createClient } from '@/lib/supabase/client';
import { fetchAll } from '@/lib/utils/fetchAll';

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
    const supabase = createClient();
    try {
      const { data, error } = await supabase
        .from('loyalty_tiers')
        .select('*')
        .order('points_required', { ascending: true });
      if (error) { console.log('loyaltyService.getTiers error:', error.message); return []; }
      return (data ?? []).map(mapTier);
    } catch (e: any) { console.log('loyaltyService.getTiers exception:', e.message); return []; }
  },

  async createTier(input: CreateTierInput): Promise<LoyaltyTier | null> {
    const supabase = createClient();
    try {
      const { data, error } = await supabase
        .from('loyalty_tiers')
        .insert({
          name: input.name,
          points_required: input.pointsRequired,
          reward_type: input.rewardType,
          reward_description: input.rewardDescription,
          reward_value: input.rewardValue ?? 0,
          reward_product_id: input.rewardProductId ?? null,
          is_active: input.isActive ?? true,
          sort_order: input.sortOrder ?? 0,
        })
        .select()
        .single();
      if (error) { console.log('loyaltyService.createTier error:', error.message); return null; }
      return data ? mapTier(data) : null;
    } catch (e: any) { console.log('loyaltyService.createTier exception:', e.message); return null; }
  },

  async updateTier(id: string, input: Partial<CreateTierInput>): Promise<LoyaltyTier | null> {
    const supabase = createClient();
    try {
      const updateData: any = {};
      if (input.name !== undefined) updateData.name = input.name;
      if (input.pointsRequired !== undefined) updateData.points_required = input.pointsRequired;
      if (input.rewardType !== undefined) updateData.reward_type = input.rewardType;
      if (input.rewardDescription !== undefined) updateData.reward_description = input.rewardDescription;
      if (input.rewardValue !== undefined) updateData.reward_value = input.rewardValue;
      if (input.rewardProductId !== undefined) updateData.reward_product_id = input.rewardProductId;
      if (input.isActive !== undefined) updateData.is_active = input.isActive;
      if (input.sortOrder !== undefined) updateData.sort_order = input.sortOrder;

      const { data, error } = await supabase
        .from('loyalty_tiers')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();
      if (error) { console.log('loyaltyService.updateTier error:', error.message); return null; }
      return data ? mapTier(data) : null;
    } catch (e: any) { console.log('loyaltyService.updateTier exception:', e.message); return null; }
  },

  async deleteTier(id: string): Promise<boolean> {
    const supabase = createClient();
    try {
      const { error } = await supabase.from('loyalty_tiers').delete().eq('id', id);
      if (error) { console.log('loyaltyService.deleteTier error:', error.message); return false; }
      return true;
    } catch (e: any) { console.log('loyaltyService.deleteTier exception:', e.message); return false; }
  },

  // ── Reward Products ────────────────────────────────────────────────────────

  async getRewardProductById(id: string): Promise<LoyaltyRewardProduct | null> {
    const supabase = createClient();
    try {
      const { data, error } = await supabase
        .from('loyalty_reward_products')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (error) { console.log('loyaltyService.getRewardProductById error:', error.message); return null; }
      return data ? mapRewardProduct(data) : null;
    } catch (e: any) { console.log('loyaltyService.getRewardProductById exception:', e.message); return null; }
  },

  async deleteRewardProduct(id: string): Promise<boolean> {
    const supabase = createClient();
    try {
      const { error } = await supabase
        .from('loyalty_reward_products')
        .delete()
        .eq('id', id);
      if (error) { console.log('loyaltyService.deleteRewardProduct error:', error.message); return false; }
      return true;
    } catch (e: any) { console.log('loyaltyService.deleteRewardProduct exception:', e.message); return false; }
  },

  async getRewardProducts(): Promise<LoyaltyRewardProduct[]> {
    const supabase = createClient();
    try {
      const { data, error } = await supabase
        .from('loyalty_reward_products')
        .select('*')
        .eq('is_active', true)
        .order('product_name', { ascending: true });
      if (error) { console.log('loyaltyService.getRewardProducts error:', error.message); return []; }
      return (data ?? []).map(mapRewardProduct);
    } catch (e: any) { console.log('loyaltyService.getRewardProducts exception:', e.message); return []; }
  },

  async getRewardProductsByCategory(category: string): Promise<LoyaltyRewardProduct[]> {
    const supabase = createClient();
    try {
      const { data, error } = await supabase
        .from('loyalty_reward_products')
        .select('*')
        .eq('is_active', true)
        .eq('reward_category', category)
        .order('product_name', { ascending: true });
      if (error) { console.log('loyaltyService.getRewardProductsByCategory error:', error.message); return []; }
      return (data ?? []).map(mapRewardProduct);
    } catch (e: any) { console.log('loyaltyService.getRewardProductsByCategory exception:', e.message); return []; }
  },

  async createRewardProduct(input: Omit<LoyaltyRewardProduct, 'id' | 'createdAt'>): Promise<LoyaltyRewardProduct | null> {
    const supabase = createClient();
    try {
      const { data, error } = await supabase
        .from('loyalty_reward_products')
        .insert({
          product_name: input.productName,
          sku: input.sku ?? null,
          description: input.description ?? null,
          stock_quantity: input.stockQuantity ?? 0,
          reward_category: input.rewardCategory ?? 'gift',
          is_active: input.isActive ?? true,
        })
        .select()
        .single();
      if (error) { console.log('loyaltyService.createRewardProduct error:', error.message); return null; }
      return data ? mapRewardProduct(data) : null;
    } catch (e: any) { console.log('loyaltyService.createRewardProduct exception:', e.message); return null; }
  },

  async updateRewardProduct(id: string, input: Partial<LoyaltyRewardProduct>): Promise<LoyaltyRewardProduct | null> {
    const supabase = createClient();
    try {
      const updateData: any = {};
      if (input.productName !== undefined) updateData.product_name = input.productName;
      if (input.sku !== undefined) updateData.sku = input.sku;
      if (input.description !== undefined) updateData.description = input.description;
      if (input.stockQuantity !== undefined) updateData.stock_quantity = input.stockQuantity;
      if (input.rewardCategory !== undefined) updateData.reward_category = input.rewardCategory;
      if (input.isActive !== undefined) updateData.is_active = input.isActive;

      const { data, error } = await supabase
        .from('loyalty_reward_products')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();
      if (error) { console.log('loyaltyService.updateRewardProduct error:', error.message); return null; }
      return data ? mapRewardProduct(data) : null;
    } catch (e: any) { console.log('loyaltyService.updateRewardProduct exception:', e.message); return null; }
  },

  // ── Redemptions ────────────────────────────────────────────────────────────

  async getRedemptions(limit = 50): Promise<LoyaltyRedemption[]> {
    const supabase = createClient();
    try {
      const { data, error } = await supabase
        .from('loyalty_redemptions')
        .select('*')
        .order('redeemed_at', { ascending: false })
        .limit(limit);
      if (error) { console.log('loyaltyService.getRedemptions error:', error.message); return []; }
      return (data ?? []).map(mapRedemption);
    } catch (e: any) { console.log('loyaltyService.getRedemptions exception:', e.message); return []; }
  },

  async getClientRedemptions(clientId: string): Promise<LoyaltyRedemption[]> {
    const supabase = createClient();
    try {
      const { data, error } = await supabase
        .from('loyalty_redemptions')
        .select('*')
        .eq('client_id', clientId)
        .order('redeemed_at', { ascending: false });
      if (error) { console.log('loyaltyService.getClientRedemptions error:', error.message); return []; }
      return (data ?? []).map(mapRedemption);
    } catch (e: any) { console.log('loyaltyService.getClientRedemptions exception:', e.message); return []; }
  },

  async createRedemption(input: CreateRedemptionInput): Promise<LoyaltyRedemption | null> {
    const supabase = createClient();
    try {
      const { data, error } = await supabase
        .from('loyalty_redemptions')
        .insert({
          client_id: input.clientId,
          tier_id: input.tierId ?? null,
          points_at_redemption: input.pointsAtRedemption,
          reward_type: input.rewardType,
          reward_description: input.rewardDescription,
          reward_value: input.rewardValue ?? 0,
          reward_product_id: input.rewardProductId ?? null,
          status: 'pending',
          cashier_name: input.cashierName ?? null,
          notes: input.notes ?? null,
        })
        .select()
        .single();
      if (error) { console.log('loyaltyService.createRedemption error:', error.message); return null; }
      return data ? mapRedemption(data) : null;
    } catch (e: any) { console.log('loyaltyService.createRedemption exception:', e.message); return null; }
  },

  async validateRedemption(id: string): Promise<boolean> {
    const supabase = createClient();
    try {
      const { error } = await supabase
        .from('loyalty_redemptions')
        .update({ status: 'validated' })
        .eq('id', id);
      if (error) { console.log('loyaltyService.validateRedemption error:', error.message); return false; }
      return true;
    } catch (e: any) { console.log('loyaltyService.validateRedemption exception:', e.message); return false; }
  },

  // ── Client Loyalty Rewards (Persistent) ───────────────────────────────────

  /**
   * Get all rewards for a client (all statuses)
   */
  async getClientRewards(clientId: string): Promise<ClientLoyaltyReward[]> {
    const supabase = createClient();
    try {
      const { data, error } = await supabase
        .from('client_loyalty_rewards')
        .select('*')
        .eq('client_id', clientId)
        .order('unlocked_at', { ascending: false });
      if (error) { console.log('loyaltyService.getClientRewards error:', error.message); return []; }
      return (data ?? []).map(mapClientLoyaltyReward);
    } catch (e: any) { console.log('loyaltyService.getClientRewards exception:', e.message); return []; }
  },

  /**
   * Get only available (unused, non-expired) rewards for a client
   */
  async getClientAvailableRewards(clientId: string): Promise<ClientLoyaltyReward[]> {
    const supabase = createClient();
    try {
      const { data, error } = await supabase
        .from('client_loyalty_rewards')
        .select('*')
        .eq('client_id', clientId)
        .eq('status', 'available')
        .order('unlocked_at', { ascending: true });
      if (error) { console.log('loyaltyService.getClientAvailableRewards error:', error.message); return []; }
      // Filter out expired ones (expiry_date passed)
      const now = new Date();
      return (data ?? [])
        .map(mapClientLoyaltyReward)
        .filter((r) => !r.expiryDate || new Date(r.expiryDate) > now);
    } catch (e: any) { console.log('loyaltyService.getClientAvailableRewards exception:', e.message); return []; }
  },

  /**
   * Unlock a reward for a client when they reach a tier
   */
  async unlockRewardForClient(
    clientId: string,
    tier: LoyaltyTier,
    pointsAtUnlock: number,
    expiryDays?: number
  ): Promise<ClientLoyaltyReward | null> {
    const supabase = createClient();
    try {
      const expiryDate = expiryDays
        ? new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000).toISOString()
        : null;
      const { data, error } = await supabase
        .from('client_loyalty_rewards')
        .insert({
          client_id: clientId,
          tier_id: tier.id,
          reward_type: tier.rewardType,
          reward_description: tier.rewardDescription,
          reward_value: tier.rewardValue,
          reward_product_id: tier.rewardProductId ?? null,
          status: 'available',
          points_at_unlock: pointsAtUnlock,
          expiry_date: expiryDate,
        })
        .select()
        .single();
      if (error) { console.log('loyaltyService.unlockRewardForClient error:', error.message); return null; }
      return data ? mapClientLoyaltyReward(data) : null;
    } catch (e: any) { console.log('loyaltyService.unlockRewardForClient exception:', e.message); return null; }
  },

  /**
   * Mark a reward as used (applied at checkout)
   */
  async useReward(input: UseRewardInput): Promise<ClientLoyaltyReward | null> {
    const supabase = createClient();
    try {
      const { data, error } = await supabase
        .from('client_loyalty_rewards')
        .update({
          status: 'used',
          used_at: new Date().toISOString(),
          ticket_ref: input.ticketRef ?? null,
          cashier_name: input.cashierName ?? null,
          notes: input.notes ?? null,
        })
        .eq('id', input.rewardId)
        .eq('status', 'available')
        .select()
        .single();
      if (error) { console.log('loyaltyService.useReward error:', error.message); return null; }
      return data ? mapClientLoyaltyReward(data) : null;
    } catch (e: any) { console.log('loyaltyService.useReward exception:', e.message); return null; }
  },

  /**
   * Cancel a reward (admin action)
   */
  async cancelReward(rewardId: string): Promise<boolean> {
    const supabase = createClient();
    try {
      const { error } = await supabase
        .from('client_loyalty_rewards')
        .update({ status: 'cancelled' })
        .eq('id', rewardId);
      if (error) { console.log('loyaltyService.cancelReward error:', error.message); return false; }
      return true;
    } catch (e: any) { console.log('loyaltyService.cancelReward exception:', e.message); return false; }
  },

  /**
   * Get rewards expiring soon (within X days) for a client
   */
  async getExpiringSoonRewards(clientId: string, withinDays = 7): Promise<ClientLoyaltyReward[]> {
    const supabase = createClient();
    try {
      const cutoff = new Date(Date.now() + withinDays * 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from('client_loyalty_rewards')
        .select('*')
        .eq('client_id', clientId)
        .eq('status', 'available')
        .not('expiry_date', 'is', null)
        .lte('expiry_date', cutoff)
        .order('expiry_date', { ascending: true });
      if (error) { console.log('loyaltyService.getExpiringSoonRewards error:', error.message); return []; }
      const now = new Date();
      return (data ?? [])
        .map(mapClientLoyaltyReward)
        .filter((r) => r.expiryDate && new Date(r.expiryDate) > now);
    } catch (e: any) { console.log('loyaltyService.getExpiringSoonRewards exception:', e.message); return []; }
  },

  // ── Dashboard Stats ────────────────────────────────────────────────────────

  async getDashboardStats(): Promise<LoyaltyDashboardStats> {
    const supabase = createClient();
    try {
      // 1. Exact client count (no limit — just a count query)
      const { count: clientCount } = await supabase
        .from('clients')
        .select('*', { count: 'exact', head: true })
        .eq('is_active', true);
      const totalClients = clientCount ?? 0;

      // 2. Top 10 clients by points — fetch raw rows only (no limit beyond 10)
      const { data: topRaw } = await supabase
        .from('clients')
        .select('id, first_name, last_name, loyalty_points, loyalty_tier, phone')
        .eq('is_active', true)
        .order('loyalty_points', { ascending: false })
        .limit(10);

      // 3. Total points issued = SUM(loyalty_points) across ALL active clients
      //    (one lightweight column, paginated for correctness at scale)
      const allPointsRows = await fetchAll<{ loyalty_points: number }>((from, to) =>
        supabase.from('clients').select('loyalty_points').eq('is_active', true).range(from, to)
      );
      const totalPointsIssued = allPointsRows.reduce((s, c) => s + (c.loyalty_points ?? 0), 0);

      // 4. Points used = sum of negative loyalty_transaction changes
      const negTx = await fetchAll<{ points_change: number }>((from, to) =>
        supabase
          .from('loyalty_transactions')
          .select('points_change')
          .lt('points_change', 0)
          .range(from, to)
      );
      const totalPointsUsed = negTx.reduce((s, t) => s + Math.abs(t.points_change ?? 0), 0);

      // 5. Redemptions (for count, breakdown, recent list)
      const { data: redemptions } = await supabase
        .from('loyalty_redemptions')
        .select('*')
        .order('redeemed_at', { ascending: false })
        .limit(200);
      const allRedemptions = redemptions ?? [];

      // 6. Avg basket from real receipts (payment_type = 'sale')
      const receiptTotals = await fetchAll<{ total_amount: number }>((from, to) =>
        supabase
          .from('receipts')
          .select('total_amount')
          .eq('payment_type', 'sale')
          .gt('total_amount', 0)
          .range(from, to)
      );
      const avgBasket = receiptTotals.length > 0
        ? receiptTotals.reduce((s, r) => s + parseFloat(String(r.total_amount ?? 0)), 0) / receiptTotals.length
        : 0;

      // 7. Top clients — pull real totals from receipts table
      const topClientIds = (topRaw ?? []).map((c: any) => c.id);
      let receiptsByClient: Record<string, { total: number; count: number }> = {};
      if (topClientIds.length > 0) {
        const { data: clientReceipts } = await supabase
          .from('receipts')
          .select('client_id, total_amount')
          .in('client_id', topClientIds)
          .eq('payment_type', 'sale');
        for (const r of clientReceipts ?? []) {
          if (!r.client_id) continue;
          if (!receiptsByClient[r.client_id]) receiptsByClient[r.client_id] = { total: 0, count: 0 };
          receiptsByClient[r.client_id].total += parseFloat(String(r.total_amount ?? 0));
          receiptsByClient[r.client_id].count += 1;
        }
      }

      const topClients: TopLoyaltyClient[] = (topRaw ?? []).map((c: any) => {
        const stats = receiptsByClient[c.id];
        return {
          id: c.id,
          fullName: `${c.first_name} ${c.last_name}`,
          phone: c.phone ?? null,
          loyaltyPoints: c.loyalty_points ?? 0,
          totalSpent: stats?.total ?? 0,
          totalVisits: stats?.count ?? 0,
          loyaltyTier: c.loyalty_tier || null,
        };
      });

      // 8. Reward breakdown from real redemptions
      const rewardMap: Record<string, number> = {};
      for (const r of allRedemptions) {
        rewardMap[r.reward_type] = (rewardMap[r.reward_type] ?? 0) + 1;
      }
      const rewardBreakdown: RewardBreakdown[] = Object.entries(rewardMap).map(([type, count]) => ({
        rewardType: type,
        count,
        label: REWARD_TYPE_LABELS[type] ?? type,
      }));

      // 9. Recent redemptions — fetch client names for ids not in top-10
      const redemptionClientIds = [...new Set(allRedemptions.slice(0, 20).map((r: any) => r.client_id).filter(Boolean))];
      const missingIds = redemptionClientIds.filter((id) => !(topRaw ?? []).some((c: any) => c.id === id));
      const clientNameMap: Record<string, string> = {};
      for (const c of topRaw ?? []) {
        clientNameMap[c.id] = `${c.first_name} ${c.last_name}`;
      }
      if (missingIds.length > 0) {
        const { data: extraClients } = await supabase
          .from('clients')
          .select('id, first_name, last_name')
          .in('id', missingIds);
        for (const c of extraClients ?? []) {
          clientNameMap[c.id] = `${c.first_name} ${c.last_name}`;
        }
      }

      const recentRedemptions: RecentRedemption[] = allRedemptions.slice(0, 20).map((r: any) => ({
        id: r.id,
        clientName: clientNameMap[r.client_id] ?? 'Client inconnu',
        rewardDescription: r.reward_description,
        rewardType: r.reward_type,
        pointsAtRedemption: r.points_at_redemption,
        redeemedAt: r.redeemed_at,
        status: r.status ?? 'pending',
      }));

      return {
        totalClients,
        totalPointsIssued,
        totalPointsUsed,
        totalRedemptions: allRedemptions.length,
        avgBasket,
        topClients,
        rewardBreakdown,
        recentRedemptions,
      };
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
