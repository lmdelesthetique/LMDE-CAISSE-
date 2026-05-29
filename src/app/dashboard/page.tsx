'use client';

import React, { useState } from 'react';
import AppLayout from '@/components/AppLayout';
import DashboardFilters from './components/DashboardFilters';
import KPIBentoGrid from './components/KPIBentoGrid';
import RevenueChart from './components/RevenueChart';
import PaymentMethodChart from './components/PaymentMethodChart';
import TopProductsTable from './components/TopProductsTable';
import StockAlerts from './components/StockAlerts';
import RecentSalesFeed from './components/RecentSalesFeed';
import RealMarginDashboard from './components/RealMarginDashboard';
import AdminAlerts from '../backup-compliance/components/AdminAlerts';
import ShopifyStatusCard from './components/ShopifyStatusCard';
import { type DashboardFiltersState } from '@/lib/services/dashboardService';

const DAYS_FR = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

function getDynamicDate(): string {
  const now = new Date();
  const dayName = DAYS_FR[now.getDay()];
  const dateStr = now.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  return `Boutique Beauté Lumière — ${dayName} ${dateStr}`;
}

export default function DashboardPage() {
  const [filters, setFilters] = useState<DashboardFiltersState>({ period: 'month' });

  return (
    <AppLayout>
      <div className="min-h-screen bg-background">
        {/* Page header */}
        <div className="border-b border-border bg-white px-6 lg:px-8 xl:px-10 py-4 sticky top-0 z-20">
          <div className="max-w-screen-2xl mx-auto flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-foreground">Dashboard</h1>
              <p className="text-sm text-muted-foreground mt-0.5">{getDynamicDate()}</p>
            </div>
            <div className="flex items-center gap-3">
              <AdminAlerts compact />
              <DashboardFilters filters={filters} onChange={setFilters} />
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="max-w-screen-2xl mx-auto px-6 lg:px-8 xl:px-10 2xl:px-16 py-6 space-y-6">
          {/* KPI Bento Grid */}
          <KPIBentoGrid filters={filters} />

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 xl:grid-cols-3 2xl:grid-cols-3 gap-5">
            <div className="lg:col-span-2">
              <RevenueChart filters={filters} />
            </div>
            <div className="lg:col-span-1">
              <PaymentMethodChart filters={filters} />
            </div>
          </div>

          {/* Real Margin + Products Row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <div className="lg:col-span-2">
              <RealMarginDashboard />
            </div>
            <div className="lg:col-span-1">
              <TopProductsTable filters={filters} />
            </div>
          </div>

          {/* Bottom Row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 xl:grid-cols-3 2xl:grid-cols-3 gap-5">
            <div className="lg:col-span-2">
              <StockAlerts />
            </div>
            <div className="lg:col-span-1">
              <RecentSalesFeed />
            </div>
          </div>

          {/* Shopify Status Row */}
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
            <div className="lg:col-span-1">
              <ShopifyStatusCard />
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}