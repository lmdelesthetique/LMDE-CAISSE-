import React from 'react';

type BadgeVariant =
  | 'active' |'inactive' |'rupture' |'coming_soon' |'pending' |'deposit_paid' |'ready' |'settled' |'cancelled' |'warning' |'info' |'success' |'draft' |'shipped' |'received';

const variantMap: Record<BadgeVariant, { bg: string; text: string; dot: string; label: string }> = {
  active:       { bg: 'bg-emerald-50',  text: 'text-emerald-700',  dot: 'bg-emerald-500',  label: 'Actif' },
  inactive:     { bg: 'bg-gray-100',    text: 'text-gray-500',     dot: 'bg-gray-400',     label: 'Inactif' },
  rupture:      { bg: 'bg-red-50',      text: 'text-red-700',      dot: 'bg-red-500',      label: 'Rupture' },
  coming_soon:  { bg: 'bg-violet-50',   text: 'text-violet-700',   dot: 'bg-violet-500',   label: 'Bientôt dispo' },
  pending:      { bg: 'bg-amber-50',    text: 'text-amber-700',    dot: 'bg-amber-500',    label: 'En attente' },
  deposit_paid: { bg: 'bg-blue-50',     text: 'text-blue-700',     dot: 'bg-blue-500',     label: 'Acompte payé' },
  ready:        { bg: 'bg-teal-50',     text: 'text-teal-700',     dot: 'bg-teal-500',     label: 'Prête' },
  settled:      { bg: 'bg-emerald-50',  text: 'text-emerald-700',  dot: 'bg-emerald-500',  label: 'Soldée' },
  cancelled:    { bg: 'bg-red-50',      text: 'text-red-600',      dot: 'bg-red-400',      label: 'Annulée' },
  warning:      { bg: 'bg-amber-50',    text: 'text-amber-700',    dot: 'bg-amber-500',    label: 'Alerte' },
  info:         { bg: 'bg-blue-50',     text: 'text-blue-700',     dot: 'bg-blue-500',     label: 'Info' },
  success:      { bg: 'bg-emerald-50',  text: 'text-emerald-700',  dot: 'bg-emerald-500',  label: 'Succès' },
  draft:        { bg: 'bg-gray-100',    text: 'text-gray-600',     dot: 'bg-gray-400',     label: 'Brouillon' },
  shipped:      { bg: 'bg-indigo-50',   text: 'text-indigo-700',   dot: 'bg-indigo-500',   label: 'Expédiée' },
  received:     { bg: 'bg-emerald-50',  text: 'text-emerald-700',  dot: 'bg-emerald-500',  label: 'Reçue' },
};

interface StatusBadgeProps {
  variant: BadgeVariant;
  label?: string;
  size?: 'sm' | 'md';
}

export default function StatusBadge({ variant, label, size = 'md' }: StatusBadgeProps) {
  const styles = variantMap[variant];
  const displayLabel = label ?? styles.label;

  return (
    <span
      className={`
        inline-flex items-center gap-1.5 rounded-full font-medium
        ${styles.bg} ${styles.text}
        ${size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs'}
      `}
    >
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${styles.dot}`} />
      {displayLabel}
    </span>
  );
}