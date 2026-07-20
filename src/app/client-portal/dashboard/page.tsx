'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useClientAuth } from '@/contexts/ClientAuthContext';

// ─── Types ────────────────────────────────────────────────────────────────────

type OrderStatus = 'open' | 'confirmed' | 'preparing' | 'shipped' | 'auto' | 'en_livraison' | 'cancelled';

interface OrderItem {
  id: string;
  product_id: string | null;
  color_variant: string | null;
  quantity: number;
  unit_buy_price: number;
  unit_sell_price: number;
  total_sell_price: number;
  product?: { id: string; name: string; image_url: string | null; sell_price_ttc: number; description: string | null } | null;
}

interface SubscriptionOrder {
  id: string;
  order_month: string;
  status: OrderStatus;
  total_products_cost: number | null;
  total_sell_price: number | null;
  benefit_amount: number | null;
  shipping_cost: number | null;
  deadline_date: string | null;
  statut_livraison: string | null;
}

interface PortalProduct {
  id: string;
  name: string;
  image_url: string | null;
  sell_price_ttc: number;
  buy_price: number | null;
  description: string | null;
  category: string | null;
  stock: number;
  product_status: string;
  has_color_variants?: boolean;
}

interface ColorVariant {
  id: string;
  color_name: string;
  color_hex: string;
  quantity: number;
}

interface VisibleCategory {
  id: string;
  name: string;
  color: string;
  icon: string;
}

interface SubscriptionPlan {
  id: string;
  name: string;
  price: number;
  quota_amount: number;
  shipping_cost: number;
  shipping_free: boolean;
  description: string | null;
}

type Tab = 'commande' | 'catalogue' | 'abonnement' | 'historique' | 'messages' | 'faq';

interface ClientNotification {
  id: string;
  created_at: string;
  title: string;
  message: string;
  type: string;
  is_read: boolean;
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
}

const STATUS_LABEL: Record<OrderStatus, string> = {
  open: 'En cours', confirmed: 'Confirmée', preparing: 'Préparation', shipped: 'Expédiée', auto: 'Générée auto', en_livraison: '🚚 En livraison', cancelled: '❌ Annulée',
};
const STATUS_COLOR: Record<OrderStatus, string> = {
  open: 'bg-amber-50 text-amber-700 border-amber-200',
  confirmed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  preparing: 'bg-blue-50 text-blue-700 border-blue-200',
  shipped: 'bg-purple-50 text-purple-700 border-purple-200',
  en_livraison: 'bg-pink-50 text-pink-700 border-pink-200',
  cancelled: 'bg-red-50 text-red-600 border-red-200',
  auto: 'bg-gray-50 text-gray-600 border-gray-200',
};

const WA_LINK = 'https://wa.me/message/QBWQFIG2EHXCI1';

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ClientDashboardPage() {
  const router = useRouter();
  const { clientUser, loading: authLoading, signOut } = useClientAuth();

  const [tab, setTab] = useState<Tab>('commande');
  const [selectedCategory, setSelectedCategory] = useState<VisibleCategory | null>(null);

  // Order state
  const [currentOrder, setCurrentOrder] = useState<SubscriptionOrder | null>(null);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [loadingOrder, setLoadingOrder] = useState(true);
  const [confirming, setConfirming] = useState(false);

  // Catalog state
  const [products, setProducts] = useState<PortalProduct[]>([]);
  const [visibleCategories, setVisibleCategories] = useState<VisibleCategory[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Plan / shipping from DB (never cached value)
  const [planData, setPlanData] = useState<SubscriptionPlan | null>(null);
  const [allPlans, setAllPlans] = useState<SubscriptionPlan[]>([]);

  // Past orders
  const [pastOrders, setPastOrders] = useState<SubscriptionOrder[]>([]);
  const [pastOrderItems, setPastOrderItems] = useState<Record<string, OrderItem[]>>({});
  const [expandedPastOrder, setExpandedPastOrder] = useState<string | null>(null);
  const [reordering, setReordering] = useState<string | null>(null);

  // Next billing date (refreshed from DB)
  const [nextBillingDate, setNextBillingDate] = useState<string | null>(null);

  // Toast
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  // Notifications
  const [notifications, setNotifications] = useState<ClientNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loadingNotifs, setLoadingNotifs] = useState(false);

  // Push notifications
  const [pushStatus, setPushStatus] = useState<'default' | 'granted' | 'denied' | 'unsupported'>('default');
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Upgrade modal
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [upgradeTarget, setUpgradeTarget] = useState('');

  // Product detail modal
  const [detailProduct, setDetailProduct] = useState<PortalProduct | null>(null);

  // Variant picker
  const [variantPickerProduct, setVariantPickerProduct] = useState<PortalProduct | null>(null);
  const [variantPickerVariants, setVariantPickerVariants] = useState<ColorVariant[]>([]);
  const [variantPickerLoading, setVariantPickerLoading] = useState(false);

  const showToast = useCallback((msg: string, type: 'success' | 'error' = 'success') => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ msg, type });
    toastTimerRef.current = setTimeout(() => setToast(null), 2500);
  }, []);

  // ─── Notifications ────────────────────────────────────────────────────────────

  const loadNotifications = useCallback(async (markRead = false) => {
    if (!clientUser) return;
    setLoadingNotifs(true);
    try {
      const res = await fetch(`/api/client-portal/notifications?clientId=${clientUser.clientId}${markRead ? '' : '&countOnly=true'}`);
      if (!res.ok) return;
      const json = await res.json();
      if (markRead) {
        setNotifications(json.notifications ?? []);
        setUnreadCount(0);
      } else {
        setUnreadCount(json.unreadCount ?? 0);
      }
    } catch { /* réseau indisponible */ } finally { setLoadingNotifs(false); }
  }, [clientUser]);

  useEffect(() => { if (clientUser) loadNotifications(false); }, [clientUser, loadNotifications]);

  useEffect(() => {
    if (tab === 'messages') loadNotifications(true);
  }, [tab, loadNotifications]);

  // ─── Push notifications ────────────────────────────────────────────────────────

  useEffect(() => {
    if (!('Notification' in window) || !('serviceWorker' in navigator)) {
      setPushStatus('unsupported'); return;
    }
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {});
    setPushStatus(Notification.permission as 'default' | 'granted' | 'denied');
  }, []);

  useEffect(() => {
    if (!clientUser || pushStatus !== 'granted') return;
    (async () => {
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          await fetch('/api/client-portal/push-subscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...sub.toJSON(), clientId: clientUser.clientId }),
          });
        }
      } catch {}
    })();
  }, [clientUser, pushStatus]);

  const subscribeToPush = async () => {
    if (!clientUser) return;
    try {
      const permission = await Notification.requestPermission();
      setPushStatus(permission as 'default' | 'granted' | 'denied');
      if (permission !== 'granted') return;
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!),
      });
      await fetch('/api/client-portal/push-subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...sub.toJSON(), clientId: clientUser.clientId }),
      });
    } catch {}
  };

  const currentMonth = new Date().toISOString().slice(0, 7);
  const today = new Date();
  const deadlineDay = 28;
  const deadlineDate = new Date(today.getFullYear(), today.getMonth(), deadlineDay);
  const isPastDeadline = today.getDate() > deadlineDay;
  const daysLeft = isPastDeadline ? 0 : deadlineDay - today.getDate();

  const quotaUsed = orderItems.reduce((s, i) => s + i.unit_sell_price * i.quantity, 0);
  const quotaAmount = planData?.quota_amount ?? clientUser?.quotaAmount ?? 0;
  const quotaRemaining = quotaAmount - quotaUsed;
  const shippingFree = planData?.shipping_free ?? clientUser?.shippingFree ?? false;
  const shippingCost = planData?.shipping_cost ?? clientUser?.shippingCost ?? 0;

  // ── Auth redirect ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!authLoading && !clientUser) router.replace('/client-portal/login');
  }, [authLoading, clientUser, router]);

  // ── Load plan data + refresh subscription from DB (anti-stale-session) ──────
  useEffect(() => {
    if (!clientUser) return;
    const supabase = createClient();

    // Refresh subscription row to get fresh plan_name/quota/billing_date
    supabase
      .from('client_subscriptions')
      .select('next_billing_date, plan:subscription_plans(id, name, price, quota_amount, shipping_free, shipping_cost, description, is_active)')
      .eq('id', clientUser.subscriptionId)
      .maybeSingle()
      .then(({ data }) => {
        const plan = Array.isArray((data as any)?.plan) ? (data as any)?.plan[0] : (data as any)?.plan;
        if (plan) setPlanData(plan as SubscriptionPlan);
        if ((data as any)?.next_billing_date) setNextBillingDate((data as any).next_billing_date);
      });

    // Also load all plans for upgrade modal
    supabase
      .from('subscription_plans')
      .select('*')
      .eq('is_active', true)
      .order('price')
      .then(({ data }) => { if (data) setAllPlans(data as SubscriptionPlan[]); });
  }, [clientUser]);

  // ── Load current month order + items ──────────────────────────────────────
  const loadCurrentOrder = useCallback(async () => {
    if (!clientUser) return;
    setLoadingOrder(true);

    let order: SubscriptionOrder | null = null;

    if (!isPastDeadline) {
      const sc = planData?.shipping_free ? 0 : (planData?.shipping_cost ?? clientUser.shippingCost ?? 0);
      const res = await fetch('/api/client-portal/subscription-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscriptionId: clientUser.subscriptionId,
          month: currentMonth,
          shippingCost: sc,
          deadlineDate: deadlineDate.toISOString().slice(0, 10),
        }),
      });
      if (res.ok) { const json = await res.json(); order = json.order ?? null; }
    } else {
      const res = await fetch(`/api/client-portal/subscription-order?subscriptionId=${encodeURIComponent(clientUser.subscriptionId)}&month=${encodeURIComponent(currentMonth)}`);
      if (res.ok) { const json = await res.json(); order = json.order ?? null; }
    }

    setCurrentOrder(order);

    if (order) {
      const supabase = createClient();
      const { data: items } = await supabase
        .from('subscription_order_items')
        .select('*, product:products(id, name, image_url, sell_price_ttc, description)')
        .eq('order_id', order.id);
      setOrderItems(items ?? []);
    }
    setLoadingOrder(false);
  }, [clientUser, currentMonth, isPastDeadline, planData]);

  useEffect(() => {
    if (clientUser) loadCurrentOrder();
  }, [clientUser, loadCurrentOrder]);

  // ── Load past orders + items ───────────────────────────────────────────────
  useEffect(() => {
    if (!clientUser) return;
    const supabase = createClient();
    supabase
      .from('subscription_orders')
      .select('*')
      .eq('subscription_id', clientUser.subscriptionId)
      .neq('order_month', currentMonth)
      .order('order_month', { ascending: false })
      .then(async ({ data: orders }) => {
        setPastOrders(orders ?? []);
        if (!orders || orders.length === 0) return;
        const ids = orders.map((o: any) => o.id);
        const { data: items } = await supabase
          .from('subscription_order_items')
          .select('*, product:products(id, name, image_url, sell_price_ttc, buy_price, description)')
          .in('order_id', ids);
        const byOrder: Record<string, OrderItem[]> = {};
        for (const item of items ?? []) {
          if (!byOrder[item.order_id]) byOrder[item.order_id] = [];
          byOrder[item.order_id].push(item);
        }
        setPastOrderItems(byOrder);
      });
  }, [clientUser, currentMonth]);

  // ── Load products + categories ─────────────────────────────────────────────
  const loadProducts = useCallback(async () => {
    if (!clientUser) return;
    setLoadingProducts(true);
    const supabase = createClient();

    const [{ data: cats }, { data: prods }] = await Promise.all([
      supabase
        .from('categories')
        .select('id, name, color, icon')
        .eq('visible_in_client_portal', true)
        .eq('is_active', true)
        .order('sort_order'),
      supabase
        .from('products')
        .select('id, name, image_url, sell_price_ttc, buy_price, description, category, stock, product_status, has_color_variants')
        .or('product_status.eq.active,product_status.eq.Active')
        .gt('stock', 0)
        .order('name')
        .limit(1000),
    ]);
    const visibleNames = new Set((cats ?? []).map((c: any) => c.name));
    setVisibleCategories(cats ?? []);
    setProducts(((prods ?? []) as PortalProduct[]).filter((p) => visibleNames.has(p.category ?? '')));
    setLoadingProducts(false);
  }, [clientUser]);

  useEffect(() => {
    if (tab === 'catalogue' && products.length === 0) loadProducts();
  }, [tab, products.length, loadProducts]);

  // ── Real-time stock sync ───────────────────────────────────────────────────
  useEffect(() => {
    if (!clientUser || tab !== 'catalogue') return;
    const supabase = createClient();
    const channel = supabase
      .channel('portal-stock-sync')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'products' }, (payload: any) => {
        setProducts((prev) =>
          prev.map((p) =>
            p.id === payload.new.id
              // Update stock — keep product visible even if stock hits 0 (show RUPTURE badge)
              ? { ...p, stock: payload.new.stock, sell_price_ttc: payload.new.sell_price_ttc }
              : p
          )
        );
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [clientUser, tab]);

  // ── Handle add click — open variant picker if needed ──────────────────────
  const handleAddProductClick = useCallback(async (product: PortalProduct) => {
    if (!product.has_color_variants) {
      return; // will call addProduct directly via onAdd prop
    }
    setVariantPickerLoading(true);
    setVariantPickerProduct(product);
    const supabase = createClient();
    const { data } = await supabase
      .from('product_color_variants')
      .select('id, color_name, color_hex, quantity')
      .eq('product_id', product.id)
      .gt('quantity', 0)
      .order('color_name');
    setVariantPickerVariants(data ?? []);
    setVariantPickerLoading(false);
  }, []);

  // ── Add product ────────────────────────────────────────────────────────────
  const addProduct = useCallback(async (product: PortalProduct, colorVariant?: string) => {
    if (!clientUser) return;

    if (isPastDeadline) { showToast('Date limite dépassée (après le 28).', 'error'); return; }

    // Block out-of-stock products
    if (product.stock <= 0) { showToast('Ce produit est en rupture de stock.', 'error'); return; }

    if (currentOrder?.status !== 'open' && currentOrder !== null) {
      showToast('La commande est déjà confirmée.', 'error'); return;
    }

    if (product.sell_price_ttc > quotaRemaining) {
      showToast(`Quota insuffisant (reste ${quotaRemaining.toFixed(2)} €, produit ${product.sell_price_ttc.toFixed(2)} €).`, 'error');
      return;
    }

    const supabase = createClient();
    let orderId = currentOrder?.id;

    // Create order if not yet created this month
    if (!orderId) {
      const sc = shippingFree ? 0 : shippingCost;
      const res = await fetch('/api/client-portal/subscription-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscriptionId: clientUser.subscriptionId,
          month: currentMonth,
          shippingCost: sc,
          deadlineDate: new Date(new Date().getFullYear(), new Date().getMonth(), 28).toISOString().slice(0, 10),
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.order) {
        showToast(`Erreur création commande: ${json.error ?? 'inconnue'}.`, 'error');
        return;
      }
      setCurrentOrder(json.order);
      orderId = json.order.id;
    }

    const existing = orderItems.find((i) => i.product_id === product.id && (i.color_variant ?? null) === (colorVariant ?? null));
    if (existing) {
      const newQty = existing.quantity + 1;
      const newTotal = product.sell_price_ttc * newQty;
      const { error } = await supabase
        .from('subscription_order_items')
        .update({ quantity: newQty, total_sell_price: newTotal })
        .eq('id', existing.id);
      if (error) { showToast(`Erreur mise à jour: ${error.message}.`, 'error'); return; }
      setOrderItems((prev) => prev.map((i) => i.id === existing.id ? { ...i, quantity: newQty, total_sell_price: newTotal } : i));
    } else {
      const { data: newItem, error } = await supabase
        .from('subscription_order_items')
        .insert({
          order_id: orderId,
          product_id: product.id,
          quantity: 1,
          unit_buy_price: product.buy_price ?? 0,
          unit_sell_price: product.sell_price_ttc,
          total_sell_price: product.sell_price_ttc,
          ...(colorVariant ? { color_variant: colorVariant } : {}),
        })
        .select('*, product:products(id, name, image_url, sell_price_ttc, description)')
        .single();
      if (error || !newItem) {
        showToast(`Erreur ajout: ${error?.message ?? 'inconnue'}.`, 'error');
        return;
      }
      setOrderItems((prev) => [...prev, newItem]);
    }
    showToast('✓ Produit ajouté');
  }, [clientUser, currentOrder, orderItems, quotaRemaining, quotaAmount, isPastDeadline, currentMonth, shippingFree, shippingCost]);

  // ── Remove product ─────────────────────────────────────────────────────────
  const removeProduct = useCallback(async (itemId: string) => {
    const item = orderItems.find((i) => i.id === itemId);
    if (!item || !currentOrder) return;
    const supabase = createClient();
    if (item.quantity > 1) {
      const newQty = item.quantity - 1;
      const newTotal = item.unit_sell_price * newQty;
      const { error } = await supabase.from('subscription_order_items').update({ quantity: newQty, total_sell_price: newTotal }).eq('id', itemId);
      if (error) { showToast(`Erreur suppression: ${error.message}`, 'error'); return; }
      setOrderItems((prev) => prev.map((i) => i.id === itemId ? { ...i, quantity: newQty, total_sell_price: newTotal } : i));
    } else {
      const { error } = await supabase.from('subscription_order_items').delete().eq('id', itemId);
      if (error) { showToast(`Erreur suppression: ${error.message}`, 'error'); return; }
      setOrderItems((prev) => prev.filter((i) => i.id !== itemId));
    }
  }, [orderItems, currentOrder, showToast]);

  // ── Confirm order ──────────────────────────────────────────────────────────
  const confirmOrder = async () => {
    if (!currentOrder || currentOrder.status !== 'open') return;
    setConfirming(true);
    const sc = shippingFree ? 0 : shippingCost;
    const totalBuy = orderItems.reduce((s, i) => s + i.unit_buy_price * i.quantity, 0);
    const benefit = Math.max(0, (clientUser?.planPrice ?? 0) - totalBuy - sc);
    const res = await fetch('/api/client-portal/subscription-order/status', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderId: currentOrder.id,
        status: 'confirmed',
        total_products_cost: totalBuy,
        total_sell_price: quotaUsed,
        benefit_amount: benefit,
        shipping_cost: sc,
      }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      showToast(`Erreur confirmation: ${j.error ?? 'inconnue'}`, 'error');
      setConfirming(false);
      return;
    }
    setCurrentOrder((prev) => prev ? { ...prev, status: 'confirmed' } : prev);
    showToast('Box confirmée ! 🎉');
    setConfirming(false);
  };

  // ── Annuler / Recommencer la box du mois ──────────────────────────────────
  const [cancelling, setCancelling] = useState(false);
  const [restarting, setRestarting] = useState(false);

  const cancelOrder = async () => {
    if (!currentOrder || currentOrder.status !== 'confirmed') return;
    setCancelling(true);
    const res = await fetch('/api/client-portal/subscription-order/status', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId: currentOrder.id, status: 'cancelled' }),
    });
    if (!res.ok) { const j = await res.json().catch(() => ({})); showToast(`Erreur: ${j.error ?? 'inconnue'}`, 'error'); setCancelling(false); return; }
    setCurrentOrder((prev) => prev ? { ...prev, status: 'cancelled', total_products_cost: null, total_sell_price: null, benefit_amount: null } : prev);
    showToast('Box annulée. Vous pouvez refaire votre sélection.');
    setCancelling(false);
  };

  const restartOrder = async () => {
    if (!currentOrder || currentOrder.status !== 'cancelled') return;
    setRestarting(true);
    const res = await fetch('/api/client-portal/subscription-order/status', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId: currentOrder.id, status: 'open' }),
    });
    if (!res.ok) { const j = await res.json().catch(() => ({})); showToast(`Erreur: ${j.error ?? 'inconnue'}`, 'error'); setRestarting(false); return; }
    setCurrentOrder((prev) => prev ? { ...prev, status: 'open' } : prev);
    showToast('Vous pouvez modifier votre box 🎀');
    setRestarting(false);
  };

  // ── Reprendre une commande passée ─────────────────────────────────────────
  const reorderFromPast = async (pastOrderId: string) => {
    if (!clientUser || !canEdit) return;
    const items = pastOrderItems[pastOrderId];
    if (!items || items.length === 0) { showToast('Aucun produit dans cette commande.', 'error'); return; }
    setReordering(pastOrderId);
    try {
      const supabase = createClient();
      const sc = shippingFree ? 0 : shippingCost;

      // Get or create current order
      let orderId = currentOrder?.id;
      if (!orderId) {
        const res = await fetch('/api/client-portal/subscription-order', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subscriptionId: clientUser.subscriptionId, month: currentMonth, shippingCost: sc, deadlineDate: deadlineDate.toISOString().slice(0, 10) }),
        });
        if (!res.ok) { showToast('Erreur création commande.', 'error'); return; }
        const json = await res.json();
        orderId = json.order?.id;
        if (!orderId) { showToast('Erreur création commande.', 'error'); return; }
      }

      // Fetch current items to avoid duplicates
      const { data: existing } = await supabase.from('subscription_order_items').select('product_id, quantity').eq('order_id', orderId);
      const existingMap = new Map((existing ?? []).map((i: any) => [i.product_id, i.quantity]));

      // Build inserts — only products that fit in quota
      let remaining = quotaAmount - quotaUsed;
      const toInsert: any[] = [];
      for (const item of items) {
        if (!item.product_id) continue;
        if (existingMap.has(item.product_id)) continue; // skip already in box
        const price = item.unit_sell_price;
        const qty = Math.min(item.quantity, Math.floor(remaining / price));
        if (qty < 1) continue;
        toInsert.push({
          order_id: orderId,
          product_id: item.product_id,
          quantity: qty,
          unit_buy_price: item.unit_buy_price ?? 0,
          unit_sell_price: price,
          total_sell_price: price * qty,
          color_variant: item.color_variant ?? null,
        });
        remaining -= price * qty;
      }

      if (toInsert.length === 0) { showToast('Quota insuffisant ou produits déjà dans la box.', 'error'); return; }

      const { data: inserted, error } = await supabase
        .from('subscription_order_items')
        .insert(toInsert)
        .select('*, product:products(id, name, image_url, sell_price_ttc, buy_price, description)');
      if (error) { showToast(`Erreur: ${error.message}`, 'error'); return; }

      await loadCurrentOrder();
      showToast(`✅ ${toInsert.length} produit${toInsert.length > 1 ? 's' : ''} ajouté${toInsert.length > 1 ? 's' : ''} à votre box !`);
      setTab('commande');
    } catch (e: any) {
      showToast(`Erreur: ${e.message}`, 'error');
    } finally {
      setReordering(null);
    }
  };

  // ── Catalog groups ─────────────────────────────────────────────────────────
  const groupedCatalog = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return visibleCategories.map((cat) => ({
      cat,
      products: products.filter((p) => {
        if (p.category !== cat.name) return false;
        if (!q) return true;
        return p.name.toLowerCase().includes(q) || (p.description ?? '').toLowerCase().includes(q);
      }),
      allProducts: products.filter((p) => p.category === cat.name),
    })).filter((g) => g.products.length > 0);
  }, [visibleCategories, products, searchQuery]);

  const canEdit = (!currentOrder || currentOrder.status === 'open' || currentOrder.status === 'cancelled') && !isPastDeadline && currentOrder?.statut_livraison !== 'en_livraison';
  const totalCartQty = orderItems.reduce((s, i) => s + i.quantity, 0);

  // ── Upgrade section ────────────────────────────────────────────────────────
  const currentPlanPrice = planData?.price ?? clientUser?.planPrice ?? 0;
  const upgradePlans = allPlans.filter((p) => p.price > currentPlanPrice);
  const isElite = upgradePlans.length === 0 && allPlans.length > 0;
  const hasSurpriseGift = clientUser?.planName === 'Pro' || clientUser?.planName === 'Elite';

  if (authLoading || !clientUser) return <FullscreenSpinner />;

  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50 via-pink-50/30 to-stone-50">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl shadow-lg text-sm font-medium text-white flex items-center gap-2 transition-all ${toast.type === 'error' ? 'bg-red-500' : 'bg-emerald-500'}`}>
          {toast.type === 'error'
            ? <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            : <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
          }
          {toast.msg}
        </div>
      )}

      {/* Upgrade modal */}
      {showUpgradeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <div className="text-center mb-4">
              <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 20.25c4.97 0 9-3.694 9-8.25s-4.03-8.25-9-8.25S3 7.444 3 12c0 2.104.859 4.023 2.273 5.48.432.447.74 1.04.586 1.641a4.483 4.483 0 01-.923 1.785A5.969 5.969 0 006 21c1.282 0 2.47-.402 3.445-1.087.81.22 1.668.337 2.555.337z" />
                </svg>
              </div>
              <h2 className="text-base font-bold text-gray-900">Passer à la formule {upgradeTarget}</h2>
              <p className="text-sm text-gray-500 mt-2">
                Pour changer de formule, contactez votre conseillère sur WhatsApp. Elle s'occupe de tout !
              </p>
              {(() => {
                const targetPlan = allPlans.find((p) => p.name === upgradeTarget);
                return targetPlan ? (
                  <div className="mt-2 bg-rose-50 rounded-xl p-3 text-left space-y-1">
                    <p className="text-xs font-bold text-rose-700">Formule {targetPlan.name}</p>
                    <p className="text-xs text-gray-600">{targetPlan.quota_amount} € de produits/mois</p>
                    <p className="text-xs text-gray-600">{targetPlan.shipping_free ? 'Livraison offerte' : `Livraison ${targetPlan.shipping_cost} €`}</p>
                    <p className="text-sm font-bold text-rose-600">{targetPlan.price} €/mois</p>
                  </div>
                ) : null;
              })()}
            </div>
            <div className="space-y-2">
              <a
                href={`${WA_LINK}?text=${encodeURIComponent(`Bonjour 💅\n\nJe suis actuellement abonnée formule ${clientUser.planName} et je souhaite passer à la formule ${upgradeTarget}.\n\nPouvez-vous me contacter pour organiser le changement ? Merci !`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full py-3 bg-green-500 text-white rounded-xl text-sm font-semibold hover:bg-green-600 transition-colors"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                  <path d="M12 0C5.373 0 0 5.373 0 12c0 2.125.549 4.122 1.509 5.858L.057 23.215a.75.75 0 00.933.933l5.357-1.452A11.946 11.946 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22.5c-1.923 0-3.727-.504-5.287-1.382l-.379-.214-3.933 1.067 1.067-3.933-.214-.379A10.44 10.44 0 011.5 12C1.5 6.201 6.201 1.5 12 1.5S22.5 6.201 22.5 12 17.799 22.5 12 22.5z"/>
                </svg>
                Contacter sur WhatsApp
              </a>
              <button
                onClick={() => setShowUpgradeModal(false)}
                className="w-full py-2.5 border border-gray-200 rounded-xl text-sm text-gray-500 hover:bg-gray-50 transition-colors"
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Product detail modal */}
      {detailProduct && (
        <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-black/50 p-4" onClick={() => setDetailProduct(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden" onClick={(e) => e.stopPropagation()}>
            {detailProduct.image_url && (
              <img src={detailProduct.image_url} alt={detailProduct.name} className="w-full h-52 object-cover" />
            )}
            <div className="p-5">
              <h2 className="text-base font-bold text-gray-900 mb-1">{detailProduct.name}</h2>
              {detailProduct.description && (
                <p className="text-sm text-gray-500 mb-3 leading-relaxed">{detailProduct.description}</p>
              )}
              <div className="flex items-center justify-between mb-4">
                <span className="text-lg font-bold text-rose-600">{detailProduct.sell_price_ttc.toFixed(2)} €</span>
                {detailProduct.stock <= 5 && (
                  <span className="text-xs font-semibold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                    {detailProduct.stock} restant{detailProduct.stock > 1 ? 's' : ''}
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                <button onClick={() => setDetailProduct(null)} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-500 hover:bg-gray-50">
                  Fermer
                </button>
                {canEdit && (
                  <button
                    onClick={() => {
                      if (detailProduct.has_color_variants) {
                        setDetailProduct(null);
                        handleAddProductClick(detailProduct);
                      } else {
                        addProduct(detailProduct);
                        setDetailProduct(null);
                      }
                    }}
                    disabled={detailProduct.sell_price_ttc > quotaRemaining}
                    className="flex-1 py-2.5 bg-rose-500 text-white rounded-xl text-sm font-semibold hover:bg-rose-600 disabled:opacity-30"
                  >
                    {detailProduct.sell_price_ttc > quotaRemaining ? 'Quota insuffisant' : detailProduct.has_color_variants ? 'Choisir une couleur' : 'Ajouter à la box'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Variant picker modal */}
      {variantPickerProduct && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4" onClick={() => setVariantPickerProduct(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 pt-5 pb-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-gray-900">Choisir une couleur</h2>
                <p className="text-xs text-gray-400 mt-0.5 truncate max-w-[220px]">{variantPickerProduct.name}</p>
              </div>
              <button onClick={() => setVariantPickerProduct(null)} className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors text-lg">×</button>
            </div>
            <div className="px-5 py-4">
              {variantPickerLoading ? (
                <div className="flex justify-center py-6">
                  <div className="w-6 h-6 border-2 border-rose-400 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : variantPickerVariants.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">Aucune couleur disponible</p>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {variantPickerVariants.map((v) => (
                    <button
                      key={v.id}
                      onClick={() => {
                        addProduct(variantPickerProduct, v.color_name);
                        setVariantPickerProduct(null);
                      }}
                      className="flex items-center gap-3 px-3 py-3 rounded-xl border-2 border-gray-100 hover:border-rose-300 hover:bg-rose-50 transition-all text-left"
                    >
                      <span
                        className="w-8 h-8 rounded-full shrink-0 border-2 border-white shadow"
                        style={{ backgroundColor: v.color_hex || '#ccc' }}
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-800 truncate">{v.color_name}</p>
                        <p className="text-[10px] text-gray-400">{v.quantity} dispo</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Header ── */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-sm border-b border-rose-100 px-4 py-3">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div>
            <p className="text-[10px] text-gray-400 uppercase tracking-wide">Bonjour</p>
            <h1 className="text-sm font-bold text-gray-900 leading-tight">{clientUser.clientName}</h1>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-rose-100 text-rose-700">{clientUser.planName}</span>
            <a
              href={`${WA_LINK}?text=${encodeURIComponent('Bonjour 💅\n\nJe suis abonnée à la box beauté LMDE et j\'ai besoin d\'aide. Merci !')}`}
              target="_blank"
              rel="noopener noreferrer"
              title="Service client WhatsApp"
              className="p-1.5 rounded-lg hover:bg-green-50 text-[#25D366]"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
            </a>
            <button onClick={() => { signOut(); router.replace('/client-portal/login'); }} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      {/* ── Quota bar (always visible) ── */}
      <div className="sticky top-[53px] z-20 bg-white border-b border-gray-100 px-4 py-2">
        <div className="max-w-lg mx-auto">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-semibold text-gray-600">Quota {currentMonth}</span>
            <span className="text-[11px] font-bold text-rose-600 tabular-nums">{quotaUsed.toFixed(2)} € / {quotaAmount} €</span>
          </div>
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${Math.min(100, (quotaUsed / quotaAmount) * 100)}%`,
                background: quotaUsed / quotaAmount > 0.9 ? '#f43f5e' : 'linear-gradient(to right, #fb7185, #ec4899)',
              }}
            />
          </div>
          <p className="text-[10px] text-gray-400 mt-0.5">{Math.max(0, quotaRemaining).toFixed(2)} € restant</p>
        </div>
      </div>

      {/* Push notification banner */}
      {pushStatus === 'default' && (
        <div className="bg-rose-50 border-b border-rose-200 px-4 py-2.5 flex items-center gap-3 max-w-lg mx-auto w-full">
          <span className="text-lg">🔔</span>
          <p className="flex-1 text-xs text-rose-800 font-medium">Recevez vos notifications même app fermée</p>
          <button onClick={subscribeToPush} className="bg-rose-500 text-white text-xs font-bold px-3 py-1.5 rounded-full shrink-0">Activer</button>
        </div>
      )}

      {/* ── Tab bar ── */}
      <div className="sticky top-[97px] z-10 bg-white border-b border-gray-100 px-2">
        <div className="max-w-lg mx-auto flex">
          {([
            { id: 'commande', label: 'Ma box' },
            { id: 'catalogue', label: 'Catalogue' },
            { id: 'messages', label: '🔔' },
            { id: 'historique', label: 'Historique' },
            { id: 'faq', label: 'FAQ' },
          ] as { id: Tab; label: string }[]).map((t) => (
            <button
              key={t.id}
              onClick={() => { setTab(t.id); if (t.id !== 'catalogue') setSelectedCategory(null); }}
              className={`flex-1 py-3 text-xs font-medium transition-all border-b-2 relative ${tab === t.id ? 'border-rose-500 text-rose-600' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
            >
              {t.label}
              {t.id === 'commande' && totalCartQty > 0 && (
                <span className="absolute top-2 right-1 w-4 h-4 bg-rose-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                  {totalCartQty > 9 ? '9+' : totalCartQty}
                </span>
              )}
              {t.id === 'messages' && unreadCount > 0 && (
                <span className="absolute top-2 right-1 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-4 space-y-4">

        {/* ══ MA BOX (commande) ══════════════════════════════════════════════ */}
        {tab === 'commande' && (
          <>
            {/* Offers banner */}
            {upgradePlans.length > 0 && (
              <OffersCarousel
                upgradePlans={upgradePlans}
                onSelect={(plan) => { setUpgradeTarget(plan.name); setShowUpgradeModal(true); }}
              />
            )}

            {/* Livraison banner */}
            {currentOrder?.statut_livraison === 'en_livraison' && (
              <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-pink-50 border border-pink-200">
                <span className="text-2xl">🚚</span>
                <div>
                  <p className="text-sm font-bold text-pink-700">Votre box est en route !</p>
                  <p className="text-xs text-pink-500">Votre box beauté a été expédiée et arrivera bientôt.</p>
                </div>
              </div>
            )}

            {/* Deadline */}
            <div className="flex items-center justify-between px-1">
              <span className="text-xs text-gray-400">
                {isPastDeadline ? 'Date limite dépassée' : `${daysLeft} jour${daysLeft > 1 ? 's' : ''} avant clôture`}
              </span>
              {currentOrder && (
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${STATUS_COLOR[currentOrder.statut_livraison === 'en_livraison' ? 'en_livraison' : currentOrder.status]}`}>
                  {STATUS_LABEL[currentOrder.statut_livraison === 'en_livraison' ? 'en_livraison' : currentOrder.status]}
                </span>
              )}
            </div>

            {loadingOrder ? (
              <div className="space-y-2">
                {[...Array(3)].map((_, i) => <SkeletonCard key={i} />)}
              </div>
            ) : orderItems.length === 0 ? (
              <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100 text-center">
                <div className="w-14 h-14 rounded-full bg-rose-50 flex items-center justify-center mx-auto mb-3">
                  <svg className="w-7 h-7 text-rose-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007z" />
                  </svg>
                </div>
                <p className="text-sm font-semibold text-gray-700 mb-1">Votre box est vide</p>
                <p className="text-xs text-gray-400 mb-4">Parcourez le catalogue pour choisir vos produits</p>
                <button onClick={() => setTab('catalogue')} className="px-4 py-2 bg-rose-500 text-white rounded-xl text-sm font-semibold hover:bg-rose-600 transition-colors">
                  Parcourir le catalogue
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {orderItems.map((item) => (
                  <div key={item.id} className="bg-white rounded-xl p-3 shadow-sm border border-gray-100 flex items-center gap-3">
                    {item.product?.image_url ? (
                      <img src={item.product.image_url} alt={item.product.name} className="w-12 h-12 rounded-lg object-cover shrink-0" loading="lazy" />
                    ) : (
                      <div className="w-12 h-12 rounded-lg bg-rose-50 flex items-center justify-center shrink-0">
                        <svg className="w-5 h-5 text-rose-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909" />
                        </svg>
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800 truncate">{item.product?.name ?? 'Produit'}</p>
                      {item.color_variant && (
                        <p className="text-[11px] text-gray-500 truncate">{item.color_variant}</p>
                      )}
                      <p className="text-xs text-rose-600 font-semibold tabular-nums">{item.unit_sell_price.toFixed(2)} € TTC</p>
                    </div>
                    {canEdit ? (
                      <div className="flex items-center gap-2 shrink-0">
                        <button onClick={() => removeProduct(item.id)} className="w-7 h-7 rounded-full border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12h-15" /></svg>
                        </button>
                        <span className="text-sm font-bold text-gray-700 w-5 text-center">{item.quantity}</span>
                        <button
                          onClick={() => {
                            if (item.product) {
                              addProduct({
                                id: item.product.id,
                                name: item.product.name,
                                image_url: item.product.image_url,
                                sell_price_ttc: item.unit_sell_price,
                                buy_price: item.unit_buy_price,
                                description: item.product.description,
                                category: null,
                                stock: 99,
                                product_status: 'active',
                              });
                            }
                          }}
                          className="w-7 h-7 rounded-full bg-rose-500 flex items-center justify-center text-white hover:bg-rose-600"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                        </button>
                      </div>
                    ) : (
                      <span className="text-sm font-bold text-gray-500 shrink-0">×{item.quantity}</span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Summary */}
            {orderItems.length > 0 && (
              <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Produits ({totalCartQty})</span>
                  <span className="font-semibold tabular-nums">{quotaUsed.toFixed(2)} €</span>
                </div>

                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Livraison</span>
                  <span className={shippingFree ? 'text-emerald-600 font-semibold' : 'font-semibold tabular-nums'}>
                    {shippingFree ? 'Offerte ✓' : `${shippingCost.toFixed(2)} €`}
                  </span>
                </div>
                <div className="pt-2 border-t border-gray-100 flex justify-between text-sm font-bold">
                  <span>Forfait abonnement</span>
                  <span className="tabular-nums">{(clientUser.planPrice).toFixed(2)} €</span>
                </div>
              </div>
            )}

            {/* Action buttons — always visible regardless of item count */}
            {!loadingOrder && (
              <div>
                {canEdit ? (
                  <button
                    onClick={confirmOrder}
                    disabled={confirming || orderItems.length === 0}
                    className="w-full py-3 bg-rose-500 text-white rounded-xl text-sm font-bold hover:bg-rose-600 transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
                  >
                    {confirming
                      ? <><SmallSpinner />Confirmation…</>
                      : <><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>Confirmer ma box</>
                    }
                  </button>
                ) : currentOrder?.status === 'confirmed' && !isPastDeadline && currentOrder?.statut_livraison !== 'en_livraison' ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 p-3 bg-emerald-50 rounded-xl border border-emerald-100">
                      <svg className="w-4 h-4 text-emerald-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                      <p className="text-xs text-emerald-700 font-semibold flex-1">Box confirmée ! Votre conseillère prépare votre commande.</p>
                    </div>
                    <button
                      onClick={cancelOrder}
                      disabled={cancelling}
                      className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-red-200 bg-red-50 text-red-600 text-xs font-semibold hover:bg-red-100 transition-colors disabled:opacity-50"
                    >
                      {cancelling ? '…' : '🚫 J\'ai fait une erreur — annuler ma box'}
                    </button>
                  </div>
                ) : currentOrder?.status === 'confirmed' ? (
                  <div className="flex items-center gap-2 p-3 bg-emerald-50 rounded-xl border border-emerald-100">
                    <svg className="w-4 h-4 text-emerald-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                    <p className="text-xs text-emerald-700 font-semibold">Box confirmée ! Votre conseillère prépare votre commande.</p>
                  </div>
                ) : currentOrder?.status === 'cancelled' ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 p-3 bg-red-50 rounded-xl border border-red-100">
                      <span className="text-base shrink-0">❌</span>
                      <p className="text-xs text-red-700 font-semibold flex-1">Box annulée. Modifiez votre sélection et confirmez à nouveau.</p>
                    </div>
                    {!isPastDeadline && (
                      <button
                        onClick={restartOrder}
                        disabled={restarting}
                        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-rose-500 text-white text-sm font-bold hover:bg-rose-600 transition-colors disabled:opacity-50"
                      >
                        {restarting ? '…' : '✏️ Modifier ma sélection'}
                      </button>
                    )}
                  </div>
                ) : null}
              </div>
            )}
          </>
        )}

        {/* ══ CATALOGUE ══════════════════════════════════════════════════════ */}
        {tab === 'catalogue' && (
          <>
            {/* Search */}
            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); if (e.target.value) setSelectedCategory(null); }}
                placeholder="Rechercher un produit…"
                className="w-full pl-9 pr-9 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-200 shadow-sm"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              )}
            </div>

            {loadingProducts ? (
              // Skeleton
              <div className="grid grid-cols-2 gap-3">
                {[...Array(6)].map((_, i) => <SkeletonProductCard key={i} />)}
              </div>
            ) : searchQuery ? (
              // Search results — flat list grouped
              groupedCatalog.length === 0 ? (
                <div className="bg-white rounded-2xl p-8 text-center shadow-sm border border-gray-100">
                  <p className="text-sm text-gray-400">Aucun produit pour "{searchQuery}"</p>
                </div>
              ) : (
                <div className="space-y-5">
                  {groupedCatalog.map(({ cat, products: catProds }) => (
                    <div key={cat.id}>
                      <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">{cat.name}</p>
                      <div className="grid grid-cols-3 gap-2">
                        {catProds.map((p) => (
                          <ProductCard
                            key={p.id}
                            product={p}
                            inCart={orderItems.find((i) => i.product_id === p.id)}
                            canAdd={canEdit && p.sell_price_ttc <= quotaRemaining && p.stock > 0}
                            canEdit={canEdit}
                            onAdd={() => p.has_color_variants ? handleAddProductClick(p) : addProduct(p)}
                            onRemove={(id) => removeProduct(id)}
                            onDetail={() => setDetailProduct(p)}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )
            ) : selectedCategory ? (
              // Category drill-down
              <>
                <button
                  onClick={() => setSelectedCategory(null)}
                  className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
                  </svg>
                  Toutes les catégories
                </button>

                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: selectedCategory.color + '25' }}>
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: selectedCategory.color }} />
                  </div>
                  <h2 className="text-base font-bold text-gray-900">{selectedCategory.name}</h2>
                  <span className="text-xs text-gray-400">
                    ({products.filter((p) => p.category === selectedCategory.name).length} produits)
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {products
                    .filter((p) => p.category === selectedCategory.name)
                    .map((p) => (
                      <ProductCard
                        key={p.id}
                        product={p}
                        inCart={orderItems.find((i) => i.product_id === p.id)}
                        canAdd={canEdit && p.sell_price_ttc <= quotaRemaining && p.stock > 0}
                        canEdit={canEdit}
                        onAdd={() => addProduct(p)}
                        onRemove={(id) => removeProduct(id)}
                        onDetail={() => setDetailProduct(p)}
                      />
                    ))
                  }
                </div>
              </>
            ) : (
              // Category grid
              groupedCatalog.length === 0 ? (
                <div className="bg-white rounded-2xl p-8 text-center shadow-sm border border-gray-100">
                  <p className="text-sm text-gray-400">Aucune catégorie disponible pour le moment.</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {groupedCatalog.map(({ cat, allProducts: catProds }) => {
                    const previews = catProds.filter((p) => p.image_url).slice(0, 3);
                    return (
                      <button
                        key={cat.id}
                        onClick={() => setSelectedCategory(cat)}
                        className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow text-left active:scale-[0.98]"
                      >
                        {/* Color strip */}
                        <div className="h-1.5 w-full" style={{ backgroundColor: cat.color }} />

                        {/* Preview thumbnails */}
                        <div className="flex gap-0.5 h-20 bg-gray-50">
                          {previews.length > 0 ? (
                            previews.map((p) => (
                              <div key={p.id} className="flex-1 overflow-hidden relative" style={{ flexBasis: previews.length === 1 ? '100%' : '33.3%' }}>
                                <img
                                  src={p.image_url!}
                                  alt={p.name}
                                  className="w-full h-full object-cover"
                                  loading="lazy"
                                  onError={(e) => {
                                    (e.currentTarget as HTMLImageElement).style.display = 'none';
                                    const fb = e.currentTarget.nextElementSibling as HTMLElement | null;
                                    if (fb) fb.style.display = 'flex';
                                  }}
                                />
                                <div className="absolute inset-0 items-center justify-center hidden" style={{ backgroundColor: cat.color + '20' }}>
                                  <div className="w-6 h-6 rounded-full opacity-50" style={{ backgroundColor: cat.color }} />
                                </div>
                              </div>
                            ))
                          ) : (
                            <div className="flex-1 flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${cat.color}20, ${cat.color}05)` }}>
                              <div className="w-10 h-10 rounded-full opacity-30" style={{ backgroundColor: cat.color }} />
                            </div>
                          )}
                        </div>

                        {/* Info */}
                        <div className="p-3">
                          <p className="text-sm font-bold text-gray-800 leading-tight">{cat.name}</p>
                          <p className="text-[11px] text-gray-400 mt-0.5">{catProds.length} produit{catProds.length > 1 ? 's' : ''}</p>
                          <div className="flex items-center gap-1 mt-1.5">
                            <span className="text-[11px] text-rose-500 font-semibold">Voir les produits</span>
                            <svg className="w-3 h-3 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                            </svg>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )
            )}
          </>
        )}

        {/* ══ FORMULE (abonnement) ═══════════════════════════════════════════ */}
        {tab === 'abonnement' && (
          <div className="space-y-4">
            {/* Current plan */}
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center">
                  <svg className="w-5 h-5 text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-base font-bold text-gray-900">{clientUser.planName}</h2>
                  <p className="text-xs text-gray-400">Votre formule actuelle</p>
                </div>
                {isElite && (
                  <span className="ml-auto text-xs font-bold px-2 py-0.5 rounded-full bg-gradient-to-r from-rose-500 to-pink-500 text-white">
                    ✦ Elite
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-rose-50 rounded-xl p-3">
                  <p className="text-xs text-rose-400 mb-0.5">Forfait mensuel</p>
                  <p className="text-lg font-bold text-rose-700 tabular-nums">{planData?.price ?? clientUser.planPrice} €</p>
                </div>
                <div className="bg-pink-50 rounded-xl p-3">
                  <p className="text-xs text-pink-400 mb-0.5">Quota produits</p>
                  <p className="text-lg font-bold text-pink-700 tabular-nums">{quotaAmount} €</p>
                </div>
                <div className="bg-gray-50 rounded-xl p-3 col-span-2">
                  <p className="text-xs text-gray-400 mb-0.5">Livraison</p>
                  <p className="text-sm font-semibold text-gray-700">
                    {shippingFree ? '✓ Offerte' : `${shippingCost.toFixed(2)} € par box`}
                  </p>
                </div>
                {nextBillingDate && (
                  <div className="bg-amber-50 rounded-xl p-3 col-span-2 flex items-center gap-2">
                    <span className="text-base">📅</span>
                    <div>
                      <p className="text-xs text-amber-500 mb-0.5">Prochain prélèvement</p>
                      <p className="text-sm font-semibold text-amber-800">
                        {new Date(nextBillingDate).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* WhatsApp SAV */}
            <a
              href={`${WA_LINK}?text=${encodeURIComponent('Bonjour 💅\n\nJe suis abonnée à la box beauté LMDE et j\'ai besoin d\'aide.\n\nPouvez-vous me contacter ? Merci !')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-4 bg-[#25D366] text-white rounded-2xl px-5 py-4 shadow-sm"
            >
              <svg className="w-7 h-7 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
              <div className="flex-1">
                <p className="font-bold text-sm">Contacter le service client</p>
                <p className="text-xs opacity-90">Disponible via WhatsApp · Réponse rapide</p>
              </div>
              <svg className="w-4 h-4 shrink-0 opacity-80" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </a>

            {/* Gift surprise */}
            {hasSurpriseGift ? (
              <div className="bg-gradient-to-r from-rose-500 to-pink-500 rounded-2xl p-4 text-white shadow-sm">
                <div className="flex items-center gap-3">
                  <span className="text-3xl">🎁</span>
                  <div>
                    <p className="text-sm font-bold">Cadeau surprise offert chaque mois</p>
                    <p className="text-xs opacity-80 mt-0.5">Inclus dans votre formule {clientUser.planName}</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-rose-50 border border-rose-100 rounded-2xl p-4">
                <div className="flex items-start gap-3">
                  <span className="text-2xl mt-0.5">🎁</span>
                  <div>
                    <p className="text-sm font-semibold text-gray-800">Cadeau surprise chaque mois</p>
                    <p className="text-xs text-gray-500 mt-0.5">Passez en Pro pour recevoir un cadeau surprise chaque mois !</p>
                    {upgradePlans.length > 0 && (
                      <button
                        onClick={() => { setUpgradeTarget(upgradePlans[0].name); setShowUpgradeModal(true); }}
                        className="mt-2 text-xs font-bold text-rose-500 hover:text-rose-600"
                      >
                        Découvrir la formule Pro →
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* How it works */}
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
              <h3 className="text-sm font-semibold text-gray-800 mb-2">Comment ça marche ?</h3>
              <ul className="space-y-2 text-xs text-gray-500">
                {[
                  `Parcourez le catalogue et sélectionnez jusqu'à ${quotaAmount} € de produits.`,
                  `Confirmez votre box avant le ${deadlineDay} du mois.`,
                  'Votre conseillère prépare et expédie votre box.',
                  hasSurpriseGift ? 'Un cadeau surprise est glissé dans chaque box !' : null,
                ].filter(Boolean).map((step, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="w-5 h-5 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center shrink-0 text-[10px] font-bold">{i + 1}</span>
                    {step}
                  </li>
                ))}
              </ul>
            </div>

            {/* Upgrade section */}
            {upgradePlans.length > 0 && (
              <div>
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Changer de formule</p>
                <div className="space-y-3">
                  {upgradePlans.map((plan) => (
                    <div key={plan.id} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex items-center gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="text-sm font-bold text-gray-900">{plan.name}</p>
                          {plan.name === 'Elite' && <span className="text-[10px] font-bold bg-gradient-to-r from-rose-500 to-pink-500 text-white px-1.5 py-0.5 rounded-full">TOP</span>}
                        </div>
                        <p className="text-xs text-gray-500">
                          {plan.quota_amount} € de produits · {plan.shipping_free ? 'Livraison offerte' : `Livraison ${plan.shipping_cost} €`}
                        </p>
                        {plan.description && <p className="text-[11px] text-gray-400 mt-0.5 truncate">{plan.description}</p>}
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-base font-bold text-rose-600 tabular-nums">{plan.price} €</p>
                        <p className="text-[10px] text-gray-400">/mois</p>
                        <button
                          onClick={() => { setUpgradeTarget(plan.name); setShowUpgradeModal(true); }}
                          className="mt-1.5 text-xs font-bold text-white bg-rose-500 px-2.5 py-1 rounded-lg hover:bg-rose-600 transition-colors"
                        >
                          Passer à {plan.name}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══ HISTORIQUE ════════════════════════════════════════════════════ */}
        {/* ══ MESSAGES ══════════════════════════════════════════════════════════ */}
        {tab === 'messages' && (
          <div className="space-y-3">
            <h2 className="text-sm font-bold text-gray-700 px-1">🔔 Mes notifications</h2>
            {loadingNotifs ? (
              <div className="flex justify-center py-10">
                <div className="w-6 h-6 border-2 border-rose-400 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : notifications.length === 0 ? (
              <div className="bg-white rounded-2xl p-10 shadow-sm border border-gray-100 text-center">
                <p className="text-3xl mb-3">📭</p>
                <p className="text-sm text-gray-400">Aucune notification pour le moment</p>
              </div>
            ) : notifications.map((n) => (
              <div key={n.id} className={`bg-white rounded-2xl p-4 shadow-sm border flex gap-3 ${!n.is_read ? 'border-rose-200 bg-rose-50' : 'border-gray-100'}`}>
                <div className="text-xl shrink-0 mt-0.5">
                  {n.type === 'success' ? '✅' : n.type === 'warning' ? '⚠️' : n.type === 'reminder' ? '⏰' : '💬'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800">{n.title}</p>
                  <p className="text-sm text-gray-600 mt-0.5 whitespace-pre-wrap">{n.message}</p>
                  <p className="text-[10px] text-gray-400 mt-1.5">
                    {new Date(n.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ══ FAQ ══════════════════════════════════════════════════════════════ */}
        {tab === 'faq' && (
          <div className="space-y-3">
            <h2 className="text-sm font-bold text-gray-700 px-1">❓ Questions fréquentes</h2>

            <p className="text-xs font-bold text-rose-500 px-1 pt-1">📦 MA BOX</p>
            {[
              {
                q: 'Quand puis-je composer ma box ?',
                a: 'Du 1er au 28 de chaque mois.',
              },
              {
                q: 'Que se passe-t-il si je ne compose pas avant le 28 ?',
                a: "Nous composons automatiquement votre box selon vos préférences et votre historique d'achats. Vous recevez une notification de rappel avant le 28.",
              },
              {
                q: "Puis-je modifier ma sélection après l'avoir envoyée ?",
                a: "Non. Une fois votre sélection envoyée, la commande est immédiatement prise en charge et mise en préparation. Aucune modification n'est possible en ligne. Si vous avez une urgence, contactez directement le service client LMDE par téléphone.",
              },
              {
                q: 'Puis-je dépasser mon quota dans l\'application ?',
                a: "Non. Le quota est limité à votre formule dans l'application. Si vous souhaitez commander des produits supplémentaires au-delà de votre quota, cela se fait uniquement en boutique ou via la boutique en ligne, et sera facturé séparément.",
              },
              {
                q: 'Mon quota non utilisé est-il reporté au mois suivant ?',
                a: 'Non. Le quota est valable uniquement pour le mois en cours. Il ne se reporte pas.',
              },
            ].map((item, i) => (
              <FaqItem key={`box-${i}`} question={item.q} answer={item.a} />
            ))}

            <p className="text-xs font-bold text-rose-500 px-1 pt-2">🚚 LIVRAISON & EXPÉDITION</p>
            {[
              {
                q: 'La livraison est-elle incluse dans mon abonnement ?',
                a: "Cela dépend de votre formule :\n\n• Starter (89€) → livraison en option, +8€\n• Pro (149€) → livraison offerte\n• Elite (229€) → expédition offerte (Martinique, Guadeloupe, Guyane, France)",
              },
              {
                q: "Quel est le tarif de livraison ou d'expédition ?",
                a: 'Le tarif est de 8€ quelle que soit la destination : Martinique, Guadeloupe, Guyane ou France métropolitaine. Ce tarif est identique pour toutes les zones.',
              },
              {
                q: 'Comment activer l\'option livraison sur le Starter ?',
                a: 'Dans votre espace abonnement, cliquez sur "Activer la livraison (+8€)". Le paiement est prélevé automatiquement sur votre carte enregistrée.',
              },
              {
                q: 'Puis-je choisir le retrait en boutique ?',
                a: "Oui, le retrait en boutique est toujours disponible et gratuit pour toutes les formules. Si vous venez récupérer votre box sur place, elle est disponible immédiatement dès confirmation de votre sélection.",
              },
              {
                q: 'Dans quel délai vais-je recevoir ma box ?',
                a: "• Retrait en boutique → disponible immédiatement\n• Livraison ou expédition → 2 à 5 jours ouvrés après confirmation de votre sélection",
              },
            ].map((item, i) => (
              <FaqItem key={`livraison-${i}`} question={item.q} answer={item.a} />
            ))}

            <p className="text-xs font-bold text-rose-500 px-1 pt-2">💳 PAIEMENT & ABONNEMENT</p>
            {[
              {
                q: 'Quand est prélevé mon abonnement ?',
                a: "Votre abonnement est prélevé chaque mois à la date anniversaire de votre souscription. Par exemple, si vous avez souscrit le 10 juin, vous serez prélevée le 10 de chaque mois.",
              },
              {
                q: 'Que se passe-t-il si le paiement échoue ?',
                a: "Vous recevez une notification immédiatement. Votre box est mise en attente jusqu'à régularisation du paiement. Pensez à vérifier que votre carte est à jour.",
              },
              {
                q: 'Puis-je changer de formule ?',
                a: "Oui, à tout moment. Le changement prend effet le mois suivant. Contactez le service client LMDE pour toute modification.",
              },
              {
                q: 'Puis-je suspendre ou annuler mon abonnement ?',
                a: "Oui. Contactez le service client LMDE directement. Aucun prélèvement ne sera effectué le mois suivant si la demande est faite dans les délais.",
              },
            ].map((item, i) => (
              <FaqItem key={`paiement-${i}`} question={item.q} answer={item.a} />
            ))}

            <p className="text-xs font-bold text-rose-500 px-1 pt-2">🏆 POINTS FIDÉLITÉ & QUOTA</p>
            {[
              {
                q: 'Puis-je utiliser mes points fidélité dans ma box ?',
                a: "Non. Les points de fidélité ne s'appliquent pas sur le quota de votre box. Votre quota reste toujours le même selon votre formule.",
              },
              {
                q: 'À quoi servent mes points fidélité alors ?',
                a: "Vos achats d'abonnement vous rapportent des points, mais ces points sont utilisables uniquement sur vos achats hors abonnement, c'est-à-dire en boutique ou sur la boutique en ligne. Ils ne réduisent pas votre quota mensuel.",
              },
              {
                q: 'Les produits en rupture de stock sont-ils remplacés ?',
                a: "Oui. Si un produit de votre sélection est en rupture, nous vous proposons une alternative de valeur équivalente et vous en informons.",
              },
            ].map((item, i) => (
              <FaqItem key={`fidelite-${i}`} question={item.q} answer={item.a} />
            ))}

            <p className="text-xs font-bold text-rose-500 px-1 pt-2">📱 MON APPLICATION</p>
            {[
              {
                q: 'Comment installer l\'application sur mon téléphone ?',
                a: "• iPhone → Ouvrez Safari, allez sur lmdecaisse.com/abonnement, appuyez sur le bouton Partager ↑ puis \"Sur l'écran d'accueil\"\n• Android → Ouvrez Chrome, allez sur lmdecaisse.com/abonnement, appuyez sur le menu ⋮ puis \"Installer l'application\"",
              },
              {
                q: 'Comment voir mes notifications ?',
                a: "Dans votre espace, allez sur l'onglet \"🔔 Mes messages\". Un badge rouge indique les messages non lus.",
              },
              {
                q: "J'ai oublié mon code PIN, que faire ?",
                a: "Contactez directement le service client LMDE. Nous vous générons un nouveau code immédiatement.",
              },
            ].map((item, i) => (
              <FaqItem key={`app-${i}`} question={item.q} answer={item.a} />
            ))}
          </div>
        )}

        {tab === 'historique' && (
          <div className="space-y-3">
            {pastOrders.length === 0 ? (
              <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100 text-center">
                <p className="text-2xl mb-2">📦</p>
                <p className="text-sm text-gray-400">Aucune commande passée</p>
              </div>
            ) : pastOrders.map((order) => {
              const items = pastOrderItems[order.id] ?? [];
              const isExpanded = expandedPastOrder === order.id;
              const isReordering = reordering === order.id;
              return (
                <div key={order.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                  {/* Header row */}
                  <button
                    className="w-full flex items-center justify-between px-4 py-3 text-left"
                    onClick={() => setExpandedPastOrder(isExpanded ? null : order.id)}
                  >
                    <div>
                      <span className="text-sm font-bold text-gray-800 capitalize">
                        {new Date(order.order_month + '-01').toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}
                      </span>
                      <span className="ml-2 text-xs text-gray-400">
                        {items.length > 0 ? `${items.length} produit${items.length > 1 ? 's' : ''}` : ''}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${STATUS_COLOR[order.statut_livraison === 'en_livraison' ? 'en_livraison' : order.status]}`}>
                        {STATUS_LABEL[order.statut_livraison === 'en_livraison' ? 'en_livraison' : order.status]}
                      </span>
                      <svg className={`w-4 h-4 text-gray-300 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                      </svg>
                    </div>
                  </button>

                  {/* Totals summary */}
                  <div className="grid grid-cols-3 gap-2 text-center px-4 pb-3 border-b border-gray-50">
                    <div>
                      <p className="text-[10px] text-gray-400">Produits</p>
                      <p className="text-sm font-bold text-gray-700 tabular-nums">{(order.total_sell_price ?? 0).toFixed(2)} €</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-gray-400">Livraison</p>
                      <p className="text-sm font-bold">
                        {(order.shipping_cost ?? 0) === 0
                          ? <span className="text-emerald-600">Offerte</span>
                          : <span className="text-gray-700 tabular-nums">{(order.shipping_cost ?? 0).toFixed(2)} €</span>}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-gray-400">Forfait</p>
                      <p className="text-sm font-bold text-rose-600 tabular-nums">{clientUser.planPrice.toFixed(2)} €</p>
                    </div>
                  </div>

                  {/* Expanded: product list + reorder button */}
                  {isExpanded && (
                    <div className="px-4 py-3 space-y-3">
                      {items.length === 0 ? (
                        <p className="text-xs text-gray-400 text-center py-2">Aucun produit enregistré pour cette box</p>
                      ) : (
                        <div className="space-y-2">
                          {items.map((item) => (
                            <div key={item.id} className="flex items-center gap-3">
                              {item.product?.image_url ? (
                                <img src={item.product.image_url} alt={item.product?.name} className="w-10 h-10 rounded-xl object-cover border border-gray-100 shrink-0" />
                              ) : (
                                <div className="w-10 h-10 rounded-xl bg-rose-50 flex items-center justify-center shrink-0">
                                  <span className="text-lg">💄</span>
                                </div>
                              )}
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-semibold text-gray-800 truncate">{item.product?.name ?? 'Produit'}</p>
                                {item.color_variant && (
                                  <p className="text-[10px] text-gray-400">{item.color_variant}</p>
                                )}
                              </div>
                              <div className="text-right shrink-0">
                                <p className="text-xs font-bold text-gray-700">{item.unit_sell_price.toFixed(2)} €</p>
                                {item.quantity > 1 && <p className="text-[10px] text-gray-400">× {item.quantity}</p>}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Reorder button */}
                      {items.length > 0 && canEdit && (
                        <button
                          onClick={() => reorderFromPast(order.id)}
                          disabled={isReordering}
                          className="w-full mt-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-rose-500 text-white text-sm font-bold hover:bg-rose-600 transition-colors disabled:opacity-60"
                        >
                          {isReordering ? (
                            <>
                              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                              </svg>
                              Ajout en cours…
                            </>
                          ) : (
                            <>🔁 Reprendre cette commande</>
                          )}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function FaqItem({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full px-4 py-4 flex items-center justify-between gap-3 text-left"
      >
        <span className="text-sm font-semibold text-gray-800">{question}</span>
        <span className={`text-gray-400 text-lg shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}>▾</span>
      </button>
      {open && (
        <div className="px-4 pb-4 text-sm text-gray-600 leading-relaxed border-t border-gray-50 pt-3">
          {answer}
        </div>
      )}
    </div>
  );
}

interface ProductCardProps {
  product: PortalProduct;
  inCart: OrderItem | undefined;
  canAdd: boolean;
  canEdit: boolean;
  onAdd: () => void;
  onRemove: (id: string) => void;
  onDetail: () => void;
}

function ProductCard({ product, inCart, canAdd, canEdit, onAdd, onRemove, onDetail }: ProductCardProps) {
  const isOutOfStock = product.stock <= 0;

  return (
    <div className={`bg-white rounded-xl shadow-sm border overflow-hidden flex flex-col ${isOutOfStock ? 'border-red-200 opacity-80' : 'border-gray-100'}`}>
      {/* Image */}
      <div className="relative cursor-pointer" onClick={onDetail}>
        {product.image_url ? (
          <img src={product.image_url} alt={product.name} className={`w-full h-24 object-cover ${isOutOfStock ? 'grayscale' : ''}`} loading="lazy" />
        ) : (
          <div className="w-full h-24 bg-rose-50 flex items-center justify-center">
            <svg className="w-7 h-7 text-rose-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909" />
            </svg>
          </div>
        )}
        {/* RUPTURE badge */}
        {isOutOfStock && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/20">
            <span className="text-[10px] font-black bg-red-600 text-white px-2 py-0.5 rounded tracking-widest uppercase shadow">
              RUPTURE
            </span>
          </div>
        )}
        {/* Low stock warning */}
        {!isOutOfStock && product.stock <= 4 && (
          <span className="absolute top-1 left-1 text-[8px] font-bold bg-amber-400 text-white px-1 py-0.5 rounded leading-none">
            {product.stock} restant{product.stock > 1 ? 's' : ''}
          </span>
        )}
        {inCart && !isOutOfStock && (
          <span className="absolute top-1 right-1 w-4 h-4 bg-rose-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
            {inCart.quantity}
          </span>
        )}
      </div>

      {/* Info */}
      <div className="p-2 flex flex-col flex-1">
        <p className="text-[11px] font-bold text-gray-800 leading-tight line-clamp-2 flex-1">{product.name}</p>
        {product.description && (
          <p className="text-[10px] text-gray-400 line-clamp-1 mt-0.5">{product.description}</p>
        )}
        <div className="flex items-center justify-between mt-1.5">
          <span className={`text-xs font-bold tabular-nums ${isOutOfStock ? 'text-gray-400' : 'text-rose-600'}`}>
            {product.sell_price_ttc.toFixed(2)} €
          </span>
          {isOutOfStock ? (
            <span className="text-[9px] font-bold text-red-500 uppercase tracking-wide">Indisponible</span>
          ) : inCart ? (
            <div className="flex items-center gap-1">
              <button onClick={() => onRemove(inCart.id)} className="w-5 h-5 rounded-full border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50">
                <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12h-15" /></svg>
              </button>
              <span className="text-[10px] font-bold text-gray-700">{inCart.quantity}</span>
              <button onClick={onAdd} disabled={!canAdd} className="w-5 h-5 rounded-full bg-rose-500 flex items-center justify-center text-white hover:bg-rose-600 disabled:opacity-30">
                <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
              </button>
            </div>
          ) : (
            <button onClick={onAdd} disabled={!canAdd} className="w-6 h-6 rounded-full bg-rose-500 flex items-center justify-center text-white hover:bg-rose-600 transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function OffersCarousel({
  upgradePlans,
  onSelect,
}: {
  upgradePlans: SubscriptionPlan[];
  onSelect: (plan: SubscriptionPlan) => void;
}) {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (upgradePlans.length <= 1) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % upgradePlans.length), 4500);
    return () => clearInterval(t);
  }, [upgradePlans.length]);

  const plan = upgradePlans[idx];
  if (!plan) return null;

  return (
    <div className="relative overflow-hidden rounded-2xl shadow-md" style={{ background: 'linear-gradient(135deg, #ec4899 0%, #a855f7 100%)' }}>
      {/* Animated shimmer line */}
      <div className="absolute top-0 left-0 right-0 h-0.5 bg-white/30 animate-pulse" />

      <div className="p-4 text-white">
        {/* Badge + dots */}
        <div className="flex items-center justify-between mb-3">
          <span className="animate-pulse inline-flex items-center gap-1.5 text-[10px] font-bold bg-white/20 border border-white/30 px-2.5 py-1 rounded-full tracking-wide">
            <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping inline-block" />
            OFFRE DU MOMENT
          </span>
          {upgradePlans.length > 1 && (
            <div className="flex gap-1.5">
              {upgradePlans.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setIdx(i)}
                  className={`rounded-full transition-all ${i === idx ? 'w-4 h-1.5 bg-white' : 'w-1.5 h-1.5 bg-white/40'}`}
                />
              ))}
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-lg font-bold leading-tight">Formule {plan.name}</p>
            <p className="text-xs text-white/80 mt-0.5">
              {plan.quota_amount} € de produits · {plan.shipping_free ? 'Livraison offerte ✓' : `Livraison ${plan.shipping_cost} €`}
            </p>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="text-2xl font-black tabular-nums">{plan.price} €</span>
              <span className="text-xs text-white/70">/mois</span>
            </div>
          </div>
          <button
            onClick={() => onSelect(plan)}
            className="shrink-0 px-4 py-2.5 bg-white text-rose-600 rounded-xl text-xs font-bold hover:bg-rose-50 transition-colors whitespace-nowrap shadow-sm"
          >
            Passer à {plan.name} →
          </button>
        </div>
      </div>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="bg-white rounded-xl p-3 shadow-sm border border-gray-100 flex items-center gap-3 animate-pulse">
      <div className="w-12 h-12 rounded-lg bg-gray-100 shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="h-3 bg-gray-100 rounded w-3/4" />
        <div className="h-2.5 bg-gray-100 rounded w-1/2" />
      </div>
    </div>
  );
}

function SkeletonProductCard() {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden animate-pulse">
      <div className="w-full h-24 bg-gray-100" />
      <div className="p-2 space-y-1.5">
        <div className="h-3 bg-gray-100 rounded" />
        <div className="h-2.5 bg-gray-100 rounded w-2/3" />
        <div className="h-4 bg-gray-100 rounded w-1/2" />
      </div>
    </div>
  );
}

function SmallSpinner() {
  return (
    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

function FullscreenSpinner() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-rose-50">
      <svg className="w-7 h-7 animate-spin text-rose-400" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
    </div>
  );
}
