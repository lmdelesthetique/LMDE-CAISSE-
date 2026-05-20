'use client';

import React, { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import Icon from '@/components/ui/AppIcon';
import InventoryKPIs from './components/InventoryKPIs';
import MovementsTable, { Movement } from './components/MovementsTable';
import StockAlertsTable, { StockItem } from './components/StockAlertsTable';
import SupplierCostChart from './components/SupplierCostChart';
import LocationSelector, { Location } from './components/LocationSelector';
import {
  fetchLocations,
  fetchStockLevels,
  fetchMovements,
  fetchInventoryStats,
  fetchSupplierCosts,
  fetchLocationStats,
  InventoryStats,
  SupplierCostData,
} from '@/lib/services/inventoryService';
import { useRealtimeSync } from '@/hooks/useRealtimeSync';

type TabId = 'overview' | 'movements' | 'alerts' | 'suppliers';

const tabs: { id: TabId; label: string; icon: string }[] = [
  { id: 'overview',   label: 'Vue d\'ensemble', icon: 'ChartBarIcon' },
  { id: 'movements',  label: 'Mouvements',       icon: 'ArrowsRightLeftIcon' },
  { id: 'alerts',     label: 'Alertes stock',    icon: 'ExclamationTriangleIcon' },
  { id: 'suppliers',  label: 'Coûts fournisseurs', icon: 'TruckIcon' },
];

export default function InventoryPage() {
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [selectedLocationId, setSelectedLocationId] = useState<string>('all');
  const [movementTypeFilter, setMovementTypeFilter] = useState<string>('');
  const [showOnlyAlerts, setShowOnlyAlerts] = useState<boolean>(true);

  const [locations, setLocations] = useState<Location[]>([]);
  const [locationsLoading, setLocationsLoading] = useState(true);

  const [stats, setStats] = useState<InventoryStats>({
    totalProducts: 0, totalValue: 0, alertCount: 0,
    outOfStockCount: 0, entriesThisMonth: 0, exitsThisMonth: 0,
  });
  const [statsLoading, setStatsLoading] = useState(true);

  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [stockLoading, setStockLoading] = useState(true);

  const [movements, setMovements] = useState<Movement[]>([]);
  const [movementsLoading, setMovementsLoading] = useState(true);

  const [supplierCosts, setSupplierCosts] = useState<SupplierCostData[]>([]);
  const [supplierLoading, setSupplierLoading] = useState(true);

  // Load locations once
  useEffect(() => {
    (async () => {
      setLocationsLoading(true);
      const locs = await fetchLocations();
      const locStats = await fetchLocationStats(locs);
      setLocations(locStats);
      setLocationsLoading(false);
    })();
  }, []);

  // Reload stats & stock when location changes
  const loadData = useCallback(async () => {
    setStatsLoading(true);
    setStockLoading(true);
    const [s, sl] = await Promise.all([
      fetchInventoryStats(selectedLocationId),
      fetchStockLevels(selectedLocationId),
    ]);
    setStats(s);
    setStockItems(sl.map((item) => ({
      id: item.id,
      productName: item.productName,
      sku: item.sku,
      category: item.category,
      supplierName: item.supplierName,
      quantity: item.quantity,
      minStockLevel: item.minStockLevel,
      reorderPoint: item.reorderPoint,
      alertLevel: item.alertLevel,
      locationName: item.locationName,
      unitCost: item.unitCost,
    })));
    setStatsLoading(false);
    setStockLoading(false);
  }, [selectedLocationId]);

  useEffect(() => { loadData(); }, [loadData]);

  // Real-time sync: refresh inventory when products or stock_movements change
  useRealtimeSync({ tables: ['products', 'stock_movements'], onRefresh: loadData });

  // Load movements when tab or filters change
  useEffect(() => {
    if (activeTab !== 'movements') return;
    (async () => {
      setMovementsLoading(true);
      const data = await fetchMovements(selectedLocationId, movementTypeFilter);
      setMovements(data.map((m) => ({
        id: m.id,
        productName: m.productName,
        locationName: m.locationName,
        movementType: m.movementType,
        quantity: m.quantity,
        unitCost: m.unitCost,
        totalCost: m.totalCost,
        reference: m.reference,
        notes: m.notes,
        performedBy: m.performedBy,
        createdAt: m.createdAt,
      })));
      setMovementsLoading(false);
    })();
  }, [activeTab, selectedLocationId, movementTypeFilter]);

  // Load supplier costs when tab changes
  useEffect(() => {
    if (activeTab !== 'suppliers') return;
    (async () => {
      setSupplierLoading(true);
      const data = await fetchSupplierCosts();
      setSupplierCosts(data);
      setSupplierLoading(false);
    })();
  }, [activeTab]);

  const alertCount = stockItems.filter((i) => i.alertLevel !== 'ok').length;

  return (
    <AppLayout>
      <div className="min-h-screen bg-background">
        {/* Page Header */}
        <div className="border-b border-border bg-white px-6 lg:px-8 xl:px-10 py-4 sticky top-0 z-20">
          <div className="max-w-screen-2xl mx-auto flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-foreground">Inventaire</h1>
              <p className="text-sm text-muted-foreground mt-0.5">Suivi des stocks, mouvements et coûts fournisseurs</p>
            </div>
            <button
              onClick={loadData}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border bg-white text-sm font-500 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <Icon name="ArrowPathIcon" size={15} />
              Actualiser
            </button>
          </div>
        </div>

        <div className="max-w-screen-2xl mx-auto px-6 lg:px-8 xl:px-10 2xl:px-16 py-6 space-y-5">
          {/* Location Selector */}
          <LocationSelector
            locations={locations}
            selectedId={selectedLocationId}
            onSelect={setSelectedLocationId}
            loading={locationsLoading}
          />

          {/* KPIs */}
          <InventoryKPIs
            totalProducts={stats.totalProducts}
            totalValue={stats.totalValue}
            alertCount={stats.alertCount}
            outOfStockCount={stats.outOfStockCount}
            entriesThisMonth={stats.entriesThisMonth}
            exitsThisMonth={stats.exitsThisMonth}
          />

          {/* Tabs */}
          <div className="flex items-center gap-1 border-b border-border">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-500 border-b-2 transition-colors -mb-px ${
                  activeTab === tab.id
                    ? 'border-primary text-primary' :'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                <Icon name={tab.icon as Parameters<typeof Icon>[0]['name']} size={15} />
                {tab.label}
                {tab.id === 'alerts' && alertCount > 0 && (
                  <span className="bg-red-100 text-red-700 text-[10px] font-600 px-1.5 py-0.5 rounded-full">
                    {alertCount}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          {activeTab === 'overview' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              <div className="lg:col-span-2">
                <StockAlertsTable
                  items={stockItems}
                  loading={stockLoading}
                  showOnlyAlerts={false}
                  onToggleAlerts={() => {}}
                />
              </div>
              <div className="lg:col-span-1">
                <div className="bg-white border border-border rounded-xl shadow-card p-5">
                  <h3 className="text-[14px] font-600 text-foreground mb-4">Répartition par catégorie</h3>
                  {stockLoading ? (
                    <div className="flex items-center justify-center h-40">
                      <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {Object.entries(
                        stockItems.reduce((acc: Record<string, { count: number; value: number }>, item) => {
                          const cat = item.category || 'Autre';
                          if (!acc[cat]) acc[cat] = { count: 0, value: 0 };
                          acc[cat].count += item.quantity;
                          acc[cat].value += item.quantity * item.unitCost;
                          return acc;
                        }, {})
                      )
                        .sort((a, b) => b[1].value - a[1].value)
                        .map(([cat, data]) => {
                          const maxVal = Math.max(...Object.values(
                            stockItems.reduce((acc: Record<string, number>, item) => {
                              const c = item.category || 'Autre';
                              acc[c] = (acc[c] || 0) + item.quantity * item.unitCost;
                              return acc;
                            }, {})
                          ));
                          const pct = maxVal > 0 ? Math.round((data.value / maxVal) * 100) : 0;
                          return (
                            <div key={cat}>
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-xs font-500 text-foreground">{cat}</span>
                                <span className="text-xs text-muted-foreground tabular-nums">
                                  {data.value.toLocaleString('fr-FR')} €
                                </span>
                              </div>
                              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                                <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'movements' && (
            <MovementsTable
              movements={movements}
              loading={movementsLoading}
              filterType={movementTypeFilter}
              onFilterChange={setMovementTypeFilter}
            />
          )}

          {activeTab === 'alerts' && (
            <StockAlertsTable
              items={stockItems}
              loading={stockLoading}
              showOnlyAlerts={showOnlyAlerts}
              onToggleAlerts={() => setShowOnlyAlerts((p) => !p)}
            />
          )}

          {activeTab === 'suppliers' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <SupplierCostChart data={supplierCosts} loading={supplierLoading} />
              <div className="bg-white border border-border rounded-xl shadow-card overflow-hidden">
                <div className="px-5 py-4 border-b border-border">
                  <h3 className="text-[14px] font-600 text-foreground">Détail des coûts</h3>
                </div>
                {supplierLoading ? (
                  <div className="flex items-center justify-center py-16">
                    <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : supplierCosts.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                    <Icon name="TruckIcon" size={32} className="mb-2 opacity-30" />
                    <p className="text-sm">Aucune entrée ce mois</p>
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {supplierCosts.map((s, i) => (
                      <div key={`sup-cost-${i}`} className="flex items-center justify-between px-5 py-3.5 hover:bg-muted/20 transition-colors">
                        <div>
                          <p className="text-sm font-500 text-foreground">{s.supplierName}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{s.orderCount} entrée{s.orderCount > 1 ? 's' : ''} ce mois</p>
                        </div>
                        <span className="text-sm font-700 tabular-nums text-foreground">
                          {s.totalCost.toLocaleString('fr-FR')} €
                        </span>
                      </div>
                    ))}
                    <div className="flex items-center justify-between px-5 py-3.5 bg-muted/30">
                      <span className="text-sm font-600 text-foreground">Total</span>
                      <span className="text-sm font-700 tabular-nums text-primary">
                        {supplierCosts.reduce((s, c) => s + c.totalCost, 0).toLocaleString('fr-FR')} €
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
