import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatEUR(value: number): string {
  return value.toLocaleString('fr-FR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }) + ' €';
}

export function formatPercent(value: number): string {
  return value.toLocaleString('fr-FR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }) + ' %';
}

export function originLabel(origin: string): string {
  const labels: Record<string, string> = {
    SP: 'ESPP',
    DO: 'Stock Award',
    FM: 'AGA Macron',
    FQ: 'AGA pré-Macron',
  };
  return labels[origin] || origin;
}

export function planTypeLabel(planType: string): string {
  const labels: Record<string, string> = {
    qualified_macron: 'Qualifié (Macron)',
    qualified_pre_macron: 'Qualifié (pré-Macron)',
    non_qualified: 'Non qualifié',
  };
  return labels[planType] || planType;
}

export function brokerLabel(broker: string): string {
  const labels: Record<string, string> = {
    fidelity: 'Fidelity',
    morgan_stanley: 'Morgan Stanley',
  };
  return labels[broker] || broker;
}

/**
 * Tailwind class fragment to style a broker badge. Colours are stable per
 * broker so users can quickly distinguish lots/sales coming from each source.
 */
export function brokerBadgeClass(broker: string): string {
  const map: Record<string, string> = {
    fidelity: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    morgan_stanley: 'bg-sky-50 text-sky-700 border-sky-200',
  };
  return map[broker] || 'bg-gray-50 text-gray-700 border-gray-200';
}

/**
 * Replace one broker's slice of a broker-tagged list while preserving the
 * others. Used by import handlers so that re-importing data from one
 * courtier never wipes the data already loaded from another courtier.
 *
 * The broker is inferred from the first incoming item; callers must guard
 * against an empty `incoming` array (typically by skipping the call), since
 * we cannot tell which slice to replace otherwise.
 */
export function mergeByBroker<T extends { broker: string }>(
  prev: T[],
  incoming: T[],
): T[] {
  if (incoming.length === 0) return prev;
  const broker = incoming[0].broker;
  return [...prev.filter((x) => x.broker !== broker), ...incoming];
}

export function formatDate(date: Date | undefined): string {
  if (!date) return '—';
  return date.toLocaleDateString('fr-FR');
}

export function formatUSD(value: number): string {
  return '$' + value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function generateId(): string {
  return Math.random().toString(36).substring(2, 11);
}
