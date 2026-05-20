'use client';

import React, { useState } from 'react';
import AppLayout from '@/components/AppLayout';
import Icon from '@/components/ui/AppIcon';
import SalesReport from './components/SalesReport';
import StockReport from './components/StockReport';
import MarginsReport from './components/MarginsReport';
import TaxesReport from './components/TaxesReport';
import PaymentsReport from './components/PaymentsReport';
import EmployeesReport from './components/EmployeesReport';

export type DateRange = { from: string; to: string };

export type ReportTab = 'sales' | 'stock' | 'margins' | 'taxes' | 'payments' | 'employees';

const TABS: { id: ReportTab; label: string; icon: string; color: string }[] = [
  { id: 'sales', label: 'Ventes', icon: 'ShoppingCartIcon', color: 'text-blue-600' },
  { id: 'stock', label: 'Stock', icon: 'ArchiveBoxIcon', color: 'text-amber-600' },
  { id: 'margins', label: 'Marges', icon: 'ChartBarIcon', color: 'text-emerald-600' },
  { id: 'taxes', label: 'TVA', icon: 'ReceiptPercentIcon', color: 'text-purple-600' },
  { id: 'payments', label: 'Paiements', icon: 'CreditCardIcon', color: 'text-rose-600' },
  { id: 'employees', label: 'Employés', icon: 'UserGroupIcon', color: 'text-indigo-600' },
];

function getDefaultRange(): DateRange {
  const now = new Date();
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
  const pad = (n: number) => String(n).padStart(2, '0');
  const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return { from: fmt(firstDay), to: fmt(now) };
}

export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState<ReportTab>('sales');
  const [dateRange, setDateRange] = useState<DateRange>(getDefaultRange);

  const handleDateChange = (field: 'from' | 'to', value: string) => {
    setDateRange((prev) => ({ ...prev, [field]: value }));
  };

  const presets = [
    {
      label: "Aujourd\'hui",
      action: () => {
        const now = new Date();
        const pad = (n: number) => String(n).padStart(2, '0');
        const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
        setDateRange({ from: fmt(now), to: fmt(now) });
      },
    },
    {
      label: '7 derniers jours',
      action: () => {
        const now = new Date();
        const from = new Date(now);
        from.setDate(from.getDate() - 6);
        const pad = (n: number) => String(n).padStart(2, '0');
        const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
        setDateRange({ from: fmt(from), to: fmt(now) });
      },
    },
    {
      label: 'Ce mois',
      action: () => {
        const now = new Date();
        const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
        const pad = (n: number) => String(n).padStart(2, '0');
        const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
        setDateRange({ from: fmt(firstDay), to: fmt(now) });
      },
    },
    {
      label: 'Mois dernier',
      action: () => {
        const now = new Date();
        const firstDay = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const lastDay = new Date(now.getFullYear(), now.getMonth(), 0);
        const pad = (n: number) => String(n).padStart(2, '0');
        const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
        setDateRange({ from: fmt(firstDay), to: fmt(lastDay) });
      },
    },
    {
      label: 'Cette année',
      action: () => {
        const now = new Date();
        const firstDay = new Date(now.getFullYear(), 0, 1);
        const pad = (n: number) => String(n).padStart(2, '0');
        const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
        setDateRange({ from: fmt(firstDay), to: fmt(now) });
      },
    },
  ];

  return (
    <AppLayout>
      <div className="min-h-screen bg-background">
        {/* Header */}
        <div className="bg-white border-b border-border px-6 py-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
                <Icon name="DocumentChartBarIcon" size={22} className="text-primary" />
                Rapports &amp; Statistiques
              </h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                Analysez vos performances par période et catégorie
              </p>
            </div>

            {/* Date range controls */}
            <div className="flex flex-wrap items-center gap-2">
              {presets.map((p) => (
                <button
                  key={p.label}
                  onClick={p.action}
                  className="text-xs px-2.5 py-1.5 rounded-md border border-border bg-white hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                >
                  {p.label}
                </button>
              ))}
              <div className="flex items-center gap-1.5 bg-muted/50 rounded-lg px-3 py-1.5 border border-border">
                <Icon name="CalendarDaysIcon" size={14} className="text-muted-foreground" />
                <input
                  type="date"
                  value={dateRange.from}
                  onChange={(e) => handleDateChange('from', e.target.value)}
                  className="text-xs bg-transparent border-none outline-none text-foreground"
                />
                <span className="text-muted-foreground text-xs">→</span>
                <input
                  type="date"
                  value={dateRange.to}
                  onChange={(e) => handleDateChange('to', e.target.value)}
                  className="text-xs bg-transparent border-none outline-none text-foreground"
                />
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mt-4 overflow-x-auto scrollbar-thin">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
                  activeTab === tab.id
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                <Icon name={tab.icon as Parameters<typeof Icon>[0]['name']} size={15} />
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Report content */}
        <div className="p-6">
          {activeTab === 'sales' && <SalesReport dateRange={dateRange} />}
          {activeTab === 'stock' && <StockReport dateRange={dateRange} />}
          {activeTab === 'margins' && <MarginsReport dateRange={dateRange} />}
          {activeTab === 'taxes' && <TaxesReport dateRange={dateRange} />}
          {activeTab === 'payments' && <PaymentsReport dateRange={dateRange} />}
          {activeTab === 'employees' && <EmployeesReport dateRange={dateRange} />}
        </div>
      </div>
    </AppLayout>
  );
}
