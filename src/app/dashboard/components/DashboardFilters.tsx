'use client';

import React, { useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import { type DashboardFiltersState, type DashboardPeriod } from '@/lib/services/dashboardService';

const periods: { id: DashboardPeriod; label: string }[] = [
  { id: 'today', label: "Aujourd'hui" },
  { id: 'week', label: 'Semaine' },
  { id: 'month', label: 'Mois' },
  { id: 'year', label: 'Année' },
];

interface DashboardFiltersProps {
  filters: DashboardFiltersState;
  onChange: (filters: DashboardFiltersState) => void;
}

export default function DashboardFilters({ filters, onChange }: DashboardFiltersProps) {
  const setPeriod = (period: DashboardPeriod) => {
    onChange({ ...filters, period });
  };

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center bg-muted rounded-lg p-0.5 gap-0.5">
        {periods.map((p) => (
          <button
            key={p.id}
            onClick={() => setPeriod(p.id)}
            className={`
              px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-150
              ${filters.period === p.id
                ? 'bg-white text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
              }
            `}
          >
            {p.label}
          </button>
        ))}
      </div>
      <button className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
        <Icon name="AdjustmentsHorizontalIcon" size={15} />
        Filtres
      </button>
      <button className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 transition-opacity active:scale-95">
        <Icon name="ArrowDownTrayIcon" size={15} />
        Exporter
      </button>
    </div>
  );
}