'use client';

import React from 'react';
import Icon from '@/components/ui/AppIcon';

export interface Location {
  id: string;
  name: string;
  isMain: boolean;
  totalProducts: number;
  totalValue: number;
  alertCount: number;
}

interface LocationSelectorProps {
  locations: Location[];
  selectedId: string;
  onSelect: (id: string) => void;
  loading: boolean;
}

export default function LocationSelector({ locations, selectedId, onSelect, loading }: LocationSelectorProps) {
  if (loading) {
    return (
      <div className="flex gap-3 overflow-x-auto pb-1">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-20 w-44 rounded-xl bg-muted animate-pulse shrink-0" />
        ))}
      </div>
    );
  }

  const allOption: Location = {
    id: 'all',
    name: 'Tous les emplacements',
    isMain: false,
    totalProducts: locations.reduce((s, l) => s + l.totalProducts, 0),
    totalValue: locations.reduce((s, l) => s + l.totalValue, 0),
    alertCount: locations.reduce((s, l) => s + l.alertCount, 0),
  };

  const options = [allOption, ...locations];

  return (
    <div className="flex gap-3 overflow-x-auto pb-1">
      {options.map((loc) => {
        const isSelected = selectedId === loc.id;
        return (
          <button
            key={loc.id}
            onClick={() => onSelect(loc.id)}
            className={`shrink-0 flex flex-col gap-1.5 px-4 py-3 rounded-xl border text-left transition-all duration-150 min-w-[160px] ${
              isSelected
                ? 'bg-primary/10 border-primary/40 shadow-sm'
                : 'bg-white border-border hover:bg-muted/40'
            }`}
          >
            <div className="flex items-center gap-2">
              <Icon
                name={loc.id === 'all' ? 'Squares2X2Icon' : loc.isMain ? 'BuildingStorefrontIcon' : 'ArchiveBoxIcon'}
                size={14}
                className={isSelected ? 'text-primary' : 'text-muted-foreground'}
              />
              <span className={`text-xs font-600 truncate ${isSelected ? 'text-primary' : 'text-foreground'}`}>
                {loc.name}
              </span>
              {loc.isMain && (
                <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded font-500">Principal</span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[11px] text-muted-foreground tabular-nums">
                {loc.totalProducts} réf.
              </span>
              <span className="text-[11px] text-muted-foreground tabular-nums">
                {loc.totalValue.toLocaleString('fr-FR')} €
              </span>
              {loc.alertCount > 0 && (
                <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full font-600">
                  {loc.alertCount} ⚠
                </span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
