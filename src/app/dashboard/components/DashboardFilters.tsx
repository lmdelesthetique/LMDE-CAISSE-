'use client';

import React, { useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import { type DashboardFiltersState, type DashboardPeriod, exportAccountingCSV } from '@/lib/services/dashboardService';

const periods: { id: DashboardPeriod; label: string }[] = [
  { id: 'today', label: "Auj." },
  { id: 'week', label: 'Semaine' },
  { id: 'month', label: 'Mois' },
  { id: 'year', label: 'Année' },
  { id: 'custom', label: 'Perso.' },
];

interface DashboardFiltersProps {
  filters: DashboardFiltersState;
  onChange: (filters: DashboardFiltersState) => void;
}

export default function DashboardFilters({ filters, onChange }: DashboardFiltersProps) {
  const [exporting, setExporting] = useState(false);

  const today = new Date().toISOString().split('T')[0];
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];

  const setPeriod = (period: DashboardPeriod) => {
    if (period === 'custom') {
      onChange({ ...filters, period, customStart: filters.customStart ?? monthStart, customEnd: filters.customEnd ?? today });
    } else {
      onChange({ ...filters, period });
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      await exportAccountingCSV(filters);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Period selector */}
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

      {/* Custom date range pickers */}
      {filters.period === 'custom' && (
        <div className="flex items-center gap-1.5 bg-white border border-border rounded-lg px-2 py-1">
          <input
            type="date"
            value={filters.customStart ?? monthStart}
            max={filters.customEnd ?? today}
            onChange={(e) => onChange({ ...filters, customStart: e.target.value })}
            className="text-xs text-foreground bg-transparent border-none outline-none w-[110px]"
          />
          <span className="text-xs text-muted-foreground">→</span>
          <input
            type="date"
            value={filters.customEnd ?? today}
            min={filters.customStart ?? monthStart}
            max={today}
            onChange={(e) => onChange({ ...filters, customEnd: e.target.value })}
            className="text-xs text-foreground bg-transparent border-none outline-none w-[110px]"
          />
        </div>
      )}

      {/* Export CSV for accounting */}
      <button
        onClick={handleExport}
        disabled={exporting}
        className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium border border-border rounded-lg bg-white hover:bg-muted transition-colors disabled:opacity-50"
        title="Exporter pour la comptabilité"
      >
        <Icon name="ArrowDownTrayIcon" size={14} />
        {exporting ? 'Export…' : 'CSV Compta'}
      </button>
    </div>
  );
}
