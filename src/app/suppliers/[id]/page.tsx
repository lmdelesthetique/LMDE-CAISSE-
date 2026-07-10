'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import AppLayout from '@/components/AppLayout';
import Icon from '@/components/ui/AppIcon';
import {
  supplierService, Supplier, SupplierOrder, SupplierPayment, SupplierClaim, SupplierMessage,
  OrderStatus, PaymentStatus, ClaimStatus
} from '@/lib/services/supplierService';
import SupplierFormModal from '../components/SupplierFormModal';
import OrderFormModal from '../components/OrderFormModal';
import PaymentFormModal from '../components/PaymentFormModal';
import ClaimFormModal from '../components/ClaimFormModal';
import MessagingPanel from '../components/MessagingPanel';
import { createClient } from '@/lib/supabase/client';
import { fetchAll } from '@/lib/utils/fetchAll';

const supabase = createClient();

type Tab = 'overview' | 'orders' | 'payments' | 'claims' | 'messages' | 'products';

const ORDER_STATUS_CONFIG: Record<OrderStatus, { label: string; color: string }> = {
  draft:                         { label: 'Brouillon',              color: 'text-gray-600 bg-gray-100' },
  sent:                          { label: 'Envoyée',                color: 'text-blue-700 bg-blue-50' },
  awaiting_validation:           { label: 'En attente validation',  color: 'text-amber-700 bg-amber-50' },
  modification_requested:        { label: 'Modif. demandée',        color: 'text-orange-700 bg-orange-50' },
  validated:                     { label: 'Validée',                color: 'text-teal-700 bg-teal-50' },
  awaiting_payment:              { label: 'Attente paiement',       color: 'text-amber-700 bg-amber-50' },
  payment_sent:                  { label: 'Paiement envoyé',        color: 'text-blue-700 bg-blue-50' },
  payment_confirmed:             { label: 'Paiement confirmé',      color: 'text-emerald-700 bg-emerald-50' },
  payment_pending:               { label: 'Paiement en attente',    color: 'text-amber-700 bg-amber-50' },
  payment_in_progress:           { label: 'Paiement en cours',      color: 'text-blue-700 bg-blue-50' },
  paid:                          { label: 'Payée',                  color: 'text-emerald-700 bg-emerald-50' },
  payment_received_by_supplier:  { label: 'Paiement reçu fournisseur', color: 'text-emerald-700 bg-emerald-50' },
  in_preparation:                { label: 'En préparation',         color: 'text-purple-700 bg-purple-50' },
  in_production:                 { label: 'En production',          color: 'text-violet-700 bg-violet-50' },
  ready_to_ship:                 { label: 'Prête à expédier',       color: 'text-teal-700 bg-teal-50' },
  shipped:                       { label: 'Expédiée',               color: 'text-indigo-700 bg-indigo-50' },
  partially_received:            { label: 'Reçue partiel.',         color: 'text-amber-700 bg-amber-50' },
  fully_received:                { label: 'Reçue totalement',       color: 'text-emerald-700 bg-emerald-50' },
  costs_recorded:                { label: 'Frais enregistrés',      color: 'text-teal-700 bg-teal-50' },
  stock_integrated:              { label: 'Stock intégré',          color: 'text-green-700 bg-green-50' },
  received:                      { label: 'Reçue',                  color: 'text-emerald-700 bg-emerald-50' },
  issue_reported:                { label: 'Problème signalé',       color: 'text-red-700 bg-red-50' },
  refund_requested:              { label: 'Remb. demandé',          color: 'text-red-700 bg-red-50' },
  refund_received:               { label: 'Remb. reçu',             color: 'text-emerald-700 bg-emerald-50' },
  closed:                        { label: 'Clôturée',               color: 'text-gray-600 bg-gray-100' },
  suspended:                     { label: 'Suspendue',              color: 'text-red-700 bg-red-50' },
  cancelled:                     { label: 'Annulée',                color: 'text-gray-500 bg-gray-100' },
};

const PAYMENT_STATUS_CONFIG: Record<PaymentStatus, { label: string; color: string }> = {
  pending:   { label: 'En attente',  color: 'text-amber-700 bg-amber-50' },
  sent:      { label: 'Envoyé',      color: 'text-blue-700 bg-blue-50' },
  confirmed: { label: 'Confirmé',    color: 'text-emerald-700 bg-emerald-50' },
  partial:   { label: 'Partiel',     color: 'text-orange-700 bg-orange-50' },
  overdue:   { label: 'En retard',   color: 'text-red-700 bg-red-50' },
};

const CLAIM_STATUS_CONFIG: Record<ClaimStatus, { label: string; color: string }> = {
  draft:            { label: 'Brouillon',         color: 'text-gray-600 bg-gray-100' },
  sent:             { label: 'Envoyée',            color: 'text-blue-700 bg-blue-50' },
  awaiting_response:{ label: 'Attente réponse',   color: 'text-amber-700 bg-amber-50' },
  accepted:         { label: 'Acceptée',           color: 'text-emerald-700 bg-emerald-50' },
  refused:          { label: 'Refusée',            color: 'text-red-700 bg-red-50' },
  refund_pending:   { label: 'Remb. en attente',  color: 'text-orange-700 bg-orange-50' },
  refund_received:  { label: 'Remb. reçu',        color: 'text-emerald-700 bg-emerald-50' },
  closed:           { label: 'Clôturée',           color: 'text-gray-500 bg-gray-100' },
};

function StatusPill({ label, color }: { label: string; color: string }) {
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>{label}</span>;
}

export default function SupplierDetailPage() {
  const params = useParams();
  const router = useRouter();
  const supplierId = params?.id as string;

  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [orders, setOrders] = useState<SupplierOrder[]>([]);
  const [payments, setPayments] = useState<SupplierPayment[]>([]);
  const [claims, setClaims] = useState<SupplierClaim[]>([]);
  const [messages, setMessages] = useState<SupplierMessage[]>([]);
  const [stats, setStats] = useState({ totalOrders: 0, totalSpent: 0, totalClaims: 0, totalRefunded: 0, activeOrders: 0 });
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [linkedProducts, setLinkedProducts] = useState<any[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);

  const [showEditForm, setShowEditForm] = useState(false);
  const [showOrderForm, setShowOrderForm] = useState(false);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [showClaimForm, setShowClaimForm] = useState(false);
  const [showAccessModal, setShowAccessModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteInfo, setDeleteInfo] = useState<{ activeOrders: number; linkedProducts: number } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    if (!supplierId) return;
    setLoading(true);
    try {
      const [sup, ords, pays, clms, msgs, st] = await Promise.all([
        supplierService.getById(supplierId),
        supplierService.getOrders(supplierId),
        supplierService.getPayments(supplierId),
        supplierService.getClaims(supplierId),
        supplierService.getMessages(supplierId),
        supplierService.getSupplierStats(supplierId),
      ]);
      setSupplier(sup);
      setOrders(ords);
      setPayments(pays);
      setClaims(clms);
      setMessages(msgs);
      setStats(st);
    } catch (e) {
      // handle silently
    } finally {
      setLoading(false);
    }
  }, [supplierId]);

  const loadLinkedProducts = useCallback(async () => {
    if (!supplierId) return;
    setProductsLoading(true);
    const data = await fetchAll<any>((from, to) =>
      supabase
        .from('products')
        .select('id, name, ref, category, image_url, stock, min_stock, buy_price, sell_price_ttc, product_status, is_suspended')
        .eq('supplier_id', supplierId)
        .order('name')
        .range(from, to)
    );
    setLinkedProducts(data);
    setProductsLoading(false);
  }, [supplierId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (activeTab === 'products') loadLinkedProducts(); }, [activeTab, loadLinkedProducts]);

  const handleUpdateOrderStatus = async (orderId: string, status: OrderStatus) => {
    await supplierService.updateOrderStatus(orderId, status);
    load();
  };

  const handleUpdatePaymentStatus = async (paymentId: string, status: PaymentStatus) => {
    await supplierService.updatePaymentStatus(paymentId, status);
    load();
  };

  const handleUpdateClaimStatus = async (claimId: string, status: ClaimStatus) => {
    await supplierService.updateClaimStatus(claimId, status);
    load();
  };

  const handleSendMessage = async (content: string) => {
    await supplierService.sendMessage({ supplierId, sender: 'store', content });
    load();
  };

  const handleDeleteClick = async () => {
    const info = await supplierService.getDeleteInfo(supplierId);
    setDeleteInfo(info);
    setShowDeleteConfirm(true);
  };

  const handleConfirmDelete = async () => {
    setDeleting(true);
    await supplierService.permanentDelete(supplierId);
    setDeleting(false);
    router.push('/suppliers');
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-screen">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </AppLayout>
    );
  }

  if (!supplier) {
    return (
      <AppLayout>
        <div className="p-6 text-center">
          <p className="text-muted-foreground">Fournisseur introuvable</p>
          <button onClick={() => router.push('/suppliers')} className="mt-3 text-primary text-sm underline">Retour à la liste</button>
        </div>
      </AppLayout>
    );
  }

  const TABS: { id: Tab; label: string; icon: string; count?: number }[] = [
    { id: 'overview',  label: 'Vue d\'ensemble', icon: 'HomeIcon' },
    { id: 'products',  label: 'Produits rattachés', icon: 'TagIcon', count: linkedProducts.length || undefined },
    { id: 'orders',    label: 'Commandes',        icon: 'ClipboardDocumentListIcon', count: orders.length },
    { id: 'payments',  label: 'Paiements',        icon: 'BanknotesIcon',             count: payments.length },
    { id: 'claims',    label: 'Réclamations',     icon: 'ExclamationCircleIcon',     count: claims.length },
    { id: 'messages',  label: 'Messagerie',       icon: 'ChatBubbleLeftRightIcon',   count: messages.filter((m) => !m.isRead && m.sender === 'supplier').length || undefined },
  ];

  return (
    <AppLayout>
      <div className="p-6 max-w-screen-xl mx-auto">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-5">
          <button onClick={() => router.push('/suppliers')} className="hover:text-foreground transition-colors">Fournisseurs</button>
          <Icon name="ChevronRightIcon" size={14} />
          <span className="text-foreground font-medium">{supplier.companyName}</span>
        </div>

        {/* Header */}
        <div className="bg-white border border-border rounded-2xl p-6 mb-5 shadow-card">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
                <span className="text-primary font-700 text-xl">{supplier.companyName.charAt(0).toUpperCase()}</span>
              </div>
              <div>
                <h1 className="text-xl font-700 text-foreground">{supplier.companyName}</h1>
                {supplier.contactName && <p className="text-sm text-muted-foreground">{supplier.contactName}</p>}
                <div className="flex flex-wrap items-center gap-3 mt-2">
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Icon name="GlobeAltIcon" size={13} />
                    {supplier.country} · {supplier.language}
                  </span>
                  {supplier.email && (
                    <a href={`mailto:${supplier.email}`} className="flex items-center gap-1.5 text-xs text-primary hover:underline">
                      <Icon name="EnvelopeIcon" size={13} />
                      {supplier.email}
                    </a>
                  )}
                  {supplier.whatsapp && (
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Icon name="PhoneIcon" size={13} />
                      {supplier.whatsapp}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <button
              onClick={() => setShowEditForm(true)}
              className="flex items-center gap-2 px-4 py-2 border border-border rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:border-primary/30 transition-colors"
            >
              <Icon name="PencilIcon" size={14} />
              Modifier
            </button>
            <button
              onClick={() => setShowAccessModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              <Icon name="KeyIcon" size={14} />
              Générer accès fournisseur
            </button>
            <button
              onClick={handleDeleteClick}
              className="flex items-center gap-2 px-4 py-2 border border-red-200 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 hover:border-red-300 transition-colors"
            >
              <Icon name="TrashIcon" size={14} />
              Supprimer
            </button>
          </div>

          {/* KPI strip */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-5 pt-5 border-t border-border">
            {[
              { label: 'Commandes', value: stats.totalOrders, icon: 'ClipboardDocumentListIcon', color: 'text-primary' },
              { label: 'Actives', value: stats.activeOrders, icon: 'ArrowPathIcon', color: 'text-violet-600' },
              { label: 'Total dépensé', value: `${stats.totalSpent.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €`, icon: 'BanknotesIcon', color: 'text-emerald-600' },
              { label: 'Réclamations', value: stats.totalClaims, icon: 'ExclamationCircleIcon', color: 'text-amber-600' },
              { label: 'Remboursé', value: `${stats.totalRefunded.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €`, icon: 'ArrowUturnLeftIcon', color: 'text-red-500' },
            ].map((kpi) => (
              <div key={kpi.label} className="text-center">
                <p className={`text-lg font-700 ${kpi.color}`}>{kpi.value}</p>
                <p className="text-xs text-muted-foreground">{kpi.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 bg-muted rounded-xl p-1 mb-5 overflow-x-auto">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
                activeTab === tab.id ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon name={tab.icon as any} size={15} />
              {tab.label}
              {tab.count !== undefined && tab.count > 0 && (
                <span className={`text-[10px] font-600 rounded-full px-1.5 py-0.5 min-w-[18px] text-center ${activeTab === tab.id ? 'bg-primary text-primary-foreground' : 'bg-muted-foreground/20 text-muted-foreground'}`}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Info card */}
            <div className="bg-white border border-border rounded-xl p-5 shadow-card">
              <h3 className="font-600 text-foreground mb-4 flex items-center gap-2"><Icon name="InformationCircleIcon" size={16} className="text-primary" />Informations</h3>
              <dl className="space-y-2.5">
                {[
                  { label: 'Adresse', value: supplier.address },
                  { label: 'Site web', value: supplier.website, link: true },
                  { label: 'Alibaba / 1688', value: supplier.alibabaLink, link: true },
                  { label: 'WeChat', value: supplier.wechat },
                  { label: 'Délai production', value: supplier.productionDelayDays ? `${supplier.productionDelayDays} jours` : null },
                  { label: 'Délai expédition', value: supplier.shippingDelayDays ? `${supplier.shippingDelayDays} jours` : null },
                  { label: 'Minimum commande', value: supplier.minimumOrder },
                  { label: 'Conditions paiement', value: supplier.paymentConditions },
                ].filter((i) => i.value).map((item) => (
                  <div key={item.label} className="flex gap-3">
                    <dt className="text-xs text-muted-foreground w-36 shrink-0">{item.label}</dt>
                    <dd className="text-xs text-foreground flex-1">
                      {item.link ? (
                        <a href={item.value!} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline truncate block">{item.value}</a>
                      ) : item.value}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>

            {/* Notes + Categories */}
            <div className="space-y-4">
              {supplier.categories && supplier.categories.length > 0 && (
                <div className="bg-white border border-border rounded-xl p-5 shadow-card">
                  <h3 className="font-600 text-foreground mb-3 flex items-center gap-2"><Icon name="TagIcon" size={16} className="text-primary" />Catégories</h3>
                  <div className="flex flex-wrap gap-2">
                    {supplier.categories.map((cat) => (
                      <span key={cat} className="px-3 py-1 bg-primary/10 text-primary rounded-full text-xs font-medium">{cat}</span>
                    ))}
                  </div>
                </div>
              )}
              {supplier.notes && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
                  <h3 className="font-600 text-amber-800 mb-2 flex items-center gap-2"><Icon name="DocumentTextIcon" size={16} />Notes internes</h3>
                  <p className="text-sm text-amber-700 whitespace-pre-wrap">{supplier.notes}</p>
                </div>
              )}
              {supplier.bankDetails && (
                <div className="bg-white border border-border rounded-xl p-5 shadow-card">
                  <h3 className="font-600 text-foreground mb-2 flex items-center gap-2"><Icon name="BuildingLibraryIcon" size={16} className="text-primary" />Coordonnées bancaires</h3>
                  <p className="text-xs text-muted-foreground whitespace-pre-wrap font-mono">{supplier.bankDetails}</p>
                </div>
              )}
              {supplier.portalLogin && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-5">
                  <h3 className="font-600 text-blue-800 mb-3 flex items-center gap-2"><Icon name="KeyIcon" size={16} />Accès portail fournisseur</h3>
                  <dl className="space-y-2">
                    <div className="flex gap-3">
                      <dt className="text-xs text-blue-600 w-28 shrink-0">Code PIN</dt>
                      <dd className="text-xs text-blue-800 font-mono flex-1 tracking-widest">{supplier.portalLogin}</dd>
                    </div>
                    <div className="flex gap-3">
                      <dt className="text-xs text-blue-600 w-28 shrink-0">URL portail</dt>
                      <dd className="text-xs flex-1">
                        <a href="/supplier-portal/login" target="_blank" rel="noopener noreferrer" className="text-blue-700 hover:underline">/supplier-portal/login</a>
                      </dd>
                    </div>
                  </dl>
                </div>
              )}
            </div>

            {/* Recent orders */}
            {orders.length > 0 && (
              <div className="lg:col-span-2 bg-white border border-border rounded-xl p-5 shadow-card">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-600 text-foreground flex items-center gap-2"><Icon name="ClipboardDocumentListIcon" size={16} className="text-primary" />Dernières commandes</h3>
                  <button onClick={() => setActiveTab('orders')} className="text-xs text-primary hover:underline">Voir tout</button>
                </div>
                <div className="space-y-2">
                  {orders.slice(0, 3).map((order) => {
                    const cfg = ORDER_STATUS_CONFIG[order.orderStatus] || { label: order.orderStatus, color: 'text-gray-600 bg-gray-100' };
                    return (
                      <div key={order.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                        <div>
                          <p className="text-sm font-medium text-foreground">{order.orderNumber}</p>
                          <p className="text-xs text-muted-foreground">{new Date(order.createdAt).toLocaleDateString('fr-FR')}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <StatusPill label={cfg.label} color={cfg.color} />
                          <span className="text-sm font-600 text-foreground">{order.totalAmount.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} {order.currency}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'orders' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-600 text-foreground">Commandes fournisseur</h2>
              <button onClick={() => setShowOrderForm(true)} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors">
                <Icon name="PlusIcon" size={15} />
                Nouvelle commande
              </button>
            </div>

            {/* Alert: supplier responses pending */}
            {orders.some((o) => o.supplierResponse === 'refused') && (
              <div className="flex items-start gap-3 p-4 mb-4 bg-red-50 border border-red-200 rounded-xl">
                <Icon name="ExclamationCircleIcon" size={18} className="text-red-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-600 text-red-800">
                    {orders.filter((o) => o.supplierResponse === 'refused').length} commande{orders.filter((o) => o.supplierResponse === 'refused').length > 1 ? 's' : ''} refusée{orders.filter((o) => o.supplierResponse === 'refused').length > 1 ? 's' : ''} par le fournisseur
                  </p>
                  <p className="text-xs text-red-600 mt-0.5">Consultez les commentaires ci-dessous et prenez les mesures nécessaires.</p>
                </div>
              </div>
            )}

            {orders.length === 0 ? (
              <div className="bg-white border border-border rounded-xl p-10 text-center">
                <Icon name="ClipboardDocumentListIcon" size={36} className="text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground text-sm">Aucune commande pour ce fournisseur</p>
              </div>
            ) : (
              <div className="space-y-3">
                {orders.map((order) => {
                  const cfg = ORDER_STATUS_CONFIG[order.orderStatus] || { label: order.orderStatus, color: 'text-gray-600 bg-gray-100' };
                  const hasRefused = order.supplierResponse === 'refused';
                  const hasAccepted = order.supplierResponse === 'accepted';
                  const hasPending = order.supplierResponse === 'pending' || !order.supplierResponse;
                  return (
                    <div key={order.id} className={`bg-white border rounded-xl p-5 shadow-card ${hasRefused ? 'border-red-200 bg-red-50/20' : 'border-border'}`}>
                      <div className="flex items-start justify-between gap-4 mb-3">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="font-600 text-foreground">{order.orderNumber}</h3>
                            <StatusPill label={cfg.label} color={cfg.color} />
                            {/* Supplier response badge */}
                            {hasAccepted && (
                              <span className="inline-flex items-center gap-1 text-xs font-600 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                                <Icon name="CheckCircleIcon" size={11} />
                                Acceptée par fournisseur
                              </span>
                            )}
                            {hasRefused && (
                              <span className="inline-flex items-center gap-1 text-xs font-600 px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200">
                                <Icon name="XCircleIcon" size={11} />
                                Refusée par fournisseur
                              </span>
                            )}
                            {hasPending && ['sent', 'awaiting_validation', 'validated'].includes(order.orderStatus) && (
                              <span className="inline-flex items-center gap-1 text-xs font-600 px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                                <Icon name="ClockIcon" size={11} />
                                En attente réponse
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">Créée le {new Date(order.createdAt).toLocaleDateString('fr-FR')}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-700 text-foreground">{order.totalAmount.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} {order.currency}</p>
                          <p className="text-xs text-muted-foreground">dont {order.shippingCost.toFixed(2)} € transport · {order.customsCost.toFixed(2)} € douane</p>
                        </div>
                      </div>

                      {/* Supplier comment (especially when refused) */}
                      {order.supplierComment && (
                        <div className={`mb-3 px-3 py-2.5 rounded-lg text-xs border ${hasRefused ? 'bg-red-50 border-red-100 text-red-700' : 'bg-emerald-50 border-emerald-100 text-emerald-700'}`}>
                          <span className="font-600">Commentaire fournisseur : </span>
                          {order.supplierComment}
                        </div>
                      )}

                      {order.items && order.items.length > 0 && (
                        <div className="bg-muted/50 rounded-lg p-3 mb-3">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-muted-foreground">
                                <th className="text-left font-medium pb-1">Produit</th>
                                <th className="text-right font-medium pb-1">Qté</th>
                                <th className="text-right font-medium pb-1">P.U.</th>
                                <th className="text-right font-medium pb-1">Total</th>
                              </tr>
                            </thead>
                            <tbody>
                              {order.items.map((item, i) => (
                                <tr key={i} className="border-t border-border/50">
                                  <td className="py-1 text-foreground">{item.name}</td>
                                  <td className="py-1 text-right text-muted-foreground">{item.qty}</td>
                                  <td className="py-1 text-right text-muted-foreground">{item.unit_price.toFixed(2)} €</td>
                                  <td className="py-1 text-right font-medium text-foreground">{item.total.toFixed(2)} €</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}

                      <div className="flex flex-wrap items-center gap-2">
                        {order.trackingNumber && (
                          <span className="flex items-center gap-1.5 text-xs text-indigo-700 bg-indigo-50 px-2 py-1 rounded-full">
                            <Icon name="TruckIcon" size={12} />
                            {order.trackingNumber}
                          </span>
                        )}
                        {order.notes && <span className="text-xs text-muted-foreground italic truncate max-w-xs">{order.notes}</span>}
                        <div className="ml-auto flex items-center gap-2">
                          <select
                            value={order.orderStatus}
                            onChange={(e) => handleUpdateOrderStatus(order.id, e.target.value as OrderStatus)}
                            className="text-xs border border-border rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-primary/20"
                          >
                            {Object.entries(ORDER_STATUS_CONFIG).map(([k, v]) => (
                              <option key={k} value={k}>{v.label}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {activeTab === 'payments' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-600 text-foreground">Suivi des paiements</h2>
              <button onClick={() => setShowPaymentForm(true)} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors">
                <Icon name="PlusIcon" size={15} />
                Enregistrer un paiement
              </button>
            </div>
            {payments.length === 0 ? (
              <div className="bg-white border border-border rounded-xl p-10 text-center">
                <Icon name="BanknotesIcon" size={36} className="text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground text-sm">Aucun paiement enregistré</p>
              </div>
            ) : (
              <div className="bg-white border border-border rounded-xl shadow-card overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left px-4 py-3 text-xs font-600 text-muted-foreground">Date</th>
                      <th className="text-left px-4 py-3 text-xs font-600 text-muted-foreground">Montant</th>
                      <th className="text-left px-4 py-3 text-xs font-600 text-muted-foreground">Méthode</th>
                      <th className="text-left px-4 py-3 text-xs font-600 text-muted-foreground">Statut</th>
                      <th className="text-left px-4 py-3 text-xs font-600 text-muted-foreground">Notes</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((pay) => {
                      const cfg = PAYMENT_STATUS_CONFIG[pay.paymentStatus] || { label: pay.paymentStatus, color: 'text-gray-600 bg-gray-100' };
                      const methodLabels: Record<string, string> = { wire_transfer: 'Virement', wise: 'Wise', alibaba: 'Alibaba', paypal: 'PayPal', other: 'Autre' };
                      return (
                        <tr key={pay.id} className="border-t border-border hover:bg-muted/30 transition-colors">
                          <td className="px-4 py-3 text-muted-foreground">{pay.paidAt ? new Date(pay.paidAt).toLocaleDateString('fr-FR') : '—'}</td>
                          <td className="px-4 py-3 font-600 text-foreground">{pay.amount.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} {pay.currency}</td>
                          <td className="px-4 py-3 text-muted-foreground">{methodLabels[pay.paymentMethod] || pay.paymentMethod}</td>
                          <td className="px-4 py-3"><StatusPill label={cfg.label} color={cfg.color} /></td>
                          <td className="px-4 py-3 text-muted-foreground text-xs max-w-[200px] truncate">{pay.notes || '—'}</td>
                          <td className="px-4 py-3">
                            <select
                              value={pay.paymentStatus}
                              onChange={(e) => handleUpdatePaymentStatus(pay.id, e.target.value as PaymentStatus)}
                              className="text-xs border border-border rounded-lg px-2 py-1 bg-white focus:outline-none"
                            >
                              {Object.entries(PAYMENT_STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                            </select>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeTab === 'claims' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-600 text-foreground">Réclamations produits</h2>
              <button onClick={() => setShowClaimForm(true)} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors">
                <Icon name="PlusIcon" size={15} />
                Nouvelle réclamation
              </button>
            </div>
            {claims.length === 0 ? (
              <div className="bg-white border border-border rounded-xl p-10 text-center">
                <Icon name="ExclamationCircleIcon" size={36} className="text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground text-sm">Aucune réclamation pour ce fournisseur</p>
              </div>
            ) : (
              <div className="space-y-3">
                {claims.map((claim) => {
                  const cfg = CLAIM_STATUS_CONFIG[claim.claimStatus] || { label: claim.claimStatus, color: 'text-gray-600 bg-gray-100' };
                  const typeLabels: Record<string, string> = {
                    defective: 'Défectueux', wrong_color: 'Mauvaise couleur', wrong_reference: 'Mauvaise référence',
                    bad_quality: 'Mauvaise qualité', broken: 'Cassé', wrong_packaging: 'Mauvais packaging',
                    missing_quantity: 'Quantité manquante', other: 'Autre'
                  };
                  const actionLabels: Record<string, string> = { refund: 'Remboursement', credit: 'Avoir', replacement: 'Remplacement', future_modification: 'Modif. future' };
                  return (
                    <div key={claim.id} className="bg-white border border-border rounded-xl p-5 shadow-card">
                      <div className="flex items-start justify-between gap-4 mb-3">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-medium text-red-600 bg-red-50 px-2 py-0.5 rounded-full">{typeLabels[claim.claimType] || claim.claimType}</span>
                            <StatusPill label={cfg.label} color={cfg.color} />
                          </div>
                          {claim.productName && <p className="text-sm font-600 text-foreground">{claim.productName}</p>}
                          <p className="text-xs text-muted-foreground mt-0.5">{new Date(claim.createdAt).toLocaleDateString('fr-FR')}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-600 text-red-600">{claim.estimatedLoss.toFixed(2)} € de perte</p>
                          <p className="text-xs text-muted-foreground">{claim.affectedQuantity} unité{claim.affectedQuantity > 1 ? 's' : ''}</p>
                        </div>
                      </div>
                      <p className="text-sm text-foreground mb-3">{claim.description}</p>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Action demandée : <span className="font-medium text-foreground">{actionLabels[claim.requestedAction] || claim.requestedAction}</span></span>
                        <select
                          value={claim.claimStatus}
                          onChange={(e) => handleUpdateClaimStatus(claim.id, e.target.value as ClaimStatus)}
                          className="text-xs border border-border rounded-lg px-2 py-1 bg-white focus:outline-none"
                        >
                          {Object.entries(CLAIM_STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                        </select>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {activeTab === 'messages' && (
          <MessagingPanel
            supplierId={supplierId}
            supplierName={supplier.companyName}
            orders={orders.map((o) => ({ id: o.id, order_number: o.orderNumber }))}
            onRefresh={load}
          />
        )}

        {activeTab === 'products' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-600 text-foreground">Produits rattachés à ce fournisseur</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Ces produits apparaissent dans les commandes fournisseur et le portail</p>
              </div>
              <a
                href="/product-management"
                className="flex items-center gap-2 px-4 py-2 border border-border rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:border-primary/30 transition-colors"
              >
                <Icon name="PlusIcon" size={14} />
                Gérer les produits
              </a>
            </div>
            {productsLoading ? (
              <div className="flex items-center justify-center py-16">
                <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : linkedProducts.length === 0 ? (
              <div className="bg-white border border-border rounded-xl p-10 text-center">
                <Icon name="TagIcon" size={36} className="text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground text-sm font-500">Aucun produit rattaché</p>
                <p className="text-xs text-muted-foreground mt-1 max-w-xs mx-auto">
                  Pour rattacher un produit à ce fournisseur, ouvrez la fiche produit et sélectionnez ce fournisseur dans le champ "Fournisseur".
                </p>
                <a href="/product-management" className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-600 hover:opacity-90 transition-opacity">
                  <Icon name="ArrowTopRightOnSquareIcon" size={14} />
                  Aller à la gestion des produits
                </a>
              </div>
            ) : (
              <div className="bg-white border border-border rounded-xl shadow-card overflow-hidden">
                <div className="px-4 py-3 border-b border-border bg-muted/20 flex items-center gap-2">
                  <span className="text-xs font-600 text-muted-foreground">{linkedProducts.length} produit{linkedProducts.length > 1 ? 's' : ''} rattaché{linkedProducts.length > 1 ? 's' : ''}</span>
                </div>
                <div className="divide-y divide-border">
                  {linkedProducts.map((p) => {
                    const stock = Number(p.stock) || 0;
                    const minStock = Number(p.min_stock) || 5;
                    const buyPrice = Number(p.buy_price) || 0;
                    const sellPrice = Number(p.sell_price_ttc) || 0;
                    const stockOk = stock > minStock;
                    const stockLow = stock > 0 && stock <= minStock;
                    const stockOut = stock <= 0;
                    return (
                      <div key={p.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/20 transition-colors">
                        <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0 overflow-hidden border border-border/50">
                          {p.image_url ? (
                            <img src={p.image_url} alt={`Photo de ${p.name}`} className="w-full h-full object-cover" />
                          ) : (
                            <Icon name="PhotoIcon" size={16} className="text-muted-foreground" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-500 text-foreground truncate">{p.name}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs text-muted-foreground font-mono">{p.ref}</span>
                            {p.category && <span className="text-[10px] bg-secondary text-secondary-foreground px-1.5 py-0.5 rounded">{p.category}</span>}
                          </div>
                        </div>
                        <div className="text-right shrink-0 mr-2">
                          <p className="text-xs text-muted-foreground">Achat: <span className="font-600 text-foreground">{buyPrice.toFixed(2)} €</span></p>
                          <p className="text-xs text-muted-foreground">Vente: <span className="font-600 text-foreground">{sellPrice.toFixed(2)} €</span></p>
                        </div>
                        <div className="text-center shrink-0 mr-2">
                          <p className="text-xs text-muted-foreground">Stock</p>
                          <p className={`text-sm font-700 ${stockOut ? 'text-red-600' : stockLow ? 'text-amber-600' : 'text-emerald-600'}`}>{stock}</p>
                        </div>
                        <span className={`shrink-0 text-[10px] font-600 px-2 py-1 rounded-full ${stockOut ? 'bg-red-100 text-red-700' : stockLow ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                          {stockOut ? 'Rupture' : stockLow ? 'Faible' : 'En stock'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {showEditForm && (
        <SupplierFormModal supplier={supplier} onClose={() => setShowEditForm(false)} onSaved={() => { setShowEditForm(false); load(); }} />
      )}
      {showOrderForm && (
        <OrderFormModal supplierId={supplierId} onClose={() => setShowOrderForm(false)} onSaved={() => { setShowOrderForm(false); load(); }} />
      )}
      {showPaymentForm && (
        <PaymentFormModal supplierId={supplierId} orders={orders} onClose={() => setShowPaymentForm(false)} onSaved={() => { setShowPaymentForm(false); load(); }} />
      )}
      {showClaimForm && (
        <ClaimFormModal supplierId={supplierId} orders={orders} onClose={() => setShowClaimForm(false)} onSaved={() => { setShowClaimForm(false); load(); }} />
      )}
      {showAccessModal && supplier && (
        <SupplierAccessModal supplier={supplier} onClose={() => setShowAccessModal(false)} onSaved={() => { setShowAccessModal(false); load(); }} />
      )}

      {showDeleteConfirm && deleteInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 animate-fade-in">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center shrink-0">
                <Icon name="TrashIcon" size={20} className="text-red-600" />
              </div>
              <div>
                <h2 className="text-base font-700 text-foreground">Supprimer ce fournisseur</h2>
                <p className="text-sm text-muted-foreground">{supplier.companyName}</p>
              </div>
            </div>

            {deleteInfo.activeOrders > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-3 flex items-start gap-2">
                <Icon name="ExclamationTriangleIcon" size={16} className="text-amber-600 mt-0.5 shrink-0" />
                <p className="text-xs text-amber-800 font-500">Ce fournisseur a <strong>{deleteInfo.activeOrders} commande{deleteInfo.activeOrders > 1 ? 's' : ''} active{deleteInfo.activeOrders > 1 ? 's' : ''}</strong>. Elles seront conservées mais détachées du fournisseur.</p>
              </div>
            )}
            {deleteInfo.linkedProducts > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-3 flex items-start gap-2">
                <Icon name="InformationCircleIcon" size={16} className="text-blue-600 mt-0.5 shrink-0" />
                <p className="text-xs text-blue-800"><strong>{deleteInfo.linkedProducts} produit{deleteInfo.linkedProducts > 1 ? 's' : ''}</strong> sera délié{deleteInfo.linkedProducts > 1 ? 's' : ''} de ce fournisseur.</p>
              </div>
            )}

            <p className="text-sm text-muted-foreground mb-6">Cette action est irréversible. L'accès portail fournisseur sera aussi supprimé.</p>

            <div className="flex gap-3 justify-end">
              <button onClick={() => setShowDeleteConfirm(false)} className="px-4 py-2 text-sm font-600 border border-border rounded-lg text-muted-foreground hover:bg-muted transition-colors">
                Annuler
              </button>
              <button onClick={handleConfirmDelete} disabled={deleting} className="flex items-center gap-2 px-4 py-2 text-sm font-600 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50">
                {deleting ? <><Icon name="ArrowPathIcon" size={14} className="animate-spin" />Suppression…</> : <><Icon name="TrashIcon" size={14} />Supprimer définitivement</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}

// ─── Supplier Access Modal ────────────────────────────────────────────────────

interface SupplierAccessModalProps {
  supplier: Supplier;
  onClose: () => void;
  onSaved: () => void;
}

function SupplierAccessModal({ supplier, onClose, onSaved }: SupplierAccessModalProps) {
  const [step, setStep] = useState<'generate' | 'generated'>('generate');
  const [generatedToken, setGeneratedToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || (typeof window !== 'undefined' ? window.location.origin : '');
  const portalLink = generatedToken ? `${siteUrl}/supplier-portal/${generatedToken}` : '';

  // Detect if existing token (UUID format) or old PIN
  const hasExistingToken = !!supplier.portalLogin;
  const isOldPin = hasExistingToken && /^\d{4,8}$/.test(supplier.portalLogin ?? '');
  const existingLink = hasExistingToken && !isOldPin
    ? `${siteUrl}/supplier-portal/${supplier.portalLogin}`
    : null;

  async function handleGenerate() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/suppliers/${supplier.id}/portal-token`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Erreur serveur');
      setGeneratedToken(json.token);
      setStep('generated');
    } catch (err: any) {
      setError(err.message || 'Erreur lors de la génération');
    } finally {
      setLoading(false);
    }
  }

  function handleCopyLink(link: string) {
    navigator.clipboard.writeText(link).catch(() => {});
    setCopied('link');
    setTimeout(() => setCopied(''), 2000);
  }

  function handleWhatsApp(link: string) {
    const phone = (supplier.whatsapp || supplier.phone || '').replace(/\D/g, '');
    if (!phone) { alert('Aucun numéro WhatsApp enregistré pour ce fournisseur'); return; }
    const msg = encodeURIComponent(
      `Bonjour ${supplier.companyName} 👋\n\nVoici votre espace commandes LMDE (lien unique permanent) :\n👉 ${link}\n\nAjoutez-le à votre écran d'accueil pour ne rien manquer.\n\nLe Monde de l'Esthétique 💅`
    );
    window.open(`https://wa.me/${phone}?text=${msg}`, '_blank');
  }

  const displayLink = portalLink || existingLink || '';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
              <Icon name="LinkIcon" size={18} className="text-primary" />
            </div>
            <div>
              <h2 className="text-base font-700 text-foreground">Espace fournisseur</h2>
              <p className="text-xs text-muted-foreground">{supplier.companyName}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground transition-colors">
            <Icon name="XMarkIcon" size={18} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {step === 'generate' ? (
            <>
              <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-200 rounded-xl text-sm text-blue-800">
                <Icon name="InformationCircleIcon" size={16} className="shrink-0 mt-0.5 text-blue-600" />
                <p>Un lien unique et permanent est généré pour ce fournisseur. Il n'a pas besoin de mot de passe — il clique sur le lien et accède directement à son espace.</p>
              </div>

              {existingLink && (
                <div className="space-y-2">
                  <p className="text-xs font-600 text-muted-foreground uppercase tracking-wide">Lien actuel</p>
                  <div className="flex items-center gap-2 p-3 bg-muted/30 rounded-xl border border-border">
                    <p className="text-xs text-primary flex-1 font-mono truncate">{existingLink}</p>
                    <button onClick={() => handleCopyLink(existingLink)} className="shrink-0 text-xs px-2 py-1 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors">
                      Copier
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground">Générer un nouveau lien révoquera l'accès via l'ancien.</p>
                </div>
              )}

              {isOldPin && (
                <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-700">
                  <Icon name="ExclamationTriangleIcon" size={14} className="shrink-0 mt-0.5" />
                  Ancien accès par PIN détecté ({supplier.portalLogin}). Générez un lien permanent pour remplacer.
                </div>
              )}

              {error && (
                <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                  <Icon name="ExclamationCircleIcon" size={14} />
                  {error}
                </div>
              )}

              <button
                onClick={handleGenerate}
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-600 hover:bg-primary/90 disabled:opacity-60 transition-colors"
              >
                {loading ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Icon name="LinkIcon" size={15} />}
                {loading ? 'Génération…' : existingLink ? 'Générer un nouveau lien' : 'Générer le lien d\'accès'}
              </button>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-700">
                <Icon name="CheckCircleIcon" size={16} />
                Lien généré avec succès !
              </div>

              <div className="space-y-2">
                <p className="text-xs font-600 text-muted-foreground uppercase tracking-wide">Lien permanent</p>
                <div className="p-3 bg-muted/30 rounded-xl border border-border">
                  <p className="text-xs text-primary font-mono break-all">{displayLink}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => handleCopyLink(displayLink)}
                  className={`flex flex-col items-center gap-1.5 py-3 rounded-xl border text-xs font-600 transition-colors ${copied === 'link' ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted'}`}
                >
                  <Icon name={copied === 'link' ? 'CheckIcon' : 'ClipboardDocumentIcon'} size={18} />
                  {copied === 'link' ? 'Copié !' : 'Copier le lien'}
                </button>
                <button
                  onClick={() => handleWhatsApp(displayLink)}
                  className="flex flex-col items-center gap-1.5 py-3 rounded-xl border border-green-300 text-xs font-600 text-green-700 hover:bg-green-50 transition-colors"
                >
                  <Icon name="ChatBubbleLeftEllipsisIcon" size={18} />
                  📲 WhatsApp
                </button>
              </div>

              <button
                onClick={() => { onSaved(); }}
                className="w-full py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-600 hover:bg-primary/90 transition-colors"
              >
                Fermer
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
