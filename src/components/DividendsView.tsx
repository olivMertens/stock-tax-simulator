import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Badge } from './ui/badge';
import { Coins, ChevronDown, ChevronRight } from 'lucide-react';
import type { DividendEvent, CashInterestEvent } from '../lib/transaction-parser';
import {
  enrichDividendsWithEur,
  groupDividendsByYear,
  type DividendYearSummary,
} from '../lib/dividends';
import { fetchECBRates } from '../lib/ecb-rates';
import { formatEUR, formatUSD } from '../lib/utils';

interface DividendsViewProps {
  dividends: DividendEvent[];
  cashInterest: CashInterestEvent[];
}

export function DividendsView({ dividends, cashInterest }: DividendsViewProps) {
  const [rates, setRates] = React.useState<Record<string, number>>({});
  const [ratesLoading, setRatesLoading] = React.useState(false);
  const [ratesError, setRatesError] = React.useState<string | null>(null);

  // Fetching ECB rates is a network side effect; the synchronous setState
  // calls before the await (loading + error reset) are intentional UX wiring,
  // not a state derivation — disable the rule locally.
  React.useEffect(() => {
    if (dividends.length === 0) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRatesLoading(true);
    setRatesError(null);
    fetchECBRates(dividends.map((d) => d.date))
      .then((r) => {
        if (!cancelled) setRates(r);
      })
      .catch((err: unknown) => {
        if (!cancelled) setRatesError((err as Error).message ?? 'Erreur de conversion EUR');
      })
      .finally(() => {
        if (!cancelled) setRatesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [dividends]);

  const { enriched, missingDates } = React.useMemo(
    () => enrichDividendsWithEur(dividends, rates),
    [dividends, rates],
  );

  const groups = React.useMemo(() => groupDividendsByYear(enriched), [enriched]);

  // All groups collapsed by default; auto-open the only year if there is just one.
  const [openYears, setOpenYears] = React.useState<Set<number>>(() => new Set());
  // Track whether the auto-open logic has run; we want it to fire once, the
  // first time `groups` becomes non-empty (which happens after the rates have
  // resolved). Doing it at render time avoids a synchronous setState in an
  // effect.
  const [autoOpened, setAutoOpened] = React.useState(false);
  if (!autoOpened && groups.length > 0) {
    setAutoOpened(true);
    if (groups.length === 1) setOpenYears(new Set([groups[0].year]));
  }
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

  if (dividends.length === 0) return null;

  const cashTotalUsd = cashInterest.reduce((s, c) => s + c.amountUsd, 0);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Coins className="h-5 w-5" />
              Dividendes perçus
            </CardTitle>
            <CardDescription>
              Dividendes Microsoft reçus sur votre compte Fidelity, convertis en euros au taux BCE
              du jour du versement.
            </CardDescription>
          </div>
          <div className="text-right shrink-0">
            <p className="text-xs text-gray-500">{dividends.length} versement{dividends.length > 1 ? 's' : ''}</p>
            <p className="text-2xl font-bold">
              {formatUSD(dividends.reduce((s, d) => s + d.grossUsd, 0))}
              <span className="text-sm font-normal text-gray-500"> brut</span>
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {ratesLoading && <p className="text-xs text-gray-500">Chargement des taux de change BCE…</p>}
        {ratesError && (
          <p className="text-xs text-red-600">
            Conversion EUR indisponible : {ratesError}. Les montants USD restent affichés.
          </p>
        )}
        {missingDates.length > 0 && !ratesLoading && (
          <p className="text-xs text-amber-600">
            {missingDates.length} versement{missingDates.length > 1 ? 's' : ''} sans taux BCE disponible
            (week-end / jour férié).
          </p>
        )}

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
            summary={g}
            open={openYears.has(g.year)}
            onToggle={() => toggleYear(g.year)}
          />
        ))}

        {cashTotalUsd > 0 && (
          <p className="text-xs text-gray-500 pt-2 border-t border-gray-100">
            Par ailleurs, {formatUSD(cashTotalUsd)} d'intérêts sur le cash Fidelity (fonds monétaire).
            Non inclus ici — à déclarer séparément en case 2TR.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function YearGroup({ summary, open, onToggle }: { summary: DividendYearSummary; open: boolean; onToggle: () => void }) {
  return (
    <div className="rounded-lg border border-gray-200 overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-3 px-3 py-2 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
        aria-expanded={open}
      >
        <div className="flex items-center gap-2">
          {open ? <ChevronDown className="h-4 w-4 text-gray-500" /> : <ChevronRight className="h-4 w-4 text-gray-500" />}
          <span className="font-semibold text-sm">{summary.year}</span>
          <span className="text-xs text-gray-500">
            · {summary.count} versement{summary.count > 1 ? 's' : ''}
          </span>
        </div>
        <div className="text-right">
          <span className="text-sm font-medium">{formatEUR(summary.grossEur)}</span>
          <span className="text-xs text-gray-500 ml-2">brut</span>
        </div>
      </button>
      {open && (
        <div>
          <div className="grid grid-cols-3 gap-px bg-gray-100 border-t border-gray-200">
            <Cell label="Brut" usd={summary.grossUsd} eur={summary.grossEur} />
            <Cell label="Retenue US" usd={summary.taxWithheldUsd} eur={summary.taxWithheldEur} />
            <Cell label="Net perçu" usd={summary.netUsd} eur={summary.netEur} highlight />
          </div>
          <ul className="divide-y divide-gray-100 text-sm">
            {summary.events.map((ev, i) => (
              <li key={i} className="flex items-center justify-between gap-3 px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className="font-medium tabular-nums">
                    {ev.date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </span>
                  <Badge variant="secondary" className="text-xs">MSFT</Badge>
                </div>
                <div className="text-right">
                  <span className="tabular-nums">{formatEUR(ev.grossEur)}</span>
                  <span className="text-xs text-gray-400 ml-2">({formatUSD(ev.grossUsd)})</span>
                  {ev.taxWithheldUsd > 0 && (
                    <span className="text-xs text-red-600 ml-2">−{formatEUR(ev.taxWithheldEur)} US</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Cell({ label, usd, eur, highlight }: { label: string; usd: number; eur: number; highlight?: boolean }) {
  return (
    <div className={`bg-white p-2 text-center ${highlight ? 'bg-amber-50' : ''}`}>
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-base font-semibold">{formatEUR(eur)}</div>
      <div className="text-xs text-gray-400">{formatUSD(usd)}</div>
    </div>
  );
}
