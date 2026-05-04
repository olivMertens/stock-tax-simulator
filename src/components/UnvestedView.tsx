import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Badge } from './ui/badge';
import { CalendarClock, ChevronDown, ChevronRight, TrendingUp } from 'lucide-react';
import type { GrantInfo } from '../lib/types';
import { useMsftPrice } from '../hooks/useMsftPrice';
import { formatEUR, formatUSD, planTypeLabel } from '../lib/utils';
import {
  getUpcomingVests,
  groupUpcomingVestsByYear,
  totalUpcomingShares,
  type UpcomingVest,
} from '../lib/unvested';

interface UnvestedViewProps {
  grants: GrantInfo[];
}

/**
 * Shows upcoming vest events parsed from the Microsoft StockExport.
 * Silent when no grants are imported — StockExport is optional.
 */
export function UnvestedView({ grants }: UnvestedViewProps) {
  const { usdPrice, eurPrice } = useMsftPrice();

  const upcoming = React.useMemo(() => getUpcomingVests(grants), [grants]);
  const groups = React.useMemo(() => groupUpcomingVestsByYear(upcoming), [upcoming]);
  const totalShares = totalUpcomingShares(upcoming);

  // All groups collapsed by default; auto-open the only year if there is just one.
  const [openYears, setOpenYears] = React.useState<Set<number>>(() => {
    return groups.length === 1 ? new Set([groups[0].year]) : new Set();
  });
  const toggleYear = React.useCallback((year: number) => {
    setOpenYears((prev) => {
      const next = new Set(prev);
      if (next.has(year)) next.delete(year);
      else next.add(year);
      return next;
    });
  }, []);
  const allOpen = groups.length > 0 && groups.every((g) => openYears.has(g.year));
  const toggleAll = () => {
    setOpenYears(allOpen ? new Set() : new Set(groups.map((g) => g.year)));
  };

  if (grants.length === 0 || upcoming.length === 0) {
    return null;
  }

  const estimatedEur = eurPrice !== null ? totalShares * eurPrice : null;
  const estimatedUsd = usdPrice !== null ? totalShares * usdPrice : null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <CalendarClock className="h-5 w-5" />
              Vesting à venir
            </CardTitle>
            <CardDescription>
              Actions à acquérir dans le futur, d'après votre StockExport. Non encore imposables tant
              que la date d'acquisition définitive n'est pas atteinte.
            </CardDescription>
          </div>
          <div className="text-right shrink-0">
            <p className="text-xs text-gray-500">Total à acquérir</p>
            <p className="text-2xl font-bold">
              {totalShares.toLocaleString('fr-FR', { maximumFractionDigits: 4 })}
            </p>
            {estimatedEur !== null && estimatedUsd !== null && (
              <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1 justify-end">
                <TrendingUp className="h-3 w-3" />
                ≈ {formatEUR(estimatedEur)}{' '}
                <span className="text-gray-400">({formatUSD(estimatedUsd)})</span>
              </p>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {groups.length > 1 && (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={toggleAll}
              className="text-xs text-gray-600 hover:text-gray-900 underline-offset-2 hover:underline"
            >
              {allOpen ? 'Tout replier' : 'Tout déplier'}
            </button>
          </div>
        )}
        {groups.map((g) => (
          <YearGroup
            key={g.year}
            year={g.year}
            shares={g.shares}
            events={g.events}
            eurPrice={eurPrice}
            open={openYears.has(g.year)}
            onToggle={() => toggleYear(g.year)}
          />
        ))}
        <p className="text-xs text-gray-400 pt-2 border-t border-gray-100">
          La valorisation est indicative, calculée au cours MSFT actuel
          {eurPrice !== null ? '' : ' (indisponible pour le moment)'}. Elle ne tient compte ni de
          l'évolution du cours, ni des impôts futurs, ni d'un éventuel départ anticipé.
        </p>
      </CardContent>
    </Card>
  );
}

function YearGroup({
  year,
  shares,
  events,
  eurPrice,
  open,
  onToggle,
}: {
  year: number;
  shares: number;
  events: UpcomingVest[];
  eurPrice: number | null;
  open: boolean;
  onToggle: () => void;
}) {
  const yearValueEur = eurPrice !== null ? shares * eurPrice : null;

  return (
    <div className="rounded-lg border border-gray-200 overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-3 px-3 py-2 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
        aria-expanded={open}
      >
        <div className="flex items-center gap-2">
          {open ? (
            <ChevronDown className="h-4 w-4 text-gray-500" />
          ) : (
            <ChevronRight className="h-4 w-4 text-gray-500" />
          )}
          <span className="font-semibold text-sm">{year}</span>
          <span className="text-xs text-gray-500">
            · {events.length} événement{events.length > 1 ? 's' : ''}
          </span>
        </div>
        <div className="text-right">
          <span className="text-sm font-medium">
            {shares.toLocaleString('fr-FR', { maximumFractionDigits: 4 })} actions
          </span>
          {yearValueEur !== null && (
            <span className="text-xs text-gray-500 ml-2">≈ {formatEUR(yearValueEur)}</span>
          )}
        </div>
      </button>
      {open && (
        <ul className="divide-y divide-gray-100">
          {events.map((ev, i) => {
            const rowValueEur = eurPrice !== null ? ev.shares * eurPrice : null;
            return (
              <li key={`${ev.grantIdHash}-${i}`} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-medium tabular-nums">
                    {ev.date.toLocaleDateString('fr-FR', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </span>
                  <Badge variant="secondary" className="text-xs">
                    {ev.awardType}
                  </Badge>
                  <span className="text-xs text-gray-500 truncate">
                    {planTypeLabel(ev.planType)}
                  </span>
                </div>
                <div className="text-right shrink-0">
                  <span className="tabular-nums">
                    {ev.shares.toLocaleString('fr-FR', { maximumFractionDigits: 4 })}
                  </span>
                  {rowValueEur !== null && (
                    <span className="text-xs text-gray-400 ml-2">≈ {formatEUR(rowValueEur)}</span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
