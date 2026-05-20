'use client';

import React, { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import Icon from '@/components/ui/AppIcon';
import Link from 'next/link';
import { supplierOrderService, FoOrder, FoProductCostHistory } from '@/lib/services/supplierOrderService';
import { supplierService, Supplier } from '@/lib/services/supplierService';
import { exportOrdersListPDF, exportPurchaseOrderPDF } from '@/lib/utils/purchaseOrderPDF';

type HistoryTab = 'orders' | 'costs';

const STATUS_LABELS: Record<string, string> = {
  draft: 'Brouillon', sent: 'Envoyée', awaiting_validation: 'Attente validation',
  validated: 'Validée', modification_requested: 'Modif. demandée',
  payment_pending: 'Paiement en attente', payment_in_progress: 'Paiement en cours',
  paid: 'Payée', payment_received_by_supplier: 'Paiement reçu',
  in_preparation: 'En préparation', in_production: 'En production',
  ready_to_ship: 'Prête à expédier', shipped: 'Expédiée',
  partially_received: 'Reçue partiellement', fully_received: 'Reçue totalement',
  costs_recorded: 'Frais enregistrés', stock_integrated: 'Stock intégré',
  closed: 'Clôturée', suspended: 'Suspendue', cancelled: 'Annulée',
};

export default function HistoriquePage() {
  const [orders, setOrders] = useState<FoOrder[]>([]);
  const [costHistory, setCostHistory] = useState<FoProductCostHistory[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<HistoryTab>('orders');
  const [filterSupplier, setFilterSupplier] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [search, setSearch] = useState('');
  const [exportingList, setExportingList] = useState(false);
  const [exportingOrderId, setExportingOrderId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [o, c, s] = await Promise.all([
        supplierOrderService.getAll(),
        supplierOrderService.getCostHistory(),
        supplierService.getAll(),
      ]);
      setOrders(o);
      setCostHistory(c);
      setSuppliers(s);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filteredOrders = orders.filter((o) => {
    const q = search.toLowerCase();
    const matchSearch = !q || o.orderNumber.toLowerCase().includes(q) || (o.supplierName || '').toLowerCase().includes(q);
    const matchSupplier = !filterSupplier || o.supplierId === filterSupplier;
    const matchStatus = !filterStatus || o.orderStatus === filterStatus;
    return matchSearch && matchSupplier && matchStatus;
  });

  const handleExportList = async () => {
    setExportingList(true);
    try {
      await exportOrdersListPDF(filteredOrders);
    } finally {
      setExportingList(false);
    }
  };

  const handleExportSingle = async (order: FoOrder) => {
    setExportingOrderId(order.id);
    try {
      const fullOrder = await supplierOrderService.getById(order.id);
      if (fullOrder) {
        await exportPurchaseOrderPDF(fullOrder, fullOrder.lines || []);
      }
    } finally {
      setExportingOrderId(null);
    }
  };

  const closedOrders = filteredOrders.filter((o) => ['closed', 'cancelled', 'fully_received', 'stock_integrated'].includes(o.orderStatus));

  return (
    <AppLayout>
      <div className="p-6 max-w-screen-xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 mb-6">
          <div className="flex items-center gap-3">
            <Link href="/commandes-fournisseurs" className="p-2 rounded-lg hover:bg-muted text-muted-foreground transition-colors">
              <Icon name="ArrowLeftIcon" size={18} />
            </Link>
            <div>
              <h1 className="text-2xl font-700 text-foreground">Historique des commandes</h1>
              <p className="text-sm text-muted-foreground mt-0.5">{orders.length} commande{orders.length !== 1 ? 's' : ''} au total</p>
            </div>
          </div>
          {tab === 'orders' && (
            <button
              onClick={handleExportList}
              disabled={exportingList || filteredOrders.length === 0}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm font-500 hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {exportingList ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Icon name="ArrowDownTrayIcon" size={16} />
              )}
              Exporter PDF ({filteredOrders.length})
            </button>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-5 border-b border-border">
          {[
            { id: 'orders', label: 'Commandes', icon: 'ShoppingBagIcon' },
            { id: 'costs', label: 'Historique coûts produits', icon: 'ChartBarIcon' },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id as HistoryTab)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-500 border-b-2 transition-colors ${tab === t.id ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
            >
              <Icon name={t.icon as any} size={14} />
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'orders' && (
          <>
            {/* Filters */}
            <div className="flex flex-wrap gap-3 mb-5">
              <div className="relative flex-1 min-w-[200px]">
                <Icon name="MagnifyingGlassIcon" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Rechercher..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 border border-border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <select value={filterSupplier} onChange={(e) => setFilterSupplier(e.target.value)} className="px-3 py-2 border border-border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/20">
                <option value="">Tous les fournisseurs</option>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.companyName}</option>)}
              </select>
              <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="px-3 py-2 border border-border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/20">
                <option value="">Tous les statuts</option>
                {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-20">
                <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : filteredOrders.length === 0 ? (
              <div className="bg-white border border-border rounded-xl p-12 text-center">
                <Icon name="ClockIcon" size={40} className="text-muted-foreground mx-auto mb-3" />
                <p className="font-500 text-foreground">Aucune commande trouvée</p>
              </div>
            ) : (
              <div className="bg-white border border-border rounded-xl shadow-card overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/30">
                        <th className="text-left px-4 py-3 font-600 text-muted-foreground text-xs uppercase">N° Commande</th>
                        <th className="text-left px-4 py-3 font-600 text-muted-foreground text-xs uppercase">Fournisseur</th>
                        <th className="text-left px-4 py-3 font-600 text-muted-foreground text-xs uppercase">Statut</th>
                        <th className="text-right px-4 py-3 font-600 text-muted-foreground text-xs uppercase">Montant</th>
                        <th className="text-right px-4 py-3 font-600 text-muted-foreground text-xs uppercase">Frais</th>
                        <th className="text-right px-4 py-3 font-600 text-muted-foreground text-xs uppercase">Coût réel</th>
                        <th className="text-left px-4 py-3 font-600 text-muted-foreground text-xs uppercase">Date</th>
                        <th className="px-4 py-3" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {filteredOrders.map((o) => {
                        const fees = o.transportCost + o.customsCost + o.vatImport + o.freightForwarderCost + o.bankFees + o.exchangeFees + o.localDelivery + o.otherCosts;
                        const isExporting = exportingOrderId === o.id;
                        return (
                          <tr key={o.id} className="hover:bg-muted/20 transition-colors">
                            <td className="px-4 py-3 font-600 text-foreground">{o.orderNumber}</td>
                            <td className="px-4 py-3 text-muted-foreground">{o.supplierName || '—'}</td>
                            <td className="px-4 py-3">
                              <span className="px-2 py-0.5 rounded-full text-xs font-500 bg-muted text-muted-foreground">
                                {STATUS_LABELS[o.orderStatus] || o.orderStatus}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right">{o.subtotal.toFixed(2)} {o.currency}</td>
                            <td className="px-4 py-3 text-right text-amber-600">{fees > 0 ? `+${fees.toFixed(2)}` : '—'}</td>
                            <td className="px-4 py-3 text-right font-700 text-foreground">{o.totalRealCost.toFixed(2)} {o.currency}</td>
                            <td className="px-4 py-3 text-muted-foreground text-xs">{new Date(o.createdAt).toLocaleDateString('fr-FR')}</td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2 justify-end">
                                <button
                                  onClick={() => handleExportSingle(o)}
                                  disabled={isExporting}
                                  title="Télécharger PDF"
                                  className="p-1.5 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors disabled:opacity-50"
                                >
                                  {isExporting ? (
                                    <div className="w-3.5 h-3.5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                                  ) : (
                                    <Icon name="ArrowDownTrayIcon" size={14} />
                                  )}
                                </button>
                                <Link href={`/commandes-fournisseurs/${o.id}`} className="text-xs text-primary hover:underline font-500">Voir</Link>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}

        {tab === 'costs' && (
          <>
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : costHistory.length === 0 ? (
              <div className="bg-white border border-border rounded-xl p-12 text-center">
                <Icon name="ChartBarIcon" size={40} className="text-muted-foreground mx-auto mb-3" />
                <p className="font-500 text-foreground">Aucun historique de coût</p>
                <p className="text-sm text-muted-foreground mt-1">Les changements de coût de revient apparaîtront ici</p>
              </div>
            ) : (
              <div className="bg-white border border-border rounded-xl shadow-card overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/30">
                        <th className="text-left px-4 py-3 font-600 text-muted-foreground text-xs uppercase">Produit</th>
                        <th className="text-right px-4 py-3 font-600 text-muted-foreground text-xs uppercase">Ancien prix achat</th>
                        <th className="text-right px-4 py-3 font-600 text-muted-foreground text-xs uppercase">Nouveau prix achat</th>
                        <th className="text-right px-4 py-3 font-600 text-muted-foreground text-xs uppercase">Ancien coût réel</th>
                        <th className="text-right px-4 py-3 font-600 text-muted-foreground text-xs uppercase">Nouveau coût réel</th>
                        <th className="text-right px-4 py-3 font-600 text-muted-foreground text-xs uppercase">Frais associés</th>
                        <th className="text-left px-4 py-3 font-600 text-muted-foreground text-xs uppercase">Date</th>
                        <th className="text-left px-4 py-3 font-600 text-muted-foreground text-xs uppercase">Validé par</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {costHistory.map((h) => {
                        const diff = h.newRealCost - h.oldRealCost;
                        return (
                          <tr key={h.id} className="hover:bg-muted/20 transition-colors">
                            <td className="px-4 py-3">
                              <p className="font-500 text-foreground">{h.productName}</p>
                              {h.productRef && <p className="text-xs text-muted-foreground">{h.productRef}</p>}
                            </td>
                            <td className="px-4 py-3 text-right text-muted-foreground">{h.oldPurchasePrice.toFixed(2)} €</td>
                            <td className="px-4 py-3 text-right font-500">{h.newPurchasePrice.toFixed(2)} €</td>
                            <td className="px-4 py-3 text-right text-muted-foreground">{h.oldRealCost.toFixed(2)} €</td>
                            <td className="px-4 py-3 text-right font-600">
                              <span className={diff > 0 ? 'text-red-600' : diff < 0 ? 'text-emerald-600' : 'text-foreground'}>
                                {h.newRealCost.toFixed(2)} €
                                {diff !== 0 && <span className="text-xs ml-1">({diff > 0 ? '+' : ''}{diff.toFixed(2)})</span>}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right text-amber-600">{h.associatedFees > 0 ? `${h.associatedFees.toFixed(2)} €` : '—'}</td>
                            <td className="px-4 py-3 text-muted-foreground text-xs">{new Date(h.changedAt).toLocaleDateString('fr-FR')}</td>
                            <td className="px-4 py-3 text-muted-foreground text-xs">{h.validatedBy}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </AppLayout>
  );
}
