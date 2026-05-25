'use client';

import React, { useState, useCallback, useEffect } from 'react';
import ProductGrid from './ProductGrid';
import CartPanel from './CartPanel';
import HeldTicketsDrawer from './HeldTicketsDrawer';
import PaymentModal from './PaymentModal';
import ClientLookupBar from './ClientLookupBar';
import FreePriceModal from './FreePriceModal';
import EmployeePINModal from './EmployeePINModal';
import POSPinScreen from './POSPinScreen';
import LoyaltyRewardNotification from './LoyaltyRewardNotification';
import { AvailableRewardsModal, NewlyUnlockedRewardsModal, RewardAppliedBanner } from './LoyaltyRewardModals';
import { usePOSAuth } from '@/contexts/POSAuthContext';
import { toast } from 'sonner';
import Icon from '@/components/ui/AppIcon';
import { useBarcodeScanner, useCameraBarcodeScanner } from '@/hooks/useBarcodeScanner';
import { fetchProductByBarcode, deductStockForSale, fetchProductStockById } from '@/lib/services/stockService';
import {
  loyaltyService,
  detectUnlockedTiers,
  getNextTier,
  pointsToNextTier,
  type LoyaltyTier,
  type ClientLoyaltyReward,
} from '@/lib/services/loyaltyService';
import { clientService } from '@/lib/services/clientService';
import {
  sendReceiptEmail,
  generateTicketNumber,
  todayFR,
  type ReceiptEmailData,
} from '@/lib/services/emailService';
import { saveReceipt } from '@/lib/services/posService';
import { useSettings } from '@/contexts/SettingsContext';

export interface CartItem {
  id: string;
  productId: string;
  name: string;
  sku: string;
  price: number;
  qty: number;
  discount: number;
  discountType: 'percent' | 'amount';
  tva: number;
  isFreePrice?: boolean;
  imageUrl?: string;
  variantName?: string;
  costPrice?: number;
}

export interface HeldTicket {
  id: string;
  label: string;
  items: CartItem[];
  client?: string;
  heldAt: string;
}

export interface POSClient {
  id: string;
  name: string;
  phone: string;
  points: number;
  balance: number;
  discount?: number;
  clientType?: string;
  subscriptionStatus?: string | null;
  subscriptionType?: string | null;
}

const TAX_RATE = 0.085; // fallback — overridden by settings context at runtime

function calcItemTotal(item: CartItem): number {
  const base = item.price * item.qty;
  const disc = item.discountType === 'percent' ? base * (item.discount / 100) : item.discount;
  return Math.max(0, base - disc);
}

export default function POSTerminal() {
  const { employee, isLocked, logout, logAction } = usePOSAuth();
  const { tvaRate: settingsTvaRate } = useSettings();
  // Use live TVA rate from settings (e.g. 8.5% → 0.085)
  const LIVE_TAX_RATE = settingsTvaRate;

  const [cart, setCart] = useState<CartItem[]>([]);
  const [client, setClient] = useState<POSClient | null>(null);
  const [heldTickets, setHeldTickets] = useState<HeldTicket[]>([]);
  const [showHeld, setShowHeld] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [showFreePrice, setShowFreePrice] = useState(false);
  const [paymentMode, setPaymentMode] = useState<'immediate' | 'acompte' | 'installment'>('immediate');

  // Camera scanner state
  const [showCameraScanner, setShowCameraScanner] = useState(false);
  const [cameraManualBarcode, setCameraManualBarcode] = useState('');

  // Loyalty state
  const [loyaltyTiers, setLoyaltyTiers] = useState<LoyaltyTier[]>([]);
  const [loyaltyNotification, setLoyaltyNotification] = useState<{
    unlockedTiers: LoyaltyTier[];
    nextTier: LoyaltyTier | null;
    pointsToNext: number;
    currentPoints: number;
    pointsEarned: number;
  } | null>(null);

  // Available rewards state (shown when client is selected)
  const [availableRewards, setAvailableRewards] = useState<ClientLoyaltyReward[]>([]);
  const [showAvailableRewards, setShowAvailableRewards] = useState(false);
  const [appliedReward, setAppliedReward] = useState<ClientLoyaltyReward | null>(null);
  // Newly unlocked rewards (shown after payment)
  const [newlyUnlockedRewards, setNewlyUnlockedRewards] = useState<{
    rewards: ClientLoyaltyReward[];
    nextTier: LoyaltyTier | null;
    pointsToNext: number;
    currentPoints: number;
    pointsEarned: number;
  } | null>(null);

  const [barcodeStatus, setBarcodeStatus] = useState<'idle' | 'scanning' | 'found' | 'notfound'>('idle');

  // Load loyalty tiers on mount
  useEffect(() => {
    loyaltyService.getTiers().then(setLoyaltyTiers);
  }, []);

  const addToCart = useCallback(async (product: { id: string; name: string; sku: string; price: number; imageUrl?: string; stock?: number; variantName?: string; costPrice?: number }) => {
    // Check current stock before adding
    const currentQtyInCart = cart.reduce((sum, i) => i.productId === product.id && i.variantName === product.variantName && !i.isFreePrice ? sum + i.qty : sum, 0);

    // If stock info passed directly, use it; otherwise fetch from DB
    let availableStock = product.stock ?? 999;
    if (product.stock === undefined && !product.id.startsWith('free-')) {
      const stockInfo = await fetchProductStockById(product.id);
      if (stockInfo !== null) availableStock = stockInfo.stock;
    }

    if (availableStock === 0) {
      toast.error(`"${product.name}" est en rupture de stock`, { duration: 3000, icon: '🚫' });
      return;
    }

    if (currentQtyInCart >= availableStock) {
      toast.error(`Stock insuffisant pour "${product.name}" — Stock disponible : ${availableStock}`, { duration: 3500, icon: '⚠️' });
      return;
    }

    setCart((prev) => {
      const existing = prev.find((i) => i.productId === product.id && i.variantName === product.variantName && !i.isFreePrice);
      if (existing) {
        return prev.map((i) => i.productId === product.id && i.variantName === product.variantName && !i.isFreePrice ? { ...i, qty: i.qty + 1 } : i);
      }
      const displayName = product.variantName ? `${product.name} — ${product.variantName}` : product.name;
      return [...prev, {
        id: `ci-${product.id}-${product.variantName ?? ''}-${Date.now()}`,
        productId: product.id,
        name: displayName,
        sku: product.sku,
        price: product.price,
        qty: 1,
        discount: 0,
        discountType: 'percent',
        tva: LIVE_TAX_RATE,
        imageUrl: product.imageUrl,
        variantName: product.variantName,
        costPrice: product.costPrice,
      }];
    });
  }, [cart]);

  // ── Barcode scanner handler ───────────────────────────────────────────────
  const handleBarcodeScan = useCallback(async (barcode: string) => {
    setBarcodeStatus('scanning');
    const product = await fetchProductByBarcode(barcode);
    if (product) {
      if (product.stock === 0) {
        setBarcodeStatus('notfound');
        toast.error(`"${product.name}" est en rupture de stock`, { duration: 3500, icon: '🚫' });
        setTimeout(() => setBarcodeStatus('idle'), 1500);
        return;
      }
      await addToCart({
        id: product.id,
        name: product.name,
        sku: product.ref,
        price: product.sellPriceTtc,
        imageUrl: product.imageUrl || undefined,
        stock: product.stock,
        costPrice: product.costPrice,
      });
      setBarcodeStatus('found');
      toast.success(`📦 ${product.name} ajouté au panier`, { duration: 2000 });
    } else {
      setBarcodeStatus('notfound');
      toast.error(
        `Code-barres non reconnu : ${barcode}`,
        {
          duration: 4000,
          description: 'Vérifiez la référence ou créez le produit dans la gestion produits',
        }
      );
    }
    setTimeout(() => setBarcodeStatus('idle'), 1500);
  }, [addToCart]);

  useBarcodeScanner({ onScan: handleBarcodeScan, enabled: !isLocked && !showCameraScanner });

  // Camera scanner
  const cameraScanner = useCameraBarcodeScanner({
    onScan: async (barcode) => {
      await handleBarcodeScan(barcode);
    },
    enabled: showCameraScanner,
  });

  const handleOpenCamera = useCallback(async () => {
    setShowCameraScanner(true);
    await cameraScanner.startCamera();
  }, [cameraScanner]);

  const handleCloseCamera = useCallback(() => {
    cameraScanner.stopCamera();
    setShowCameraScanner(false);
    setCameraManualBarcode('');
  }, [cameraScanner]);

  // Show PIN screen if locked
  if (isLocked) {
    return <POSPinScreen />;
  }

  const addFreePriceItem = useCallback((name: string, price: number) => {
    const id = `free-${Date.now()}`;
    setCart((prev) => [...prev, {
      id,
      productId: id,
      name,
      sku: 'PRIX-LIBRE',
      price,
      qty: 1,
      discount: 0,
      discountType: 'percent',
      tva: LIVE_TAX_RATE,
      isFreePrice: true,
    }]);
    setShowFreePrice(false);
    toast.success(`"${name}" ajouté au panier`);
    logAction('free_price', `Article prix libre ajouté : ${name}`, price, { name, price });
  }, [logAction]);

  // ── Handle client selection: load available rewards ───────────────────────
  const handleClientSelect = useCallback(async (posClient: import('./POSTerminal').POSClient) => {
    setClient(posClient);
    setAppliedReward(null);
    // Load available rewards for this client
    const rewards = await loyaltyService.getClientAvailableRewards(posClient.id);
    setAvailableRewards(rewards);
    if (rewards.length > 0) {
      setShowAvailableRewards(true);
    }
  }, []);

  const handleClientClear = useCallback(() => {
    setClient(null);
    setAppliedReward(null);
    setAvailableRewards([]);
    setShowAvailableRewards(false);
  }, []);

  // ── Handle reward use now ─────────────────────────────────────────────────
  const handleUseRewardNow = useCallback((reward: ClientLoyaltyReward) => {
    setAppliedReward(reward);
    setShowAvailableRewards(false);
    toast.success(`🎁 Récompense appliquée : ${reward.rewardDescription}`, { duration: 3000 });
  }, []);

  // ── Handle keep reward for later ──────────────────────────────────────────
  const handleKeepRewardForLater = useCallback(() => {
    setShowAvailableRewards(false);
    if (availableRewards.length > 0) {
      toast.info(`Récompense conservée pour plus tard`, { duration: 2500, icon: '🕐' });
    }
  }, [availableRewards.length]);

  // ── Remove applied reward from cart ──────────────────────────────────────
  const handleRemoveAppliedReward = useCallback(() => {
    setAppliedReward(null);
    toast.info('Récompense retirée du panier');
  }, []);

  const updateQty = useCallback((id: string, qty: number) => {
    if (qty <= 0) {
      setCart((prev) => prev.filter((i) => i.id !== id));
    } else {
      setCart((prev) => prev.map((i) => i.id === id ? { ...i, qty } : i));
    }
  }, []);

  const updateDiscount = useCallback((id: string, discount: number, type: 'percent' | 'amount') => {
    setCart((prev) => {
      const item = prev.find((i) => i.id === id);
      if (item && discount > 0) {
        logAction(
          'discount',
          `Remise appliquée sur "${item.name}" : ${discount}${type === 'percent' ? '%' : '€'}`,
          discount,
          { itemId: id, itemName: item.name, discountType: type }
        );
      }
      return prev.map((i) => i.id === id ? { ...i, discount, discountType: type } : i);
    });
  }, [logAction]);

  const updatePrice = useCallback((id: string, newPrice: number) => {
    setCart((prev) => {
      const item = prev.find((i) => i.id === id);
      if (item) {
        logAction(
          'price_change',
          `Prix modifié pour "${item.name}" : ${item.price.toFixed(2)}€ → ${newPrice.toFixed(2)}€`,
          newPrice,
          { itemId: id, itemName: item.name, oldPrice: item.price, newPrice }
        );
      }
      return prev.map((i) => i.id === id ? { ...i, price: newPrice } : i);
    });
    toast.success('Prix modifié et enregistré dans l\'historique');
  }, [logAction]);

  const removeItem = useCallback((id: string) => {
    setCart((prev) => {
      const item = prev.find((i) => i.id === id);
      if (item) {
        logAction('cancel', `Article supprimé du panier : "${item.name}"`, item.price * item.qty, { itemId: id, itemName: item.name });
      }
      return prev.filter((i) => i.id !== id);
    });
  }, [logAction]);

  const holdTicket = useCallback(() => {
    if (cart.length === 0) return;
    const ticket: HeldTicket = {
      id: `held-${Date.now()}`,
      label: `Ticket mis en attente`,
      items: [...cart],
      client: client?.name,
      heldAt: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
    };
    setHeldTickets((prev) => [...prev, ticket]);
    const total = cart.reduce((s, i) => s + calcItemTotal(i), 0);
    logAction('hold', `Ticket mis en attente${client ? ` — Client : ${client.name}` : ''}`, total, { itemsCount: cart.length, clientName: client?.name });
    setCart([]);
    setClient(null);
    toast.success('Ticket mis en attente');
  }, [cart, client, logAction]);

  const recallTicket = useCallback((ticket: HeldTicket) => {
    setCart(ticket.items);
    setHeldTickets((prev) => prev.filter((t) => t.id !== ticket.id));
    setShowHeld(false);
    toast.info(`Ticket ${ticket.label} récupéré`);
  }, []);

  const clearCart = useCallback(() => {
    if (cart.length > 0) {
      const total = cart.reduce((s, i) => s + calcItemTotal(i), 0);
      logAction('cancel', `Ticket annulé${client ? ` — Client : ${client.name}` : ''}`, total, { itemsCount: cart.length, clientName: client?.name });
    }
    setCart([]);
    setClient(null);
  }, [cart, client, logAction]);

  const handleLogout = useCallback(async () => {
    await logout();
    toast.info('Session caisse fermée');
  }, [logout]);

  // ── Loyalty: handle payment confirmation with points ──────────────────────
  const subtotalHT = cart.reduce((s, i) => s + calcItemTotal(i), 0);
  const totalTVA = subtotalHT * LIVE_TAX_RATE;
  const totalTTC = subtotalHT + totalTVA;

  const handlePaymentConfirm = useCallback(async (method: string) => {
    const total = totalTTC;
    const itemsCount = cart.length;
    const clientName = client?.name;
    const ticketRef = generateTicketNumber();

    logAction(
      paymentMode === 'acompte' ? 'acompte' : 'sale',
      `Vente encaissée${clientName ? ` — Client : ${clientName}` : ''} — ${total.toFixed(2)}€ via ${method}`,
      total,
      { method, itemsCount, clientName, mode: paymentMode }
    );

    // ── Deduct stock for all sold items ───────────────────────────────────
    const stockItems = cart.map((i) => ({
      productId: i.productId,
      name: i.name,
      qty: i.qty,
      isFreePrice: i.isFreePrice,
    }));
    const { errors: stockErrors } = await deductStockForSale(
      stockItems,
      ticketRef,
      method,
      employee?.fullName || 'Caisse'
    );
    if (stockErrors.length > 0) {
      console.warn('Stock deduction errors:', stockErrors);
      toast.warning(`Stock mis à jour avec ${stockErrors.length} avertissement(s)`, { duration: 3000 });
    }

    // ── Save receipt to DB ────────────────────────────────────────────────
    const discountAmount = cart.reduce((s, i) => {
      const base = i.price * i.qty;
      const disc = i.discountType === 'percent' ? base * (i.discount / 100) : i.discount;
      return s + disc;
    }, 0);

    let loyaltyPointsEarned = 0;
    let loyaltyRewardUsed: string | undefined;

    // Award loyalty points if client is selected
    if (client && loyaltyTiers.length > 0) {
      loyaltyPointsEarned = Math.floor(total);
      const previousPoints = client.points;
      const newPoints = previousPoints + loyaltyPointsEarned;

      // Persist points to DB
      await clientService.adjustLoyaltyPoints(
        client.id,
        loyaltyPointsEarned,
        `Achat en caisse — ${total.toFixed(2)} € — ${new Date().toLocaleDateString('fr-FR')}`
      );

      // If a reward was applied, mark it as used
      if (appliedReward) {
        loyaltyRewardUsed = appliedReward.rewardDescription;
        await loyaltyService.useReward({
          rewardId: appliedReward.id,
          ticketRef,
          cashierName: employee?.fullName,
          notes: `Utilisé en caisse — ${total.toFixed(2)} € via ${method}`,
        });
        await loyaltyService.createRedemption({
          clientId: client.id,
          rewardType: appliedReward.rewardType,
          rewardDescription: appliedReward.rewardDescription,
          rewardValue: appliedReward.rewardValue,
          rewardProductId: appliedReward.rewardProductId,
          pointsAtRedemption: newPoints,
          cashierName: employee?.fullName,
          notes: `Récompense utilisée — ticket ${ticketRef}`,
        });
      }

      // Detect newly unlocked tiers
      const unlocked = detectUnlockedTiers(loyaltyTiers, previousPoints, newPoints);
      const next = getNextTier(loyaltyTiers, newPoints);
      const ptsToNext = pointsToNextTier(loyaltyTiers, newPoints);

      // Update local client state
      setClient((prev) => prev ? { ...prev, points: newPoints } : prev);

      // Save receipt to DB (with loyalty info)
      await saveReceipt({
        ticketNumber: ticketRef,
        items: cart,
        subtotalHT,
        totalTVA,
        totalTTC: total,
        discountAmount,
        paymentMethod: method,
        paymentType: paymentMode === 'acompte' ? 'acompte' : 'sale',
        clientId: client.id,
        clientName: client.name,
        cashierName: employee?.fullName || 'Caisse',
        loyaltyPointsEarned,
        loyaltyRewardUsed,
      });

      if (unlocked.length > 0) {
        const persistedRewards: ClientLoyaltyReward[] = [];
        for (const tier of unlocked) {
          const reward = await loyaltyService.unlockRewardForClient(
            client.id,
            tier,
            newPoints,
            90
          );
          if (reward) persistedRewards.push(reward);
          await loyaltyService.createRedemption({
            clientId: client.id,
            tierId: tier.id,
            pointsAtRedemption: newPoints,
            rewardType: tier.rewardType,
            rewardDescription: tier.rewardDescription,
            rewardValue: tier.rewardValue,
            rewardProductId: tier.rewardProductId,
            cashierName: employee?.fullName,
          });
        }

        setShowPayment(false);
        setAppliedReward(null);
        setAvailableRewards([]);

        // Always show doc choice modal after payment
        setLastSaleTotal(total);
        setLastSaleClient(client);
        setLastSaleItems([...cart]);
        setLastSaleMethod(method);
        setLastSaleTicketRef(ticketRef);
        setLastSaleLoyalty({
          pointsEarned: loyaltyPointsEarned,
          totalPoints: newPoints,
          nextTier: next,
          pointsToNext: ptsToNext,
        });

        setCart([]);
        setClient(null);

        if (persistedRewards.length > 0) {
          setNewlyUnlockedRewards({
            rewards: persistedRewards,
            nextTier: next,
            pointsToNext: ptsToNext,
            currentPoints: newPoints,
            pointsEarned: loyaltyPointsEarned,
          });
        }

        setShowDocChoice(true);
        toast.success(`Paiement encaissé — ${total.toFixed(2)} € via ${method}`);
      } else {
        if (next) {
          toast.success(`+${loyaltyPointsEarned} pts fidélité · Encore ${ptsToNext} pts avant "${next.name}"`, {
            duration: 4000,
            icon: '⭐',
          });
        } else {
          toast.success(`+${loyaltyPointsEarned} pts fidélité · Total : ${newPoints.toLocaleString('fr-FR')} pts`, {
            duration: 3000,
            icon: '⭐',
          });
        }

        setShowPayment(false);
        setLastSaleTotal(total);
        setLastSaleClient(client);
        setLastSaleItems([...cart]);
        setLastSaleMethod(method);
        setLastSaleTicketRef(ticketRef);
        setLastSaleLoyalty({
          pointsEarned: loyaltyPointsEarned,
          totalPoints: newPoints,
          nextTier: next,
          pointsToNext: ptsToNext,
        });
        setCart([]);
        setAppliedReward(null);
        setAvailableRewards([]);
        setClient(null);
        setShowDocChoice(true);
        toast.success(`Paiement encaissé — ${total.toFixed(2)} € via ${method}`);
      }
    } else {
      // No client / no loyalty — save receipt and show doc choice
      await saveReceipt({
        ticketNumber: ticketRef,
        items: cart,
        subtotalHT,
        totalTVA,
        totalTTC: total,
        discountAmount,
        paymentMethod: method,
        paymentType: paymentMode === 'acompte' ? 'acompte' : 'sale',
        clientId: client?.id,
        clientName: client?.name,
        cashierName: employee?.fullName || 'Caisse',
      });

      setShowPayment(false);
      setLastSaleTotal(total);
      setLastSaleClient(client);
      setLastSaleItems([...cart]);
      setLastSaleMethod(method);
      setLastSaleTicketRef(ticketRef);
      setLastSaleLoyalty(null);
      setCart([]);
      setAppliedReward(null);
      setClient(null);
      setShowDocChoice(true);
      toast.success(`Paiement encaissé — ${total.toFixed(2)} € via ${method}`);
    }
  }, [cart, client, paymentMode, totalTTC, subtotalHT, totalTVA, loyaltyTiers, logAction, employee, appliedReward]);

  const handleLoyaltyValidate = useCallback((tier: LoyaltyTier) => {
    toast.success(`🎁 Récompense validée : ${tier.rewardDescription}`, { duration: 4000 });
  }, []);

  const handleLoyaltyDismiss = useCallback(() => {
    setLoyaltyNotification(null);
    setShowPayment(false);
    setCart([]);
    setClient(null);
  }, []);

  const handleNewlyUnlockedDismiss = useCallback(() => {
    setNewlyUnlockedRewards(null);
    setClient(null);
  }, []);

  // Post-payment document choice
  const [showDocChoice, setShowDocChoice] = useState(false);
  const [lastSaleTotal, setLastSaleTotal] = useState(0);
  const [lastSaleClient, setLastSaleClient] = useState<POSClient | null>(null);
  const [lastSaleItems, setLastSaleItems] = useState<CartItem[]>([]);
  const [lastSaleMethod, setLastSaleMethod] = useState('');
  const [lastSaleTicketRef, setLastSaleTicketRef] = useState('');
  const [lastSaleLoyalty, setLastSaleLoyalty] = useState<{ pointsEarned: number; totalPoints: number; nextTier: LoyaltyTier | null; pointsToNext: number } | null>(null);

  const handleDocChoiceClose = useCallback(() => {
    setShowDocChoice(false);
    setLastSaleTotal(0);
    setLastSaleClient(null);
    setLastSaleItems([]);
    setLastSaleMethod('');
    setLastSaleLoyalty(null);
  }, []);

  // Format session start time
  const [dateStr, setDateStr] = useState('');
  const [timeStr, setTimeStr] = useState('');
  useEffect(() => {
    const update = () => {
      const now = new Date();
      setTimeStr(now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }));
      setDateStr(now.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }));
    };
    update();
    const interval = setInterval(update, 30000);
    return () => clearInterval(interval);
  }, []);

  // Next tier progress bar for cart panel
  const nextTierForClient = client && loyaltyTiers.length > 0 ? getNextTier(loyaltyTiers, client.points) : null;
  const ptsToNextForClient = client && loyaltyTiers.length > 0 ? pointsToNextTier(loyaltyTiers, client.points) : 0;

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      {/* Top bar */}
      <div className="h-14 bg-white border-b border-border flex items-center justify-between px-4 shrink-0 z-10">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-sm font-600 text-foreground">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            Caisse ouverte
          </div>
          <span className="text-muted-foreground text-xs">·</span>
          <div className="flex items-center gap-1.5">
            <div className="w-6 h-6 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-[10px] font-700 text-primary">
              {employee?.avatarInitials}
            </div>
            <span className="text-xs font-500 text-foreground">{employee?.fullName}</span>
          </div>
          <span className="text-muted-foreground text-xs">·</span>
          <span className="text-xs text-muted-foreground font-mono">{dateStr} {timeStr}</span>
          {/* Barcode scanner status indicator */}
          <span className="text-muted-foreground text-xs">·</span>
          <div className={`flex items-center gap-1 text-xs font-500 transition-colors ${
            barcodeStatus === 'scanning' ? 'text-amber-600' :
            barcodeStatus === 'found' ? 'text-emerald-600' :
            barcodeStatus === 'notfound'? 'text-red-500' : 'text-muted-foreground'
          }`}>
            <Icon name="QrCodeIcon" size={13} />
            <span>
              {barcodeStatus === 'scanning' ? 'Scan...' :
               barcodeStatus === 'found' ? 'Trouvé ✓' :
               barcodeStatus === 'notfound'? 'Inconnu ✗' : 'Scanner actif'}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Camera scanner button */}
          <button
            onClick={handleOpenCamera}
            title="Scanner avec la caméra"
            className="flex items-center gap-1.5 px-3 py-1.5 border border-sky-200 bg-sky-50 rounded-lg text-sm font-500 text-sky-700 hover:bg-sky-100 transition-colors"
          >
            <Icon name="CameraIcon" size={14} />
            <span>Caméra</span>
          </button>
          <button
            onClick={() => setShowFreePrice(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-violet-200 bg-violet-50 rounded-lg text-sm font-500 text-violet-700 hover:bg-violet-100 transition-colors"
          >
            <span>+ Prix libre</span>
          </button>
          <button
            onClick={() => setShowHeld(true)}
            className="relative flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <span>Tickets en attente</span>
            {heldTickets.length > 0 && (
              <span className="bg-primary text-primary-foreground text-[10px] font-700 rounded-full px-1.5 py-0.5 tabular-nums">
                {heldTickets.length}
              </span>
            )}
          </button>
          <button
            onClick={holdTicket}
            disabled={cart.length === 0}
            className="px-3 py-1.5 border border-border rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Mettre en attente
          </button>
          <button
            onClick={clearCart}
            disabled={cart.length === 0}
            className="px-3 py-1.5 border border-red-200 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Annuler ticket
          </button>
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-800 transition-colors"
            title="Verrouiller la caisse"
          >
            <Icon name="LockClosedIcon" size={14} />
            <span>Verrouiller</span>
          </button>
        </div>
      </div>

      {/* Main split */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: product grid */}
        <div className="flex-1 overflow-hidden flex flex-col">
          <ProductGrid onAddToCart={addToCart} />
        </div>

        {/* Right: cart */}
        <div className="w-[400px] xl:w-[440px] 2xl:w-[480px] shrink-0 flex flex-col bg-white border-l border-border overflow-hidden">
          <ClientLookupBar
            client={client}
            onSelect={handleClientSelect}
            onClear={handleClientClear}
          />

          {/* Loyalty progress bar for selected client */}
          {client && nextTierForClient && (
            <div className="px-3 py-2 bg-amber-50 border-b border-amber-100">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] text-amber-700 font-600 flex items-center gap-1">
                  <span>⭐</span> {client.points.toLocaleString('fr-FR')} pts
                </span>
                <span className="text-[10px] text-amber-600">
                  🔥 Encore {ptsToNextForClient} pts → {nextTierForClient.name}
                </span>
              </div>
              <div className="h-1.5 bg-amber-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-amber-400 to-orange-400 rounded-full transition-all"
                  style={{
                    width: `${Math.min(100, Math.max(3, ((client.points % nextTierForClient.pointsRequired) / nextTierForClient.pointsRequired) * 100))}%`,
                  }}
                />
              </div>
            </div>
          )}

          {/* Applied reward banner */}
          {appliedReward && (
            <RewardAppliedBanner
              reward={appliedReward}
              discountAmount={appliedReward.rewardValue > 0 ? (subtotalHT * appliedReward.rewardValue) / 100 : 0}
              onRemove={handleRemoveAppliedReward}
            />
          )}

          {/* Available rewards notification strip */}
          {client && availableRewards.length > 0 && !showAvailableRewards && !appliedReward && (
            <button
              onClick={() => setShowAvailableRewards(true)}
              className="mx-3 mb-1 w-[calc(100%-24px)] flex items-center gap-2 bg-violet-50 border border-violet-200 rounded-lg px-3 py-2 hover:bg-violet-100 transition-colors"
            >
              <span className="text-base">🎁</span>
              <div className="flex-1 text-left min-w-0">
                <p className="text-xs font-700 text-violet-800">
                  {availableRewards.length === 1
                    ? '1 récompense disponible'
                    : `${availableRewards.length} récompenses disponibles`}
                </p>
                <p className="text-[10px] text-violet-600 truncate">
                  {availableRewards[0].rewardDescription}
                </p>
              </div>
              <Icon name="ChevronRightIcon" size={14} className="text-violet-500 shrink-0" />
            </button>
          )}

          <CartPanel
            items={cart}
            onUpdateQty={updateQty}
            onUpdateDiscount={updateDiscount}
            onUpdatePrice={updatePrice}
            onRemove={removeItem}
            subtotalHT={subtotalHT}
            totalTVA={totalTVA}
            totalTTC={totalTTC}
            tvaRate={LIVE_TAX_RATE}
          />
          {/* Payment buttons */}
          <div className="border-t border-border p-4 space-y-3 shrink-0">
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: 'pay-cb', label: 'Carte bancaire', mode: 'immediate' as const, sub: 'CB / Sans contact' },
                { id: 'pay-cash', label: 'Espèces', mode: 'immediate' as const, sub: 'Rendu monnaie' },
                { id: 'pay-mix', label: 'Paiement mixte', mode: 'immediate' as const, sub: 'CB + Espèces' },
                { id: 'pay-inst', label: 'Plusieurs fois', mode: 'installment' as const, sub: '2x / 3x / 4x' },
              ].map((btn) => (
                <button
                  key={btn.id}
                  onClick={() => { setPaymentMode(btn.mode); setShowPayment(true); }}
                  disabled={cart.length === 0}
                  className="flex flex-col items-center justify-center py-2.5 px-3 border border-border rounded-lg hover:border-primary/40 hover:bg-primary/5 transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed active:scale-95"
                >
                  <span className="text-sm font-600 text-foreground">{btn.label}</span>
                  <span className="text-[10px] text-muted-foreground mt-0.5">{btn.sub}</span>
                </button>
              ))}
            </div>
            <button
              onClick={() => { setPaymentMode('acompte'); setShowPayment(true); }}
              disabled={cart.length === 0}
              className="w-full py-2.5 border border-amber-300 bg-amber-50 rounded-lg text-sm font-600 text-amber-800 hover:bg-amber-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed active:scale-95"
            >
              Acompte / Réservation
            </button>
            <button
              onClick={() => { setPaymentMode('immediate'); setShowPayment(true); }}
              disabled={cart.length === 0}
              className="w-full py-3 bg-primary text-primary-foreground rounded-lg text-[15px] font-700 hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 shadow-sm"
            >
              Encaisser — {totalTTC.toFixed(2)} €
            </button>
          </div>
        </div>
      </div>

      {/* Camera Barcode Scanner Modal */}
      {showCameraScanner && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div className="flex items-center gap-2">
                <Icon name="CameraIcon" size={18} className="text-sky-600" />
                <h2 className="font-700 text-foreground text-sm">Scanner avec la caméra</h2>
              </div>
              <button onClick={handleCloseCamera} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground">
                <Icon name="XMarkIcon" size={18} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              {/* Camera status messages */}
              {cameraScanner.status === 'requesting' && (
                <div className="flex flex-col items-center gap-3 py-6">
                  <div className="w-10 h-10 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
                  <p className="text-sm text-muted-foreground text-center">Demande d'accès à la caméra…</p>
                </div>
              )}
              {cameraScanner.status === 'denied' && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
                  <p className="text-sm font-600 text-red-700 mb-1">Accès caméra refusé</p>
                  <p className="text-xs text-red-600">Autorisez l'accès à la caméra dans les paramètres de votre navigateur, puis réessayez.</p>
                </div>
              )}
              {cameraScanner.status === 'error' && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-center">
                  <p className="text-sm font-600 text-amber-700 mb-1">Caméra indisponible</p>
                  <p className="text-xs text-amber-600">Aucune caméra détectée ou erreur d'accès. Utilisez le lecteur USB ou saisissez le code manuellement.</p>
                </div>
              )}
              {cameraScanner.status === 'active' && (
                <div className="space-y-3">
                  <div className="relative rounded-xl overflow-hidden bg-black aspect-video">
                    <video
                      ref={cameraScanner.videoRef}
                      autoPlay
                      playsInline
                      muted
                      className="w-full h-full object-cover"
                    />
                    {/* Scan frame overlay */}
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className="w-48 h-32 border-2 border-sky-400 rounded-lg relative">
                        <span className="absolute -top-1 -left-1 w-4 h-4 border-t-2 border-l-2 border-sky-400 rounded-tl" />
                        <span className="absolute -top-1 -right-1 w-4 h-4 border-t-2 border-r-2 border-sky-400 rounded-tr" />
                        <span className="absolute -bottom-1 -left-1 w-4 h-4 border-b-2 border-l-2 border-sky-400 rounded-bl" />
                        <span className="absolute -bottom-1 -right-1 w-4 h-4 border-b-2 border-r-2 border-sky-400 rounded-br" />
                        <div className="absolute inset-x-0 top-1/2 h-0.5 bg-sky-400/60 animate-pulse" />
                      </div>
                    </div>
                  </div>
                  <p className="text-xs text-center text-muted-foreground">Pointez la caméra vers le code-barres du produit</p>
                </div>
              )}
              {/* Manual barcode input fallback */}
              <div className="space-y-2">
                <label className="text-xs font-600 text-muted-foreground uppercase tracking-wide">Saisie manuelle du code-barres</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={cameraManualBarcode}
                    onChange={(e) => setCameraManualBarcode(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && cameraManualBarcode.trim().length >= 3) {
                        handleBarcodeScan(cameraManualBarcode.trim());
                        setCameraManualBarcode('');
                      }
                    }}
                    placeholder="Ex: 3760123456789"
                    className="flex-1 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                    autoFocus={cameraScanner.status !== 'active'}
                  />
                  <button
                    onClick={() => {
                      if (cameraManualBarcode.trim().length >= 3) {
                        handleBarcodeScan(cameraManualBarcode.trim());
                        setCameraManualBarcode('');
                      }
                    }}
                    disabled={cameraManualBarcode.trim().length < 3}
                    className="px-4 py-2 bg-primary text-primary-foreground text-sm font-600 rounded-lg hover:opacity-90 disabled:opacity-40 transition-opacity"
                  >
                    Rechercher
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Free Price Modal */}
      {showFreePrice && (
        <FreePriceModal
          onClose={() => setShowFreePrice(false)}
          onConfirm={addFreePriceItem}
        />
      )}

      {/* Held Tickets Drawer */}
      {showHeld && (
        <HeldTicketsDrawer
          tickets={heldTickets}
          onRecall={recallTicket}
          onClose={() => setShowHeld(false)}
        />
      )}

      {/* Payment Modal */}
      {showPayment && (
        <PaymentModal
          mode={paymentMode}
          totalTTC={totalTTC}
          client={client}
          cartItems={cart}
          onClose={() => setShowPayment(false)}
          onConfirm={handlePaymentConfirm}
        />
      )}

      {/* Loyalty Reward Notification (legacy - kept for backward compat) */}
      {loyaltyNotification && (
        <LoyaltyRewardNotification
          unlockedTiers={loyaltyNotification.unlockedTiers}
          nextTier={loyaltyNotification.nextTier}
          pointsToNext={loyaltyNotification.pointsToNext}
          currentPoints={loyaltyNotification.currentPoints}
          pointsEarned={loyaltyNotification.pointsEarned}
          onValidate={handleLoyaltyValidate}
          onDismiss={handleLoyaltyDismiss}
        />
      )}

      {/* Available Rewards Modal (shown when client selected) */}
      {showAvailableRewards && client && availableRewards.length > 0 && (
        <AvailableRewardsModal
          clientName={client.name}
          availableRewards={availableRewards}
          nextTier={nextTierForClient}
          pointsToNext={ptsToNextForClient}
          currentPoints={client.points}
          onUseNow={handleUseRewardNow}
          onKeepForLater={handleKeepRewardForLater}
        />
      )}

      {/* Newly Unlocked Rewards Modal (shown after payment) */}
      {newlyUnlockedRewards && (
        <NewlyUnlockedRewardsModal
          unlockedRewards={newlyUnlockedRewards.rewards}
          nextTier={newlyUnlockedRewards.nextTier}
          pointsToNext={newlyUnlockedRewards.pointsToNext}
          currentPoints={newlyUnlockedRewards.currentPoints}
          pointsEarned={newlyUnlockedRewards.pointsEarned}
          onDismiss={handleNewlyUnlockedDismiss}
        />
      )}

      {/* Post-payment document choice */}
      {showDocChoice && (
        <PostPaymentDocModal
          total={lastSaleTotal}
          client={lastSaleClient}
          items={lastSaleItems}
          paymentMethod={lastSaleMethod}
          ticketRef={lastSaleTicketRef}
          loyaltyInfo={lastSaleLoyalty}
          onClose={handleDocChoiceClose}
        />
      )}
    </div>
  );
}

// ─── Post-Payment Document Choice Modal ──────────────────────────────────────

interface PostPaymentDocModalProps {
  total: number;
  client: POSClient | null;
  items: CartItem[];
  paymentMethod?: string;
  ticketRef?: string;
  loyaltyInfo?: { pointsEarned: number; totalPoints: number; nextTier: LoyaltyTier | null; pointsToNext: number } | null;
  onClose: () => void;
}

function PostPaymentDocModal({ total, client, items, paymentMethod, ticketRef, loyaltyInfo, onClose }: PostPaymentDocModalProps) {
  const [selected, setSelected] = useState<'ticket' | 'invoice' | 'quote' | null>(null);
  const [emailSent, setEmailSent] = useState(false);
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);

  const handlePrintTicket = () => {
    const win = window.open('', '_blank', 'width=420,height=700');
    if (!win) return;
    const now = new Date();
    const ticketNumber = ticketRef || generateTicketNumber();
    const dateStr = now.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const timeStr = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

    const subtotalHT = items.reduce((s, i) => {
      const base = i.price * i.qty;
      const disc = i.discountType === 'percent' ? base * (i.discount / 100) : i.discount;
      return s + Math.max(0, base - disc);
    }, 0);
    const totalTVA = subtotalHT * 0.085;

    // Load settings from localStorage cache or use defaults
    let companyName = "LE MONDE DE L'ESTHETIQUE";
    let companyAddress = 'Baie des Flamands Appt 306 9 avenue Loulou Boislaville';
    let companyCity = 'Fort-de-France 97200';
    let companyPhone = '';
    let companyEmail = '';
    let companySiret = '927 747 725';
    let companyTva = 'FR71 927747 725';
    let receiptFooter = 'Merci de votre visite !';
    let sellerName = '';
    let cashierLabel = 'Caisse principale';
    let returnConditions = 'Retour accepté sous 30 jours selon conditions boutique. Produit non utilisé, non ouvert et en bon état. Ticket obligatoire pour tout retour ou échange.';
    let returnExcluded = "Certains produits peuvent être exclus du retour (produits d'hygiène, consommables ouverts).";
    let loyaltyPointsPerEuro = 1;

    try {
      const cached = localStorage.getItem('beautypos_settings');
      if (cached) {
        const s = JSON.parse(cached);
        companyName = s.company_name || companyName;
        companyAddress = s.address || companyAddress;
        companyCity = `${s.city || 'Fort-de-France'} ${s.postal_code || '97200'}`;
        companyPhone = s.phone || '';
        companyEmail = s.email || '';
        companySiret = s.siret || companySiret;
        companyTva = s.tva_number || companyTva;
        receiptFooter = s.receipt_footer || receiptFooter;
        sellerName = s.receipt_seller_name || '';
        cashierLabel = s.receipt_cashier_label || cashierLabel;
        returnConditions = s.return_conditions || returnConditions;
        returnExcluded = s.return_excluded_products || returnExcluded;
        loyaltyPointsPerEuro = Number(s.loyalty_points_per_euro) || 1;
      }
    } catch { /* use defaults */ }

    const pointsEarned = client ? Math.floor(total * loyaltyPointsPerEuro) : 0;
    const totalPoints = client ? (client.points + pointsEarned) : 0;

    const lines = items.map((i) => {
      const lineTotal = Math.max(0, i.price * i.qty - (i.discountType === 'percent' ? i.price * i.qty * (i.discount / 100) : i.discount));
      const discStr = i.discount > 0 ? `<tr><td colspan="3" style="font-size:10px;color:#000;padding:0 4px 3px 12px;font-style:italic">Remise: -${i.discountType === 'percent' ? i.discount + '%' : i.discount.toFixed(2) + ' \u20ac'}</td></tr>` : '';
      return `
        <tr style="border-bottom:1px dotted #555">
          <td style="padding:4px 4px 4px 4px;vertical-align:top;font-weight:600;color:#000">${i.name}</td>
          <td style="padding:4px 4px;text-align:center;vertical-align:top;white-space:nowrap;color:#000">${i.qty} x ${i.price.toFixed(2)}\u20ac</td>
          <td style="padding:4px 4px;text-align:right;vertical-align:top;white-space:nowrap;font-weight:700;color:#000">${lineTotal.toFixed(2)}\u20ac</td>
        </tr>${discStr}`;
    }).join('');

    win.document.write(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Ticket ${ticketNumber}</title><style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Courier New', Courier, monospace; font-size: 12px; width: 300px; margin: 0 auto; padding: 10px 6px 20px 6px; color: #000; background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .center { text-align: center; }
  .right { text-align: right; }
  .bold { font-weight: bold; }
  .sep-dash { border: none; border-top: 1px dashed #000; margin: 7px 0; }
  .sep-solid { border: none; border-top: 2px solid #000; margin: 7px 0; }
  .sep-double { border: none; border-top: 3px double #000; margin: 7px 0; }
  table { width: 100%; border-collapse: collapse; }
  td, th { color: #000; }
  .section-title { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #000; margin-bottom: 4px; }
  .info-table td { font-size: 11px; padding: 2px 2px; color: #000; }
  .items-head th { font-size: 10px; font-weight: 700; text-transform: uppercase; padding: 3px 4px; border-top: 2px solid #000; border-bottom: 2px solid #000; color: #000; }
  .total-ht td { font-size: 11px; padding: 3px 4px; color: #000; }
  .total-tva td { font-size: 11px; padding: 3px 4px; color: #000; }
  .total-ttc-row { background: #000; }
  .total-ttc-row td { font-size: 16px; font-weight: 700; padding: 6px 4px; color: #fff; border: none; }
  .payment-row td { font-size: 12px; font-weight: 700; padding: 3px 4px; color: #000; }
  .loyalty-box { border: 2px solid #000; padding: 6px 8px; margin: 6px 0; }
  .loyalty-box td { font-size: 11px; padding: 2px 2px; color: #000; }
  .loyalty-pts-earned td { font-size: 13px; font-weight: 700; color: #000; padding: 3px 2px; }
  .loyalty-next td { font-size: 10px; color: #000; padding: 2px 2px; font-style: italic; }
  .return-box { font-size: 10px; color: #000; margin-top: 4px; }
  .return-box .return-title { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 3px; }
  .footer-msg { text-align: center; font-size: 12px; font-weight: 700; margin-top: 6px; color: #000; }
  .footer-sub { text-align: center; font-size: 10px; margin-top: 3px; color: #000; }
  @media print {
    body { width: 100%; padding: 4px; }
    .total-ttc-row { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style></head><body>

  <!-- ===== HEADER ===== -->
  <div class="center bold" style="font-size:16px;letter-spacing:2px;text-transform:uppercase;border-bottom:3px double #000;padding-bottom:6px;margin-bottom:6px">${companyName}</div>
  <div class="center" style="font-size:11px;font-weight:600">${companyAddress}</div>
  <div class="center" style="font-size:11px;font-weight:600">${companyCity}</div>
  ${companyPhone ? `<div class="center" style="font-size:11px">Tel : ${companyPhone}</div>` : ''}
  ${companyEmail ? `<div class="center" style="font-size:11px">${companyEmail}</div>` : ''}
  <div class="center" style="font-size:10px;margin-top:3px">SIRET : <strong>${companySiret}</strong></div>
  <div class="center" style="font-size:10px">N\u00b0 TVA : <strong>${companyTva}</strong></div>

  <hr class="sep-double" style="margin:8px 0">

  <!-- ===== TICKET INFO ===== -->
  <div class="section-title">Ticket de caisse</div>
  <table class="info-table">
    <tr><td style="font-weight:700">N\u00b0 Ticket</td><td class="right" style="font-weight:700">${ticketNumber}</td></tr>
    <tr><td>Date</td><td class="right"><strong>${dateStr}</strong> ${timeStr}</td></tr>
    ${sellerName ? `<tr><td>Vendeur</td><td class="right"><strong>${sellerName}</strong></td></tr>` : ''}
    <tr><td>Caisse</td><td class="right">${cashierLabel}</td></tr>
    ${client ? `<tr><td style="font-weight:700">Client</td><td class="right" style="font-weight:700">${client.name}</td></tr>` : ''}
  </table>

  <hr class="sep-solid" style="margin:8px 0">

  <!-- ===== ARTICLES ===== -->
  <div class="section-title">Articles</div>
  <table>
    <thead>
      <tr class="items-head">
        <th style="text-align:left;width:50%">Designation</th>
        <th style="text-align:center;width:28%">Qte x PU</th>
        <th style="text-align:right;width:22%">Total</th>
      </tr>
    </thead>
    <tbody>${lines}</tbody>
  </table>

  <hr class="sep-solid" style="margin:8px 0">

  <!-- ===== TOTAUX ===== -->
  <div class="section-title">Totaux</div>
  <table>
    <tr class="total-ht">
      <td>Sous-total HT</td>
      <td class="right">${subtotalHT.toFixed(2)} \u20ac</td>
    </tr>
    <tr class="total-tva">
      <td>TVA 8,5 %</td>
      <td class="right">${totalTVA.toFixed(2)} \u20ac</td>
    </tr>
  </table>

  <hr class="sep-dash" style="margin:5px 0">

  <table>
    <tr class="total-ttc-row">
      <td style="text-align:left;padding-left:6px">TOTAL TTC</td>
      <td style="text-align:right;padding-right:6px">${total.toFixed(2)} \u20ac</td>
    </tr>
  </table>

  <!-- ===== PAIEMENT ===== -->
  <table style="margin-top:6px">
    <tr class="payment-row">
      <td>Mode de paiement</td>
      <td class="right">${paymentMethod || 'Carte / Especes'}</td>
    </tr>
    <tr class="payment-row">
      <td>Montant regle</td>
      <td class="right">${total.toFixed(2)} \u20ac</td>
    </tr>
  </table>

  ${client && pointsEarned > 0 ? `
  <hr class="sep-solid" style="margin:8px 0">
  <!-- ===== FIDELITE ===== -->
  <div class="loyalty-box">
    <div class="center bold section-title" style="margin-bottom:5px;font-size:11px">*** PROGRAMME FIDELITE ***</div>
    <table>
      <tr class="loyalty-pts-earned">
        <td>Points gagnes ce jour</td>
        <td class="right">+ ${pointsEarned} pts</td>
      </tr>
      <tr>
        <td style="font-size:12px;font-weight:700;padding:2px">Solde total points</td>
        <td class="right" style="font-size:12px;font-weight:700;padding:2px">${totalPoints} pts</td>
      </tr>
      ${loyaltyInfo && loyaltyInfo.nextTier ? `
      <tr class="loyalty-next">
        <td colspan="2" style="padding-top:4px;border-top:1px dashed #000">
          Prochaine recompense : <strong>${loyaltyInfo.nextTier.name}</strong><br>
          Il vous reste <strong>${loyaltyInfo.pointsToNext} points</strong> pour l'obtenir
        </td>
      </tr>` : ''}
    </table>
  </div>` : ''}

  <hr class="sep-solid" style="margin:8px 0">

  <!-- ===== CONDITIONS RETOUR ===== -->
  <div class="return-box">
    <div class="return-title">Conditions de retour</div>
    <div style="line-height:1.4">${returnConditions}</div>
    ${returnExcluded ? `<div style="margin-top:4px;font-style:italic;border-top:1px dashed #000;padding-top:3px">${returnExcluded}</div>` : ''}
  </div>

  <hr class="sep-double" style="margin:8px 0">

  <!-- ===== FOOTER ===== -->
  <div class="footer-msg">${receiptFooter}</div>
  <div class="footer-sub">Conservez ce ticket pour tout retour ou echange</div>
  <div class="footer-sub" style="margin-top:4px;font-size:9px">- - - - - - - - - - - - - - - - - - - - - - - - -</div>

<script>window.onload = function(){ window.print(); }</script>
</body></html>`);
    win.document.close();
    onClose();
  };

  const handleCreateInvoice = () => {
    window.open('/b2b-invoicing', '_blank');
    onClose();
  };

  const handleCreateQuote = () => {
    window.open('/b2b-invoicing', '_blank');
    onClose();
  };

  const handleSendEmail = async () => {
    if (!email.includes('@')) return;
    setSending(true);

    const subtotalHT = items.reduce((s, i) => {
      const base = i.price * i.qty;
      const disc = i.discountType === 'percent' ? base * (i.discount / 100) : i.discount;
      return s + Math.max(0, base - disc);
    }, 0);
    const totalTVA = subtotalHT * 0.085;
    const ticketNumber = ticketRef || generateTicketNumber();

    const receiptData: ReceiptEmailData = {
      ticketNumber: ticketRef || generateTicketNumber(),
      date: todayFR(),
      clientName: client?.name,
      items: items.map((i) => ({
        name: i.name,
        qty: i.qty,
        price: i.price,
        discount: i.discount > 0 ? i.discount : undefined,
      })),
      subtotalHT,
      totalTVA,
      totalTTC: total,
      paymentMethod: 'Carte / Espèces',
    };

    const result = await sendReceiptEmail(email, receiptData);
    setSending(false);

    if (result.success) {
      setEmailSent(true);
      toast.success(`Ticket envoyé à ${email}`);
      setTimeout(onClose, 1500);
    } else {
      toast.error(`Erreur d'envoi : ${result.error}`);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="px-6 py-5 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
              <Icon name="CheckCircleIcon" size={20} className="text-emerald-600" />
            </div>
            <div>
              <h2 className="font-700 text-foreground">Paiement encaissé</h2>
              <p className="text-sm text-muted-foreground">{total.toFixed(2)} € · Que souhaitez-vous faire ?</p>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-3">
          {/* Ticket */}
          <button
            onClick={handlePrintTicket}
            className="w-full flex items-center gap-4 p-4 border-2 border-border rounded-xl hover:border-primary/40 hover:bg-primary/5 transition-all text-left group"
          >
            <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center shrink-0 group-hover:bg-blue-200 transition-colors">
              <Icon name="PrinterIcon" size={18} className="text-blue-600" />
            </div>
            <div>
              <p className="font-600 text-foreground">Imprimer le ticket</p>
              <p className="text-xs text-muted-foreground">Ticket de caisse simple — compte dans le CA</p>
            </div>
          </button>

          {/* Invoice */}
          <button
            onClick={handleCreateInvoice}
            className="w-full flex items-center gap-4 p-4 border-2 border-border rounded-xl hover:border-emerald-400 hover:bg-emerald-50 transition-all text-left group"
          >
            <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0 group-hover:bg-emerald-200 transition-colors">
              <Icon name="DocumentCheckIcon" size={18} className="text-emerald-600" />
            </div>
            <div>
              <p className="font-600 text-foreground">Créer une facture</p>
              <p className="text-xs text-muted-foreground">Facture légale avec TVA — compte dans le CA</p>
            </div>
          </button>

          {/* Quote */}
          <button
            onClick={handleCreateQuote}
            className="w-full flex items-center gap-4 p-4 border-2 border-border rounded-xl hover:border-amber-400 hover:bg-amber-50 transition-all text-left group"
          >
            <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center shrink-0 group-hover:bg-amber-200 transition-colors">
              <Icon name="DocumentTextIcon" size={18} className="text-amber-600" />
            </div>
            <div>
              <p className="font-600 text-foreground">Créer un devis</p>
              <p className="text-xs text-muted-foreground text-amber-700 font-medium">⚠️ Ne compte PAS dans le CA tant que non converti</p>
            </div>
          </button>

          {/* Email via Resend */}
          <div className="border-2 border-border rounded-xl p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center shrink-0">
                <Icon name="EnvelopeIcon" size={18} className="text-purple-600" />
              </div>
              <div>
                <p className="font-600 text-foreground">Envoyer le ticket par email</p>
                <p className="text-xs text-muted-foreground">Ticket de caisse HTML envoyé via Resend</p>
              </div>
            </div>
            {emailSent ? (
              <p className="text-sm text-emerald-600 font-medium text-center py-1">✓ Ticket envoyé avec succès !</p>
            ) : (
              <div className="flex gap-2">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="email@client.fr"
                  className="flex-1 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
                <button
                  onClick={handleSendEmail}
                  disabled={!email.includes('@') || sending}
                  className="flex items-center gap-1.5 px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors"
                >
                  {sending ? (
                    <Icon name="ArrowPathIcon" size={14} className="animate-spin" />
                  ) : (
                    <Icon name="PaperAirplaneIcon" size={14} />
                  )}
                  {sending ? '' : 'Envoyer'}
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="px-6 pb-5">
          <button
            onClick={onClose}
            className="w-full py-2.5 border border-border rounded-xl text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            Fermer sans document
          </button>
        </div>
      </div>
    </div>
  );
}