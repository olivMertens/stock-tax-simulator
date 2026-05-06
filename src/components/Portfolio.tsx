import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Alert } from './ui/alert';
import { Tooltip } from './ui/tooltip';
import { Select } from './ui/select';
import { Briefcase, ArrowUpRight, ArrowDownRight, ChevronDown, ChevronRight, ArrowUp, ArrowDown, Info, X } from 'lucide-react';
import { Treemap, ResponsiveContainer } from 'recharts';
import type { Broker, StockLot, StockOrigin, GrantInfo } from '../lib/types';
import type { DividendEvent, CashInterestEvent } from '../lib/transaction-parser';
import { brokerLabel, formatEUR, formatUSD, formatDate, originLabel, planTypeLabel } from '../lib/utils';
import { safeSetItem } from '../lib/storage';
import { UnvestedView } from './UnvestedView';
import { DividendsView } from './DividendsView';
import { BrokerLogo } from './BrokerLogo';
import { Dialog, DialogFooter } from './ui/dialog';
import { Button } from './ui/button';
import { BulkQualifyPanel } from './BulkQualifyPanel';
import { countEligible, type BulkQualifyChoice } from '../lib/bulk-qualify';

interface PortfolioProps {
  lots: StockLot[];
  onLotsChange: (lots: StockLot[]) => void;
  grants?: GrantInfo[];
  dividends?: DividendEvent[];
  cashInterest?: CashInterestEvent[];
  /** Optional: opens a bulk-qualify panel when there are non-reconciled lots. */
  onBulkQualify?: (choice: BulkQualifyChoice) => void;
  /** Whether the user has imported a StockExport file — drives the wording of the banner. */
  hasGrants?: boolean;
}

// Threshold under which the lot table auto-opens — small portfolios fit on one
// screen so collapsing them by default is more friction than help.
const AUTO_OPEN_THRESHOLD = 10;
const TABLE_OPEN_KEY = 'portfolioTableOpen';

// Color map kept stable across the whole component (badges + treemap) so the
// visual code (DO=blue, FM=cyan, SP=amber, FQ=red) is consistent everywhere.
const ORIGIN_COLORS: Record<string, string> = {
  DO: 'var(--color-primary)',
  FM: '#50E6FF',
  SP: '#FFB900',
  FQ: '#E74856',
};
const HOLDING_COLORS: Record<string, string> = {
  Long: '#107C10',
  Short: '#FFB900',
};
const BROKER_COLORS: Record<string, string> = {
  fidelity: 'var(--color-primary)',
  morgan_stanley: '#50E6FF',
};

type GroupBy = 'origin' | 'holding' | 'broker';

export function Portfolio({ lots, onLotsChange, grants = [], dividends = [], cashInterest = [], onBulkQualify, hasGrants = false }: PortfolioProps) {
  const [filterOrigin, setFilterOrigin] = React.useState<StockOrigin | 'all'>('all');
  const [filterHolding, setFilterHolding] = React.useState<'all' | 'Short' | 'Long'>('all');
  const [filterBroker, setFilterBroker] = React.useState<Broker | 'all'>('all');
  // Sortable columns: clicking a header cycles direction (desc → asc), clicking
  // another column resets to the column's natural default direction.
  const [sortKey, setSortKey] = React.useState<PortfolioSortKey>('date');
  const [sortDir, setSortDir] = React.useState<'asc' | 'desc'>('desc');
  const handleSort = React.useCallback((key: PortfolioSortKey) => {
    setSortKey((prevKey) => {
      if (prevKey === key) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
        return prevKey;
      }
      setSortDir('desc');
      return key;
    });
  }, []);
  // Currency-conversion details (Prix USD / Taux BCE) are hidden by default to
  // keep the table compact; user can opt in when she needs to audit FX rates.
  const [showFxDetails, setShowFxDetails] = React.useState(false);

  const presentBrokers = React.useMemo(() => {
    return Array.from(new Set(lots.map((l) => l.broker))) as Broker[];
  }, [lots]);
  const hasMultipleBrokers = presentBrokers.length > 1;

  const filteredLots = React.useMemo(() => {
    let result = [...lots];
    if (filterOrigin !== 'all') result = result.filter((l) => l.origin === filterOrigin);
    if (filterHolding !== 'all') result = result.filter((l) => l.holdingPeriod === filterHolding);
    if (filterBroker !== 'all') result = result.filter((l) => l.broker === filterBroker);

    const dir = sortDir === 'asc' ? 1 : -1;
    result.sort((a, b) => {
      switch (sortKey) {
        case 'date':
          return dir * (a.acquisitionDate.getTime() - b.acquisitionDate.getTime());
        case 'origin':
          return dir * a.origin.localeCompare(b.origin);
        case 'broker':
          return dir * a.broker.localeCompare(b.broker);
        case 'quantity':
          return dir * (a.quantity - b.quantity);
        case 'cost':
          return dir * (a.costBasisPerShare - b.costBasisPerShare);
        case 'fmv':
          return dir * ((a.esppFmvPerShare ?? 0) - (b.esppFmvPerShare ?? 0));
        case 'value':
          return dir * (a.currentValue - b.currentValue);
        case 'gain':
          return dir * (a.unrealizedGainLoss - b.unrealizedGainLoss);
        case 'holding':
          // Long > Short
          return dir * (a.holdingPeriod === b.holdingPeriod ? 0 : a.holdingPeriod === 'Long' ? 1 : -1);
        case 'available': {
          const ta = a.availableForSaleDate?.getTime() ?? 0;
          const tb = b.availableForSaleDate?.getTime() ?? 0;
          return dir * (ta - tb);
        }
      }
    });

    return result;
  }, [lots, filterOrigin, filterHolding, filterBroker, sortKey, sortDir]);

  const totalQuantity = lots.reduce((sum, l) => sum + l.quantity, 0);
  const totalValue = lots.reduce((sum, l) => sum + l.currentValue, 0);
  const totalGainLoss = lots.reduce((sum, l) => sum + l.unrealizedGainLoss, 0);

  // When the lot table is open AND filtered, swap the header KPIs to reflect
  // the filtered slice — that's the question the user is currently asking
  // ("how much weight do my Macron AGAs carry?"). When closed/unfiltered we
  // keep the global totals so the card is always a snapshot of the whole.
  const filteredQuantity = filteredLots.reduce((sum, l) => sum + l.quantity, 0);
  const filteredValue = filteredLots.reduce((sum, l) => sum + l.currentValue, 0);
  const filteredGainLoss = filteredLots.reduce((sum, l) => sum + l.unrealizedGainLoss, 0);

  const [groupBy, setGroupBy] = React.useState<GroupBy>('origin');

  // Aggregate lots into buckets for the treemap. Buckets are sorted by value
  // desc so recharts' squarified layout puts the dominant category top-left.
  const treemapData = React.useMemo(() => {
    // recharts Treemap reads the bucket label from the `name` field; we keep
    // `code` as a short identifier (origin code, broker key) for tiny tiles.
    type Bucket = { key: string; name: string; code: string; value: number; count: number; shares: number; gainLoss: number; fill: string };
    const buckets = new Map<string, Bucket>();
    for (const lot of lots) {
      let key: string;
      let name: string;
      let code: string;
      let fill: string;
      if (groupBy === 'origin') {
        key = lot.origin;
        name = lot.origin;
        code = lot.origin;
        fill = ORIGIN_COLORS[lot.origin] ?? '#888';
      } else if (groupBy === 'holding') {
        key = lot.holdingPeriod;
        name = lot.holdingPeriod === 'Long' ? '≥ 2 ans' : '< 2 ans';
        code = lot.holdingPeriod === 'Long' ? 'LT' : 'CT';
        fill = HOLDING_COLORS[lot.holdingPeriod] ?? '#888';
      } else {
        key = lot.broker;
        name = brokerLabel(lot.broker);
        code = lot.broker === 'fidelity' ? 'FID' : 'MS';
        fill = BROKER_COLORS[lot.broker] ?? '#888';
      }
      const existing = buckets.get(key);
      if (existing) {
        existing.value += lot.currentValue;
        existing.count += 1;
        existing.shares += lot.quantity;
        existing.gainLoss += lot.unrealizedGainLoss;
      } else {
        buckets.set(key, {
          key,
          name,
          code,
          value: Math.max(0, lot.currentValue),
          count: 1,
          shares: lot.quantity,
          gainLoss: lot.unrealizedGainLoss,
          fill,
        });
      }
    }
    return Array.from(buckets.values()).sort((a, b) => b.value - a.value);
  }, [lots, groupBy]);

  // Hide the treemap when it would degenerate to a single full-width tile —
  // it adds visual noise without conveying any breakdown.
  const showTreemap = treemapData.length >= 2 && totalValue > 0;

  const handlePlanTypeChange = (lotId: string, planType: string) => {
    const updated = lots.map((l) => {
      if (l.id === lotId && l.origin === 'DO') {
        const newLot = { ...l, planType: planType as StockLot['planType'] };
        // Persist in localStorage
        const overrides = JSON.parse(localStorage.getItem('planTypeOverrides') || '{}');
        overrides[lotId] = planType;
        safeSetItem('planTypeOverrides', JSON.stringify(overrides));
        return newLot;
      }
      return l;
    });
    onLotsChange(updated);
  };

  const hasDOLots = lots.some((l) => l.origin === 'DO');
  const hasUsdImport = lots.some((l) => l.importCurrency === 'USD');
  const hasEsppLots = lots.some((l) => l.origin === 'SP');
  const totalEligibleForBulk = countEligible(lots);
  const [bulkOpen, setBulkOpen] = React.useState(false);

  const isFiltered = filterOrigin !== 'all' || filterHolding !== 'all' || filterBroker !== 'all';
  const resetFilters = () => {
    setFilterOrigin('all');
    setFilterHolding('all');
    setFilterBroker('all');
  };

  // Collapsible lot detail: persist user choice in localStorage; auto-open
  // for small portfolios where collapsing has no real benefit.
  const [tableOpen, setTableOpen] = React.useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(TABLE_OPEN_KEY);
      if (saved === 'true') return true;
      if (saved === 'false') return false;
    } catch {
      /* ignore */
    }
    return lots.length > 0 && lots.length <= AUTO_OPEN_THRESHOLD;
  });
  // Header KPIs reflect filters only when the lot table is open AND a filter is
  // active; otherwise the card stays a global snapshot of the whole portfolio.
  const showFilteredKpis = tableOpen && isFiltered;
  const toggleTable = () => {
    setTableOpen((v) => {
      const next = !v;
      try {
        localStorage.setItem(TABLE_OPEN_KEY, String(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <CardTitle className="flex items-center gap-2">
                <Briefcase className="h-5 w-5" />
                Mon portefeuille
              </CardTitle>
              <p className="text-sm text-gray-500 mt-0.5">
                {showFilteredKpis ? (
                  <>
                    <span className="font-medium text-gray-700">
                      {filteredLots.length.toLocaleString('fr-FR')} / {lots.length.toLocaleString('fr-FR')}
                    </span>{' '}
                    lot{filteredLots.length > 1 ? 's' : ''} affiché{filteredLots.length > 1 ? 's' : ''} ·{' '}
                    {filteredQuantity.toLocaleString('fr-FR', { maximumFractionDigits: 4 })} action
                    {filteredQuantity > 1 ? 's' : ''}
                  </>
                ) : (
                  <>
                    {lots.length.toLocaleString('fr-FR')} lot{lots.length > 1 ? 's' : ''} ·{' '}
                    {totalQuantity.toLocaleString('fr-FR', { maximumFractionDigits: 4 })} action
                    {totalQuantity > 1 ? 's' : ''}
                  </>
                )}
              </p>
            </div>
          </div>
          {/* KPIs row */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
            <Kpi
              label={showFilteredKpis ? 'Actions filtrées' : 'Actions totales'}
              value={(showFilteredKpis ? filteredQuantity : totalQuantity).toLocaleString('fr-FR', { maximumFractionDigits: 4 })}
            />
            <Kpi
              label={showFilteredKpis ? 'Valeur filtrée' : 'Valeur totale'}
              value={formatEUR(showFilteredKpis ? filteredValue : totalValue)}
            />
            <Kpi
              label={
                <span className="flex items-center gap-1">
                  PV/MV latente
                  {hasUsdImport && (
                    <Tooltip content="La PV/MV en euros peut différer de celle affichée par Fidelity en dollars : le coût d'acquisition est converti au taux BCE historique de chaque date d'achat, tandis que la valeur actuelle est convertie au taux du jour." />
                  )}
                </span>
              }
              value={`${(showFilteredKpis ? filteredGainLoss : totalGainLoss) >= 0 ? '+' : ''}${formatEUR(showFilteredKpis ? filteredGainLoss : totalGainLoss)}`}
              valueClassName={(showFilteredKpis ? filteredGainLoss : totalGainLoss) >= 0 ? 'text-green-600' : 'text-red-600'}
            />
          </div>

          {/* Allocation treemap */}
          {showTreemap && (
            <div className="mt-4 rounded-md bg-gray-50 p-3">
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-xs font-medium text-gray-600">Répartition par valeur</span>
                <Select
                  value={groupBy}
                  onChange={(e) => setGroupBy(e.target.value as GroupBy)}
                  className="h-8 text-xs w-36 px-2"
                  aria-label="Grouper la répartition par"
                >
                  <option value="origin">par Origine</option>
                  <option value="holding">par Détention</option>
                  {hasMultipleBrokers && <option value="broker">par Courtier</option>}
                </Select>
              </div>
              <div className="h-32 sm:h-36">
                <ResponsiveContainer width="100%" height="100%">
                  <Treemap
                    data={treemapData}
                    dataKey="value"
                    aspectRatio={4 / 3}
                    stroke="#fff"
                    isAnimationActive={false}
                    content={<TreemapTile total={totalValue} />}
                  />
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Toggle row */}
          <button
            type="button"
            onClick={toggleTable}
            className="mt-3 -mx-2 -mb-2 flex w-[calc(100%+1rem)] items-center justify-between gap-2 rounded-md px-2 py-2 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
            aria-expanded={tableOpen}
            aria-controls="portfolio-lot-detail"
          >
            <span className="flex items-center gap-1.5 font-medium">
              {tableOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              {tableOpen ? 'Masquer le détail' : `Voir le détail des ${lots.length} lot${lots.length > 1 ? 's' : ''}`}
            </span>
            {isFiltered && tableOpen && (
              <span className="text-xs text-gray-500">
                {filteredLots.length} / {lots.length} affiché{filteredLots.length > 1 ? 's' : ''}
              </span>
            )}
          </button>
        </CardHeader>
        {tableOpen && (
          <CardContent id="portfolio-lot-detail" className="pt-0 space-y-4">
            {/* DO lots info */}
            {hasDOLots && (
              <Alert>
                <div className="flex flex-col gap-2">
                  <div>
                    Les lots <strong>DO</strong> n'indiquent pas le régime fiscal. Les lots <strong>FM</strong> et <strong>FQ</strong> sont automatiquement qualifiés.
                    {hasGrants
                      ? ' Vérifiez le régime de vos lots DO restants ci-dessous.'
                      : ' Importez votre StockExport pour qualifier automatiquement les lots, ou utilisez la qualification en lot.'}
                  </div>
                  {onBulkQualify && totalEligibleForBulk > 1 && (
                    <button
                      type="button"
                      onClick={() => setBulkOpen((v) => !v)}
                      className="self-start text-xs font-medium text-primary hover:underline"
                    >
                      {bulkOpen ? 'Masquer la qualification en lot' : `Qualifier en lot ${totalEligibleForBulk} lots non reconciliés`}
                    </button>
                  )}
                </div>
              </Alert>
            )}
            {onBulkQualify && bulkOpen && totalEligibleForBulk > 0 && (
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                <BulkQualifyPanel
                  eligibleCount={totalEligibleForBulk}
                  onApply={(choice) => {
                    onBulkQualify(choice);
                    setBulkOpen(false);
                  }}
                  compact
                />
              </div>
            )}

            {/* Filters — sticky so they remain reachable while scrolling lots */}
            <div className="sticky top-0 z-20 -mx-6 px-6 py-2 bg-white/95 backdrop-blur border-b border-gray-100 flex flex-wrap items-center gap-3">
              {hasMultipleBrokers && (
                <Select value={filterBroker} onChange={(e) => setFilterBroker(e.target.value as Broker | 'all')} className="w-44" aria-label="Filtrer par courtier">
                  <option value="all">Tous courtiers</option>
                  {presentBrokers.map((b) => (
                    <option key={b} value={b}>{brokerLabel(b)}</option>
                  ))}
                </Select>
              )}
              <Select value={filterOrigin} onChange={(e) => setFilterOrigin(e.target.value as StockOrigin | 'all')} className="w-40" aria-label="Filtrer par type">
                <option value="all">Tous types</option>
                <option value="SP">ESPP (SP)</option>
                <option value="DO">Stock Award (DO)</option>
                <option value="FM">AGA Macron (FM)</option>
                <option value="FQ">AGA pré-Macron (FQ)</option>
              </Select>
              <Select value={filterHolding} onChange={(e) => setFilterHolding(e.target.value as 'all' | 'Short' | 'Long')} className="w-40" aria-label="Filtrer par période de détention">
                <option value="all">Toute période</option>
                <option value="Short">Court terme</option>
                <option value="Long">Long terme</option>
              </Select>
              {isFiltered && (
                <button
                  type="button"
                  onClick={resetFilters}
                  className="text-xs text-gray-600 hover:text-gray-900 underline-offset-2 hover:underline self-center"
                >
                  Réinitialiser
                </button>
              )}
              <OriginCodesLegend />
              {hasUsdImport && (
                <button
                  type="button"
                  onClick={() => setShowFxDetails((v) => !v)}
                  className="ml-auto text-xs text-gray-600 hover:text-gray-900 underline-offset-2 hover:underline self-center"
                >
                  {showFxDetails ? 'Masquer' : 'Afficher'} les détails de change
                </button>
              )}
            </div>

            <PortfolioTableAndCards
              filteredLots={filteredLots}
              hasMultipleBrokers={hasMultipleBrokers}
              hasUsdImport={hasUsdImport}
              hasEsppLots={hasEsppLots}
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={handleSort}
              showFxDetails={showFxDetails}
              onPlanTypeChange={handlePlanTypeChange}
            />
          </CardContent>
        )}
      </Card>

      <UnvestedView grants={grants} />
      <DividendsView dividends={dividends} cashInterest={cashInterest} />
    </div>
  );
}

function Kpi({
  label,
  value,
  valueClassName,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  valueClassName?: string;
}) {
  return (
    <div className="rounded-md bg-gray-50 px-3 py-2">
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`text-base font-semibold ${valueClassName ?? ''}`}>{value}</div>
    </div>
  );
}

interface TreemapTileNodeProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  index?: number;
  // Recharts spreads bucket props at top level (name, value, fill, plus our own
  // custom fields like `code`) onto the content component.
  name?: string;
  value?: number;
  fill?: string;
  code?: string;
  [key: string]: unknown;
}

// Custom tile renderer for the allocation treemap. Text is rendered through a
// `<foreignObject>` so the browser uses its native font rasteriser (much
// crisper than SVG `<text>`). A native `title` attribute provides a tooltip on
// hover for every tile, including slivers too small to show any inline text.
function TreemapTile({ total, ...nodeProps }: { total: number } & TreemapTileNodeProps) {
  const { x = 0, y = 0, width = 0, height = 0 } = nodeProps;
  const name = nodeProps.name ?? '';
  const code = nodeProps.code ?? name;
  const value = nodeProps.value ?? 0;
  const fill = nodeProps.fill ?? '#888';
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  const tooltip = `${name} · ${formatEUR(value)} · ${pct} %`;

  // Choose what fits inside the rectangle. For unusable sizes we still render
  // the rect (and keep the tooltip via `title`) so the colour stays visible.
  const showFull = width > 70 && height > 36;
  const showAmount = width > 90 && height > 56;
  const showCodeOnly = !showFull && width > 26 && height > 18;

  return (
    <g>
      <title>{tooltip}</title>
      <rect x={x} y={y} width={width} height={height} fill={fill} stroke="#fff" strokeWidth={2} />
      {(showFull || showCodeOnly) && (
        <foreignObject x={x} y={y} width={width} height={height} style={{ pointerEvents: 'none' }}>
          <div
            style={{
              width: '100%',
              height: '100%',
              boxSizing: 'border-box',
              padding: showFull ? '6px 8px' : '0',
              color: '#fff',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: showFull ? 'flex-start' : 'center',
              alignItems: showFull ? 'flex-start' : 'center',
              fontFamily: 'inherit',
              lineHeight: 1.2,
              userSelect: 'none',
            }}
          >
            {showFull ? (
              <>
                <div style={{ fontSize: '12px', fontWeight: 600 }}>
                  {name} <span style={{ fontWeight: 400, opacity: 0.85, marginLeft: 4 }}>{pct} %</span>
                </div>
                {showAmount && (
                  <div style={{ fontSize: '11px', opacity: 0.9, marginTop: 2 }}>
                    {formatEUR(value)}
                  </div>
                )}
              </>
            ) : (
              <div style={{ fontSize: '11px', fontWeight: 600 }}>{code}</div>
            )}
          </div>
        </foreignObject>
      )}
    </g>
  );
}

interface PortfolioTableAndCardsProps {
  filteredLots: StockLot[];
  hasMultipleBrokers: boolean;
  hasUsdImport: boolean;
  hasEsppLots: boolean;
  showFxDetails: boolean;
  sortKey: PortfolioSortKey;
  sortDir: 'asc' | 'desc';
  onSort: (key: PortfolioSortKey) => void;
  onPlanTypeChange: (lotId: string, planType: string) => void;
}

// Mirror of the inner SortKey type — exposed at module level so the helper
// component below can be typed without a circular reference.
export type PortfolioSortKey =
  | 'date'
  | 'origin'
  | 'quantity'
  | 'cost'
  | 'value'
  | 'gain'
  | 'holding'
  | 'available'
  | 'broker'
  | 'fmv';

function PortfolioTableAndCards({
  filteredLots,
  hasMultipleBrokers,
  hasUsdImport,
  hasEsppLots,
  showFxDetails,
  sortKey,
  sortDir,
  onSort,
  onPlanTypeChange: handlePlanTypeChange,
}: PortfolioTableAndCardsProps) {
  return (
    <>
      {/* Table — desktop */}
      <div className="hidden md:block -mx-6">
        <div className="overflow-x-auto border-y border-gray-200">
          <table className="w-full text-sm whitespace-nowrap">
            <thead>
                <tr className="border-b bg-gray-50 text-xs uppercase tracking-wide text-gray-600">
                  <SortableTh sortKey={sortKey} sortDir={sortDir} onSort={onSort} columnKey="date" align="left" className="sticky left-0 z-10 bg-gray-50 shadow-[1px_0_0_0_rgb(229,231,235)]">Date</SortableTh>
                  {hasMultipleBrokers && (
                    <SortableTh sortKey={sortKey} sortDir={sortDir} onSort={onSort} columnKey="broker" align="center">Courtier</SortableTh>
                  )}
                  <SortableTh sortKey={sortKey} sortDir={sortDir} onSort={onSort} columnKey="quantity" align="right">Qté</SortableTh>
                  <SortableTh sortKey={sortKey} sortDir={sortDir} onSort={onSort} columnKey="cost" align="right">Prix/act.</SortableTh>
                  {hasUsdImport && showFxDetails && (
                    <>
                      <th className="text-right px-2.5 py-2 font-medium">Prix USD</th>
                      <th className="text-right px-2.5 py-2 font-medium">Taux BCE</th>
                    </>
                  )}
                  {hasEsppLots && (
                    <SortableTh sortKey={sortKey} sortDir={sortDir} onSort={onSort} columnKey="fmv" align="right">
                      <span className="inline-flex items-center gap-1">
                        FMV acq.
                        <Tooltip content="Valeur de marché à la date d'achat ESPP (avant décote 10 %). Utilisée comme prix de revient fiscal pour le calcul de la plus-value de cession." />
                      </span>
                    </SortableTh>
                  )}
                  <SortableTh sortKey={sortKey} sortDir={sortDir} onSort={onSort} columnKey="value" align="right">Valeur</SortableTh>
                  <SortableTh sortKey={sortKey} sortDir={sortDir} onSort={onSort} columnKey="gain" align="right">PV/MV</SortableTh>
                  <SortableTh sortKey={sortKey} sortDir={sortDir} onSort={onSort} columnKey="origin" align="center">Origine</SortableTh>
                  <th className="text-center px-2.5 py-2 font-medium">
                    Régime
                    <Tooltip content="Le régime fiscal détermine le traitement de votre gain d'acquisition. Les lots FM/FQ sont automatiquement qualifiés." />
                  </th>
                  <SortableTh sortKey={sortKey} sortDir={sortDir} onSort={onSort} columnKey="holding" align="center">Détention</SortableTh>
                  <SortableTh sortKey={sortKey} sortDir={sortDir} onSort={onSort} columnKey="available" align="left">Dispo.</SortableTh>
                </tr>
              </thead>
              <tbody>
                {filteredLots.map((lot) => {
                  const notYetAvailable = lot.availableForSaleDate && lot.availableForSaleDate > new Date();
                  return (
                    <tr key={lot.id} className="border-b hover:bg-gray-50 group">
                      <td className="px-2.5 py-2 sticky left-0 bg-white group-hover:bg-gray-50 shadow-[1px_0_0_0_rgb(229,231,235)]">{formatDate(lot.acquisitionDate)}</td>
                      {hasMultipleBrokers && (
                        <td className="px-2.5 py-2 text-center">
                          <BrokerLogo broker={lot.broker} className="h-5" />
                        </td>
                      )}
                      <td className="px-2.5 py-2 text-right">{lot.quantity.toLocaleString('fr-FR', { maximumFractionDigits: 4 })}</td>
                      <td className="px-2.5 py-2 text-right">{formatEUR(lot.costBasisPerShare)}</td>
                      {hasUsdImport && showFxDetails && (
                        <>
                          <td className="px-2.5 py-2 text-right text-gray-500">
                            {lot.costBasisPerShareUsd ? formatUSD(lot.costBasisPerShareUsd) : '—'}
                          </td>
                          <td className="px-2.5 py-2 text-right text-gray-500 font-mono text-xs">
                            {lot.eurUsdRate ? lot.eurUsdRate.toFixed(4) : '—'}
                          </td>
                        </>
                      )}
                      {hasEsppLots && (
                        <td className="px-2.5 py-2 text-right">
                          {lot.origin === 'SP' ? formatEUR(lot.esppFmvPerShare ?? 0) : '—'}
                        </td>
                      )}
                      <td className="px-2.5 py-2 text-right">{formatEUR(lot.currentValue)}</td>
                      <td className={`px-2.5 py-2 text-right ${lot.unrealizedGainLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        <span className="inline-flex items-center gap-1">
                          {lot.unrealizedGainLoss >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                          {formatEUR(Math.abs(lot.unrealizedGainLoss))}
                        </span>
                      </td>
                      <td className="px-2.5 py-2 text-center">
                        <Badge variant={lot.origin === 'SP' ? 'secondary' : lot.origin === 'FM' ? 'success' : 'default'}>
                          {originLabel(lot.origin)}
                        </Badge>
                      </td>
                      <td className="px-2.5 py-2 text-center">
                        {lot.origin === 'DO' ? (
                          <Select
                            value={lot.planType}
                            onChange={(e) => handlePlanTypeChange(lot.id, e.target.value)}
                            className="w-44 text-xs h-8"
                          >
                            <option value="qualified_macron">Qualifié (Macron)</option>
                            <option value="non_qualified">Non qualifié</option>
                          </Select>
                        ) : (
                          <span className="text-xs">{planTypeLabel(lot.planType)}</span>
                        )}
                      </td>
                      <td className="px-2.5 py-2 text-center">
                        <Badge variant={lot.holdingPeriod === 'Long' ? 'success' : 'outline'}>
                          {lot.holdingPeriod === 'Long' ? '≥ 2 ans' : '< 2 ans'}
                        </Badge>
                      </td>
                      <td className="px-2.5 py-2">
                        {notYetAvailable ? (
                          <span className="text-amber-600 text-xs font-medium">
                            ⚠️ {formatDate(lot.availableForSaleDate)}
                          </span>
                        ) : (
                          <span className="text-green-600 text-xs">Disponible</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

      {/* Cards — mobile (< md) */}
      <div className="md:hidden space-y-2">
        {filteredLots.length === 0 && (
          <Card>
            <CardContent className="p-4 text-center text-sm text-gray-500">
              Aucun lot à afficher avec les filtres actuels.
            </CardContent>
          </Card>
        )}
        {filteredLots.map((lot) => (
          <MobileLotCard
            key={lot.id}
            lot={lot}
            hasMultipleBrokers={hasMultipleBrokers}
            hasUsdImport={hasUsdImport}
            hasEsppLots={hasEsppLots}
            onPlanTypeChange={handlePlanTypeChange}
          />
        ))}
      </div>
    </>
  );
}

// Pulled out so it can host the "Détails" dialog state per-card without
// polluting PortfolioTableAndCards' render scope.
function MobileLotCard({
  lot,
  hasMultipleBrokers,
  hasUsdImport,
  hasEsppLots,
  onPlanTypeChange: handlePlanTypeChange,
}: {
  lot: StockLot;
  hasMultipleBrokers: boolean;
  hasUsdImport: boolean;
  hasEsppLots: boolean;
  onPlanTypeChange: (lotId: string, planType: string) => void;
}) {
  const [detailsOpen, setDetailsOpen] = React.useState(false);
  const notYetAvailable = lot.availableForSaleDate && lot.availableForSaleDate > new Date();

  return (
    <>
      <Card>
        <CardContent className="p-3 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-sm font-semibold">{formatDate(lot.acquisitionDate)}</div>
              <div className="text-xs text-gray-500">
                {lot.quantity.toLocaleString('fr-FR', { maximumFractionDigits: 4 })} actions · {formatEUR(lot.costBasisPerShare)}/action
              </div>
            </div>
            <div className="flex flex-col items-end gap-1">
              <Badge variant={lot.origin === 'SP' ? 'secondary' : lot.origin === 'FM' ? 'success' : 'default'}>
                {originLabel(lot.origin)}
              </Badge>
              {hasMultipleBrokers && (
                <BrokerLogo broker={lot.broker} className="h-5" />
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <div className="text-gray-500">Valeur</div>
              <div className="font-medium">{formatEUR(lot.currentValue)}</div>
            </div>
            <div>
              <div className="text-gray-500">PV/MV</div>
              <div className={`font-medium inline-flex items-center gap-1 ${lot.unrealizedGainLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {lot.unrealizedGainLoss >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                {formatEUR(Math.abs(lot.unrealizedGainLoss))}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 pt-2 border-t">
            <div className="flex items-center gap-1.5 flex-wrap">
              <Badge variant={lot.holdingPeriod === 'Long' ? 'success' : 'outline'}>
                {lot.holdingPeriod === 'Long' ? '≥ 2 ans' : '< 2 ans'}
              </Badge>
              {notYetAvailable ? (
                <span className="text-amber-600 text-xs font-medium">
                  ⚠️ dispo {formatDate(lot.availableForSaleDate)}
                </span>
              ) : (
                <span className="text-green-600 text-xs">Disponible</span>
              )}
            </div>
            <button
              type="button"
              onClick={() => setDetailsOpen(true)}
              className="text-xs text-primary hover:underline"
            >
              Détails
            </button>
          </div>
        </CardContent>
      </Card>

      <LotDetailsDialog
        open={detailsOpen}
        onClose={() => setDetailsOpen(false)}
        lot={lot}
        hasUsdImport={hasUsdImport}
        hasEsppLots={hasEsppLots}
        onPlanTypeChange={handlePlanTypeChange}
      />
    </>
  );
}

// Sortable column header used inside the desktop lot table. Renders a button
// element so the entire cell is clickable and announces aria-sort to assistive
// tech. Direction icon is only drawn for the active column.
function SortableTh({
  columnKey,
  sortKey,
  sortDir,
  onSort,
  align,
  children,
  className,
}: {
  columnKey: PortfolioSortKey;
  sortKey: PortfolioSortKey;
  sortDir: 'asc' | 'desc';
  onSort: (key: PortfolioSortKey) => void;
  align: 'left' | 'right' | 'center';
  children: React.ReactNode;
  className?: string;
}) {
  const active = sortKey === columnKey;
  const ariaSort = active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none';
  const alignClass = align === 'left' ? 'text-left' : align === 'right' ? 'text-right' : 'text-center';
  const justifyClass = align === 'left' ? 'justify-start' : align === 'right' ? 'justify-end' : 'justify-center';
  return (
    <th
      scope="col"
      aria-sort={ariaSort}
      className={`${alignClass} px-2.5 py-2 font-medium ${className ?? ''}`}
    >
      <button
        type="button"
        onClick={() => onSort(columnKey)}
        className={`flex w-full items-center gap-1 ${justifyClass} font-medium uppercase tracking-wide text-xs hover:text-gray-900 ${active ? 'text-gray-900' : 'text-gray-600'}`}
      >
        {children}
        {active ? (
          sortDir === 'asc'
            ? <ArrowUp className="h-3 w-3" aria-hidden="true" />
            : <ArrowDown className="h-3 w-3" aria-hidden="true" />
        ) : (
          <ArrowDown className="h-3 w-3 opacity-0 group-hover:opacity-30" aria-hidden="true" />
        )}
      </button>
    </th>
  );
}

// Compact button + popover legend explaining the SP/DO/FM/FQ origin codes.
// Keeps the filter bar tidy compared to the previous always-visible legend row.
function OriginCodesLegend() {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 text-xs text-gray-600 hover:text-gray-900 underline-offset-2 hover:underline self-center"
        aria-label="Que veulent dire SP, DO, FM, FQ ?"
      >
        <Info className="h-3.5 w-3.5" />
        Codes origine
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} className="max-w-lg">
        <div className="flex items-start justify-between gap-3 mb-3">
          <h2 className="text-base font-semibold">Codes d'origine des lots</h2>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-gray-400 hover:text-gray-600"
            aria-label="Fermer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <ul className="space-y-2 text-sm">
          <li className="flex items-start gap-2"><Badge variant="default">SP</Badge> <span><strong>ESPP</strong> — Employee Stock Purchase Plan : achat d'actions avec décote 10 %.</span></li>
          <li className="flex items-start gap-2"><Badge variant="default">DO</Badge> <span><strong>Stock Award</strong> — RSU / Discretionary Award. Le régime fiscal n'est pas indiqué : à confirmer auprès de votre RH.</span></li>
          <li className="flex items-start gap-2"><Badge variant="default">FM</Badge> <span><strong>AGA Macron</strong> — Attribution gratuite d'actions qualifiée (post-2018).</span></li>
          <li className="flex items-start gap-2"><Badge variant="default">FQ</Badge> <span><strong>AGA pré-Macron</strong> — Attribution gratuite d'actions qualifiée (pré-2018).</span></li>
        </ul>
        <DialogFooter>
          <Button onClick={() => setOpen(false)}>Fermer</Button>
        </DialogFooter>
      </Dialog>
    </>
  );
}

// Full-detail dialog used on mobile so the compact card can stay scannable
// while still giving access to FX, regime, and plan-type controls on demand.
function LotDetailsDialog({
  open,
  onClose,
  lot,
  hasUsdImport,
  hasEsppLots,
  onPlanTypeChange,
}: {
  open: boolean;
  onClose: () => void;
  lot: StockLot;
  hasUsdImport: boolean;
  hasEsppLots: boolean;
  onPlanTypeChange: (lotId: string, planType: string) => void;
}) {
  return (
    <Dialog open={open} onClose={onClose} className="max-w-md">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h2 className="text-base font-semibold">Lot du {formatDate(lot.acquisitionDate)}</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            {lot.quantity.toLocaleString('fr-FR', { maximumFractionDigits: 4 })} actions ·{' '}
            <Badge variant={lot.origin === 'SP' ? 'secondary' : lot.origin === 'FM' ? 'success' : 'default'}>{originLabel(lot.origin)}</Badge>
          </p>
        </div>
        <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label="Fermer">
          <X className="h-5 w-5" />
        </button>
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <dt className="text-gray-500">Prix de revient</dt>
        <dd className="text-right font-medium">{formatEUR(lot.costBasisPerShare)}/act.</dd>

        {hasEsppLots && lot.origin === 'SP' && (
          <>
            <dt className="text-gray-500">FMV à l'acquisition</dt>
            <dd className="text-right font-medium">{formatEUR(lot.esppFmvPerShare ?? 0)}</dd>
          </>
        )}

        <dt className="text-gray-500">Valeur actuelle</dt>
        <dd className="text-right font-medium">{formatEUR(lot.currentValue)}</dd>

        <dt className="text-gray-500">PV/MV latente</dt>
        <dd className={`text-right font-medium ${lot.unrealizedGainLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
          {lot.unrealizedGainLoss >= 0 ? '+' : ''}{formatEUR(lot.unrealizedGainLoss)}
        </dd>

        {hasUsdImport && lot.costBasisPerShareUsd && (
          <>
            <dt className="text-gray-500">Prix USD</dt>
            <dd className="text-right font-mono text-xs">{formatUSD(lot.costBasisPerShareUsd)}</dd>
            <dt className="text-gray-500">Taux BCE</dt>
            <dd className="text-right font-mono text-xs">{lot.eurUsdRate?.toFixed(4) ?? '—'}</dd>
          </>
        )}

        <dt className="text-gray-500">Détention</dt>
        <dd className="text-right">
          <Badge variant={lot.holdingPeriod === 'Long' ? 'success' : 'outline'}>
            {lot.holdingPeriod === 'Long' ? '≥ 2 ans' : '< 2 ans'}
          </Badge>
        </dd>

        <dt className="text-gray-500">Disponibilité</dt>
        <dd className="text-right">
          {lot.availableForSaleDate && lot.availableForSaleDate > new Date()
            ? <span className="text-amber-600 text-xs font-medium">{formatDate(lot.availableForSaleDate)}</span>
            : <span className="text-green-600 text-xs">Disponible</span>}
        </dd>

        <dt className="text-gray-500">Régime fiscal</dt>
        <dd className="text-right">
          {lot.origin === 'DO' ? (
            <Select
              value={lot.planType}
              onChange={(e) => onPlanTypeChange(lot.id, e.target.value)}
              className="text-xs h-8 w-40 ml-auto"
              aria-label="Statut fiscal"
            >
              <option value="qualified_macron">Qualifié (Macron)</option>
              <option value="non_qualified">Non qualifié</option>
            </Select>
          ) : (
            <span className="text-xs">{planTypeLabel(lot.planType)}</span>
          )}
        </dd>
      </dl>
      <DialogFooter>
        <Button onClick={onClose}>Fermer</Button>
      </DialogFooter>
    </Dialog>
  );
}
