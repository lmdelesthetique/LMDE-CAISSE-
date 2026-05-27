'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useClientAuth } from '@/contexts/ClientAuthContext';

type OrderStatus = 'open' | 'confirmed' | 'preparing' | 'shipped' | 'auto';

interface OrderItem {
  id: string;
  product_id: string | null;
  color_variant: string | null;
  quantity: number;
  unit_buy_price: number;
  unit_sell_price: number;
  total_sell_price: number;
  product?: {
    id: string;
    name: string;
    image_url: string | null;
    sell_price_ttc: number;
    description: string | null;
  } | null;
}

interface SubscriptionOrder {
  id: string;
  order_month: string;
  status: OrderStatus;
  total_products_cost: number;
  total_sell_price: number;
  benefit_amount: number;
  shipping_cost: number;
  deadline_date: string | null;
}

interface PortalProduct {
  id: string;
  name: string;
  image_url: string | null;
  sell_price_ttc: number;
  description: string | null;
  category: string | null;
  stock: number;
  product_status: string;
}

interface VisibleCategory {
  id: string;
  name: string;
  color: string;
  icon: string;
}

const STATUS_LABEL: Record<OrderStatus, string> = {
  open: 'En cours',
  confirmed: 'Confirmée',
  preparing: 'En préparation',
  shipped: 'Expédiée',
  auto: 'Générée auto',
};
const STATUS_COLOR: Record<OrderStatus, string> = {
  open: 'bg-amber-50 text-amber-700 border-amber-200',
  confirmed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  preparing: 'bg-blue-50 text-blue-700 border-blue-200',
  shipped: 'bg-purple-50 text-purple-700 border-purple-200',
  auto: 'bg-gray-50 text-gray-600 border-gray-200',
};

type Tab = 'commande' | 'catalogue' | 'abonnement' | 'historique';

export default function ClientDashboardPage() {
  const router = useRouter();
  const { clientUser, loading: authLoading, signOut } = useClientAuth();

  const [tab, setTab] = useState<Tab>('commande');
  const [currentOrder, setCurrentOrder] = useState<SubscriptionOrder | null>(null);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [products, setProducts] = useState<PortalProduct[]>([]);
  const [visibleCategories, setVisibleCategories] = useState<VisibleCategory[]>([]);
  const [pastOrders, setPastOrders] = useState<SubscriptionOrder[]>([]);
  const [loadingOrder, setLoadingOrder] = useState(true);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const currentMonth = new Date().toISOString().slice(0, 7);
  const today = new Date();
  const deadlineDay = 25;
  const deadlineDate = new Date(today.getFullYear(), today.getMonth(), deadlineDay);
  const isPastDeadline = today.getDate() > deadlineDay;
  const daysLeft = isPastDeadline ? 0 : deadlineDay - today.getDate();

  const quotaUsed = orderItems.reduce((s, i) => s + i.unit_sell_price * i.quantity, 0);
  const quotaRemaining = clientUser ? clientUser.quotaAmount - quotaUsed : 0;

  useEffect(() => {
    if (!authLoading && !clientUser) router.replace('/client-portal/login');
  }, [authLoading, clientUser, router]);

  const loadCurrentOrder = useCallback(async () => {
    if (!clientUser) return;
    setLoadingOrder(true);
    const supabase = createClient();

    const { data: existing } = await supabase
      .from('subscription_orders')
      .select('*')
      .eq('subscription_id', clientUser.subscriptionId)
      .eq('order_month', currentMonth)
      .limit(1);

    let order: SubscriptionOrder | null = existing?.[0] ?? null;

    if (!order && !isPastDeadline) {
      const { data: newOrder } = await supabase
        .from('subscription_orders')
        .insert({
          subscription_id: clientUser.subscriptionId,
          order_month: currentMonth,
          status: 'open',
          shipping_cost: clientUser.shippingFree ? 0 : clientUser.shippingCost,
          deadline_date: deadlineDate.toISOString().slice(0, 10),
        })
        .select()
        .single();
      order = newOrder;
    }

    setCurrentOrder(order);

    if (order) {
      const { data: items } = await supabase
        .from('subscription_order_items')
        .select('*, product:products(id, name, image_url, sell_price_ttc, description)')
        .eq('order_id', order.id);
      setOrderItems(items ?? []);
    }

    setLoadingOrder(false);
  }, [clientUser, currentMonth, isPastDeadline]);

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
        .select('id, name, image_url, sell_price_ttc, description, category, stock, product_status')
        .eq('product_status', 'active')
        .gt('stock', 0)
        .order('name'),
    ]);

    const visibleCatNames = new Set((cats ?? []).map((c: any) => c.name));
    const filtered = (prods ?? []).filter((p: any) => visibleCatNames.has(p.category));

    setVisibleCategories(cats ?? []);
    setProducts(filtered as PortalProduct[]);
    setLoadingProducts(false);
  }, [clientUser]);

  const loadPastOrders = useCallback(async () => {
    if (!clientUser) return;
    const supabase = createClient();
    const { data } = await supabase
      .from('subscription_orders')
      .select('*')
      .eq('subscription_id', clientUser.subscriptionId)
      .neq('order_month', currentMonth)
      .order('order_month', { ascending: false });
    setPastOrders(data ?? []);
  }, [clientUser, currentMonth]);

  useEffect(() => {
    if (clientUser) { loadCurrentOrder(); loadPastOrders(); }
  }, [clientUser, loadCurrentOrder, loadPastOrders]);

  useEffect(() => {
    if (tab === 'catalogue' && products.length === 0) loadProducts();
  }, [tab, products.length, loadProducts]);

  const addProduct = async (product: PortalProduct) => {
    if (!currentOrder || !clientUser) return;
    if (product.sell_price_ttc > quotaRemaining) return;
    const supabase = createClient();
    const existing = orderItems.find((i) => i.product_id === product.id);
    if (existing) {
      const newQty = existing.quantity + 1;
      const newTotal = product.sell_price_ttc * newQty;
      await supabase
        .from('subscription_order_items')
        .update({ quantity: newQty, total_sell_price: newTotal })
        .eq('id', existing.id);
      setOrderItems((prev) =>
        prev.map((i) => i.id === existing.id ? { ...i, quantity: newQty, total_sell_price: newTotal } : i)
      );
    } else {
      const { data: newItem } = await supabase
        .from('subscription_order_items')
        .insert({
          order_id: currentOrder.id,
          product_id: product.id,
          quantity: 1,
          unit_buy_price: 0,
          unit_sell_price: product.sell_price_ttc,
          total_sell_price: product.sell_price_ttc,
        })
        .select('*, product:products(id, name, image_url, sell_price_ttc, description)')
        .single();
      if (newItem) setOrderItems((prev) => [...prev, newItem]);
    }
  };

  const removeProduct = async (itemId: string) => {
    if (!currentOrder) return;
    const supabase = createClient();
    const item = orderItems.find((i) => i.id === itemId);
    if (!item) return;
    if (item.quantity > 1) {
      const newQty = item.quantity - 1;
      const newTotal = item.unit_sell_price * newQty;
      await supabase
        .from('subscription_order_items')
        .update({ quantity: newQty, total_sell_price: newTotal })
        .eq('id', itemId);
      setOrderItems((prev) =>
        prev.map((i) => i.id === itemId ? { ...i, quantity: newQty, total_sell_price: newTotal } : i)
      );
    } else {
      await supabase.from('subscription_order_items').delete().eq('id', itemId);
      setOrderItems((prev) => prev.filter((i) => i.id !== itemId));
    }
  };

  const confirmOrder = async () => {
    if (!currentOrder || currentOrder.status !== 'open') return;
    setConfirming(true);
    const supabase = createClient();
    const shippingCost = clientUser?.shippingFree ? 0 : (clientUser?.shippingCost ?? 0);
    const totalBuy = orderItems.reduce((s, i) => s + i.unit_buy_price * i.quantity, 0);
    const benefit = (clientUser?.planPrice ?? 0) - totalBuy - shippingCost;
    await supabase
      .from('subscription_orders')
      .update({
        status: 'confirmed',
        total_products_cost: totalBuy,
        total_sell_price: quotaUsed,
        benefit_amount: Math.max(0, benefit),
        shipping_cost: shippingCost,
      })
      .eq('id', currentOrder.id);
    setCurrentOrder((prev) => prev ? { ...prev, status: 'confirmed' } : prev);
    setConfirming(false);
  };

  // Grouped products by visible category, filtered by search
  const groupedCatalog = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return visibleCategories
      .map((cat) => {
        const catProducts = products.filter((p) => {
          if (p.category !== cat.name) return false;
          if (!q) return true;
          return (
            p.name.toLowerCase().includes(q) ||
            (p.description ?? '').toLowerCase().includes(q)
          );
        });
        return { cat, products: catProducts };
      })
      .filter((g) => g.products.length > 0);
  }, [visibleCategories, products, searchQuery]);

  const canEdit = currentOrder?.status === 'open' && !isPastDeadline;

  if (authLoading || !clientUser) return <FullscreenSpinner />;

  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50 via-pink-50/30 to-stone-50">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-sm border-b border-rose-100 px-4 py-3">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-400">Bonjour,</p>
            <h1 className="text-base font-semibold text-gray-900 leading-tight">{clientUser.clientName}</h1>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-rose-100 text-rose-700">
              {clientUser.planName}
            </span>
            <button
              onClick={() => { signOut(); router.replace('/client-portal/login'); }}
              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      {/* Quota bar — always visible */}
      <div className="sticky top-[57px] z-20 bg-white border-b border-gray-100 px-4 py-2.5">
        <div className="max-w-lg mx-auto">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold text-gray-700">Quota {currentMonth}</span>
            <span className="text-xs font-bold text-rose-600 tabular-nums">{quotaUsed.toFixed(2)} € / {clientUser.quotaAmount} €</span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-rose-400 to-pink-500 rounded-full transition-all"
              style={{ width: `${Math.min(100, (quotaUsed / clientUser.quotaAmount) * 100)}%` }}
            />
          </div>
          <p className="text-[10px] text-gray-400 mt-0.5 text-right">
            {Math.max(0, quotaRemaining).toFixed(2)} € restant
          </p>
        </div>
      </div>

      {/* Tab bar */}
      <div className="sticky top-[106px] z-10 bg-white border-b border-gray-100 px-4">
        <div className="max-w-lg mx-auto flex">
          {([
            { id: 'commande', label: 'Ma commande' },
            { id: 'catalogue', label: 'Catalogue' },
            { id: 'abonnement', label: 'Abonnement' },
            { id: 'historique', label: 'Historique' },
          ] as { id: Tab; label: string }[]).map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-1 py-3 text-xs font-medium transition-all border-b-2 ${
                tab === t.id ? 'border-rose-500 text-rose-600' : 'border-transparent text-gray-400 hover:text-gray-600'
              }`}
            >
              {t.label}
              {t.id === 'commande' && orderItems.length > 0 && (
                <span className="ml-1 inline-flex items-center justify-center w-4 h-4 text-[10px] bg-rose-500 text-white rounded-full">
                  {orderItems.reduce((s, i) => s + i.quantity, 0)}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-5 space-y-4">

        {/* ── COMMANDE ── */}
        {tab === 'commande' && (
          <>
            {currentOrder && (
              <div className="flex items-center justify-between px-1">
                <span className="text-xs text-gray-400">Commande {currentMonth}</span>
                <div className="flex items-center gap-2">
                  {!isPastDeadline && (
                    <span className="text-xs text-gray-400">{daysLeft} j avant clôture</span>
                  )}
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${STATUS_COLOR[currentOrder.status]}`}>
                    {STATUS_LABEL[currentOrder.status]}
                  </span>
                </div>
              </div>
            )}

            {loadingOrder ? (
              <div className="flex justify-center py-10"><Spinner /></div>
            ) : orderItems.length === 0 ? (
              <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100 text-center">
                <div className="w-14 h-14 rounded-full bg-rose-50 flex items-center justify-center mx-auto mb-3">
                  <svg className="w-7 h-7 text-rose-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007z" />
                  </svg>
                </div>
                <p className="text-sm font-medium text-gray-700 mb-1">Votre box est vide</p>
                <p className="text-xs text-gray-400 mb-4">Parcourez le catalogue pour choisir vos produits</p>
                <button
                  onClick={() => setTab('catalogue')}
                  className="px-4 py-2 bg-rose-500 text-white rounded-xl text-sm font-medium hover:bg-rose-600 transition-colors"
                >
                  Parcourir le catalogue
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {orderItems.map((item) => (
                  <div key={item.id} className="bg-white rounded-xl p-3 shadow-sm border border-gray-100 flex items-center gap-3">
                    {item.product?.image_url ? (
                      <img src={item.product.image_url} alt={item.product.name} className="w-12 h-12 rounded-lg object-cover shrink-0" />
                    ) : (
                      <div className="w-12 h-12 rounded-lg bg-rose-50 flex items-center justify-center shrink-0">
                        <svg className="w-6 h-6 text-rose-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909" />
                        </svg>
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{item.product?.name ?? 'Produit'}</p>
                      {item.color_variant && <p className="text-xs text-gray-400">{item.color_variant}</p>}
                      <p className="text-xs text-rose-600 font-semibold">{item.unit_sell_price.toFixed(2)} € TTC / unité</p>
                    </div>
                    {canEdit ? (
                      <div className="flex items-center gap-2 shrink-0">
                        <button onClick={() => removeProduct(item.id)} className="w-7 h-7 rounded-full border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50 transition-colors">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12h-15" /></svg>
                        </button>
                        <span className="text-sm font-semibold text-gray-700 w-5 text-center">{item.quantity}</span>
                        <button
                          onClick={() => item.product && addProduct({ ...item.product, sell_price_ttc: item.unit_sell_price, category: null, stock: 99, product_status: 'active' })}
                          disabled={item.unit_sell_price > quotaRemaining}
                          className="w-7 h-7 rounded-full bg-rose-500 flex items-center justify-center text-white hover:bg-rose-600 transition-colors disabled:opacity-30"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                        </button>
                      </div>
                    ) : (
                      <span className="text-sm font-semibold text-gray-600 shrink-0">×{item.quantity}</span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {orderItems.length > 0 && (
              <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Produits ({orderItems.reduce((s, i) => s + i.quantity, 0)})</span>
                  <span className="font-semibold">{quotaUsed.toFixed(2)} €</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Livraison</span>
                  <span className={clientUser.shippingFree ? 'text-emerald-600 font-semibold' : 'font-semibold'}>
                    {clientUser.shippingFree ? 'Offerte' : `${clientUser.shippingCost.toFixed(2)} €`}
                  </span>
                </div>
                <div className="pt-2 border-t border-gray-100 flex justify-between text-sm font-bold">
                  <span>Forfait abonnement</span>
                  <span>{clientUser.planPrice.toFixed(2)} €</span>
                </div>
                {canEdit && (
                  <button
                    onClick={confirmOrder}
                    disabled={confirming || orderItems.length === 0}
                    className="w-full mt-3 py-3 bg-rose-500 text-white rounded-xl text-sm font-semibold hover:bg-rose-600 transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
                  >
                    {confirming ? <><Spinner sm />Confirmation…</> : <>
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                      Confirmer ma box
                    </>}
                  </button>
                )}
                {currentOrder?.status === 'confirmed' && (
                  <div className="flex items-center gap-2 p-3 bg-emerald-50 rounded-xl border border-emerald-100">
                    <svg className="w-4 h-4 text-emerald-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                    <p className="text-xs text-emerald-700 font-medium">Box confirmée ! Votre conseillère prépare votre commande.</p>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* ── CATALOGUE ── */}
        {tab === 'catalogue' && (
          <>
            {/* Sticky search */}
            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Rechercher un produit…"
                className="w-full pl-9 pr-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-200 shadow-sm"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              )}
            </div>

            {loadingProducts ? (
              <div className="flex justify-center py-10"><Spinner /></div>
            ) : groupedCatalog.length === 0 ? (
              <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100 text-center">
                <p className="text-sm text-gray-400">
                  {searchQuery ? 'Aucun produit ne correspond à votre recherche.' : 'Aucun produit disponible pour le moment.'}
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {groupedCatalog.map(({ cat, products: catProducts }) => (
                  <div key={cat.id}>
                    {/* Category header */}
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: cat.color + '25' }}>
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: cat.color }} />
                      </div>
                      <h3 className="text-sm font-bold text-gray-800">{cat.name}</h3>
                      <span className="text-xs text-gray-400">({catProducts.length})</span>
                    </div>

                    {/* Product grid */}
                    <div className="grid grid-cols-2 gap-3">
                      {catProducts.map((product) => {
                        const inCart = orderItems.find((i) => i.product_id === product.id);
                        const canAdd = canEdit && product.sell_price_ttc <= quotaRemaining;
                        const isLowStock = product.stock <= 3;

                        return (
                          <div key={product.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                            {/* Image */}
                            <div className="relative">
                              {product.image_url ? (
                                <img src={product.image_url} alt={product.name} className="w-full h-32 object-cover" />
                              ) : (
                                <div className="w-full h-32 flex items-center justify-center" style={{ backgroundColor: cat.color + '10' }}>
                                  <svg className="w-10 h-10" style={{ color: cat.color + '60' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909" />
                                  </svg>
                                </div>
                              )}
                              {isLowStock && (
                                <span className="absolute top-1.5 left-1.5 text-[9px] font-bold bg-amber-400 text-white px-1.5 py-0.5 rounded-full">
                                  {product.stock} restant{product.stock > 1 ? 's' : ''}
                                </span>
                              )}
                              {inCart && (
                                <span className="absolute top-1.5 right-1.5 w-5 h-5 bg-rose-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                                  {inCart.quantity}
                                </span>
                              )}
                            </div>

                            {/* Info */}
                            <div className="p-3">
                              <p className="text-xs font-semibold text-gray-800 leading-tight line-clamp-2 mb-1">{product.name}</p>
                              {product.description && (
                                <p className="text-[10px] text-gray-400 line-clamp-2 mb-2 leading-relaxed">{product.description}</p>
                              )}
                              <div className="flex items-center justify-between mt-auto">
                                <span className="text-sm font-bold text-rose-600">{product.sell_price_ttc.toFixed(2)} €</span>
                                {inCart ? (
                                  <div className="flex items-center gap-1.5">
                                    <button
                                      onClick={() => removeProduct(inCart.id)}
                                      disabled={!canEdit}
                                      className="w-6 h-6 rounded-full border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50 disabled:opacity-30"
                                    >
                                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12h-15" /></svg>
                                    </button>
                                    <span className="text-xs font-bold text-gray-700 w-4 text-center">{inCart.quantity}</span>
                                    <button
                                      onClick={() => addProduct(product)}
                                      disabled={!canAdd}
                                      className="w-6 h-6 rounded-full bg-rose-500 flex items-center justify-center text-white hover:bg-rose-600 disabled:opacity-30"
                                    >
                                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => addProduct(product)}
                                    disabled={!canAdd}
                                    className="w-7 h-7 rounded-full bg-rose-500 flex items-center justify-center text-white hover:bg-rose-600 transition-colors disabled:opacity-30"
                                    title={!canAdd && !canEdit ? 'Commande clôturée' : !canAdd ? 'Quota insuffisant' : 'Ajouter'}
                                  >
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                                  </button>
                                )}
                              </div>
                              {!canAdd && canEdit && product.sell_price_ttc > quotaRemaining && (
                                <p className="text-[10px] text-amber-500 mt-1 text-right">Quota insuffisant</p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ── ABONNEMENT ── */}
        {tab === 'abonnement' && (
          <div className="space-y-4">
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
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-rose-50 rounded-xl p-3">
                  <p className="text-xs text-rose-400 mb-0.5">Forfait mensuel</p>
                  <p className="text-lg font-bold text-rose-700">{clientUser.planPrice} €</p>
                </div>
                <div className="bg-pink-50 rounded-xl p-3">
                  <p className="text-xs text-pink-400 mb-0.5">Quota produits</p>
                  <p className="text-lg font-bold text-pink-700">{clientUser.quotaAmount} €</p>
                </div>
                <div className="bg-gray-50 rounded-xl p-3 col-span-2">
                  <p className="text-xs text-gray-400 mb-0.5">Livraison</p>
                  <p className="text-sm font-semibold text-gray-700">
                    {clientUser.shippingFree ? 'Offerte' : `${clientUser.shippingCost} € par box`}
                  </p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
              <h3 className="text-sm font-semibold text-gray-800 mb-2">Comment ça marche ?</h3>
              <ul className="space-y-2 text-xs text-gray-500">
                <li className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center shrink-0 text-[10px] font-bold mt-0.5">1</span>
                  Parcourez le catalogue et sélectionnez vos produits jusqu'au quota de {clientUser.quotaAmount} €.
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center shrink-0 text-[10px] font-bold mt-0.5">2</span>
                  Confirmez votre box avant le {deadlineDay} du mois.
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center shrink-0 text-[10px] font-bold mt-0.5">3</span>
                  Votre conseillère prépare et expédie votre box selon votre formule.
                </li>
              </ul>
            </div>
          </div>
        )}

        {/* ── HISTORIQUE ── */}
        {tab === 'historique' && (
          <div className="space-y-3">
            {pastOrders.length === 0 ? (
              <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100 text-center">
                <p className="text-sm text-gray-400">Aucune commande passée</p>
              </div>
            ) : (
              pastOrders.map((order) => (
                <div key={order.id} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-semibold text-gray-800">
                      {new Date(order.order_month + '-01').toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}
                    </span>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${STATUS_COLOR[order.status]}`}>
                      {STATUS_LABEL[order.status]}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div>
                      <p className="text-[10px] text-gray-400">Produits</p>
                      <p className="text-sm font-bold text-gray-700">{order.total_sell_price.toFixed(2)} €</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-gray-400">Livraison</p>
                      <p className="text-sm font-bold text-gray-700">
                        {order.shipping_cost === 0
                          ? <span className="text-emerald-600">Offerte</span>
                          : `${order.shipping_cost.toFixed(2)} €`}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-gray-400">Forfait</p>
                      <p className="text-sm font-bold text-rose-600">{clientUser.planPrice.toFixed(2)} €</p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Spinner({ sm }: { sm?: boolean }) {
  return (
    <svg className={`animate-spin text-rose-400 ${sm ? 'w-4 h-4' : 'w-6 h-6'}`} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

function FullscreenSpinner() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-rose-50">
      <Spinner />
    </div>
  );
}
