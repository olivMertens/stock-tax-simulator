import React from 'react';
import { Card, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { ThumbsUp, ChevronDown } from 'lucide-react';
import type { TaxSimulationResult, SaleSimulation, SaleLotEntry, AppSettings, TaxMode } from '../lib/types';
import { runSimulation } from '../lib/tax-engine';
import { getTaxConfig } from '../lib/tax-rates';
import { formatEUR, formatPercent } from '../lib/utils';

interface PfuVsBaremeComparatorProps {
  lots: SaleLotEntry[];
  settings: AppSettings;
  fiscalYear: number;
  /** Currently selected tax mode in the parent. Drives the active card. */
  taxMode: TaxMode;
  /** Switch the active mode (clicking a card calls this). */
  onTaxModeChange: (mode: TaxMode) => void;
}

/**
 * Side-by-side PFU vs barème comparison. Each card is clickable and acts as
 * the primary control for the tax mode (replacing the previous toggle +
 * separate KPI block). The card matching `taxMode` is shown as selected
 * (primary border); the more advantageous one carries an additional
 * "Recommandé" badge so the user can see at a glance whether their pick
 * matches the recommendation.
 */
export const PfuVsBaremeComparator = React.memo(function PfuVsBaremeComparator({
  lots,
  settings,
  fiscalYear,
  taxMode,
  onTaxModeChange,
}: PfuVsBaremeComparatorProps) {
  const { pfuResult, baremeResult, pfuBetter, savings, recommended } = React.useMemo(() => {
    const baseSim: SaleSimulation = {
      lots,
      taxMode: 'pfu',
      otherTaxableIncome: settings.otherTaxableIncome,
      taxShares: settings.taxShares,
      familyStatus: settings.familyStatus,
      priorLosses: settings.priorLosses,
      fiscalYear,
    };

    const pfu = runSimulation({ ...baseSim, taxMode: 'pfu' });
    const bareme = runSimulation({ ...baseSim, taxMode: 'bareme' });
    const isPfuBetter = pfu.totalTax <= bareme.totalTax;

    return {
      pfuResult: pfu,
      baremeResult: bareme,
      pfuBetter: isPfuBetter,
      savings: Math.abs(pfu.totalTax - bareme.totalTax),
      recommended: isPfuBetter ? 'PFU' : 'Barème progressif',
    };
  }, [lots, settings, fiscalYear]);

  if (lots.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-gray-500">
          Sélectionnez des lots à vendre pour comparer PFU et barème progressif.
        </CardContent>
      </Card>
    );
  }

  const pfuRate = (getTaxConfig(fiscalYear).pfuTotalRate * 100).toFixed(1).replace('.', ',');

  return (
    <div className="space-y-3">
      <div
        className="grid grid-cols-1 md:grid-cols-2 gap-3"
        role="radiogroup"
        aria-label="Régime fiscal"
      >
        <ComparisonCard
          title={`PFU (Flat Tax ${pfuRate} %)`}
          result={pfuResult}
          selected={taxMode === 'pfu'}
          recommended={pfuBetter}
          onSelect={() => onTaxModeChange('pfu')}
        />
        <ComparisonCard
          title="Barème progressif"
          result={baremeResult}
          selected={taxMode === 'bareme'}
          recommended={!pfuBetter}
          onSelect={() => onTaxModeChange('bareme')}
        />
      </div>

      {/* Recommendation footer — kept compact and conditional. */}
      <div className="p-3 bg-green-50 border border-green-200 rounded-lg flex items-start gap-3">
        <ThumbsUp className="h-4 w-4 text-green-600 shrink-0 mt-0.5" />
        <div className="text-sm">
          <span className="font-semibold text-green-800">Recommandation : {recommended}</span>
          <span className="text-green-700">
            {' · '}Économie estimée <strong>{formatEUR(savings)}</strong> par rapport à l'autre option.
            {!pfuBetter && (
              <> N'oubliez pas de cocher la case <strong>2OP</strong> sur votre déclaration.</>
            )}
          </span>
        </div>
      </div>
    </div>
  );
});

interface ComparisonCardProps {
  title: string;
  result: TaxSimulationResult;
  selected: boolean;
  recommended: boolean;
  onSelect: () => void;
}

/**
 * One side of the comparator. Renders as a button (radio role) so the entire
 * surface is keyboard-activatable and announces selected state to assistive
 * tech. The IR/PS breakdown is hidden behind a `<details>` to keep the
 * primary numbers (Total impôts / Net) prominent.
 */
function ComparisonCard({ title, result, selected, recommended, onSelect }: ComparisonCardProps) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={`text-left p-4 rounded-lg border-2 transition-all focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1 ${
        selected
          ? 'border-primary bg-primary/5 shadow-sm'
          : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
      }`}
    >
      <div className="flex items-center justify-between gap-2 mb-3">
        <h4 className="font-semibold">{title}</h4>
        <div className="flex items-center gap-1.5">
          {recommended && <Badge variant="success">★ Recommandé</Badge>}
          {selected && <Badge variant="default">Sélectionné</Badge>}
        </div>
      </div>

      <div className="space-y-1.5 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-600">Total impôts</span>
          <span className="font-semibold text-red-600 tabular-nums">{formatEUR(result.totalTax)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600">Montant net</span>
          <span className="font-bold text-green-700 tabular-nums">{formatEUR(result.netAmount)}</span>
        </div>
        <div className="flex justify-between text-xs text-gray-500">
          <span>Taux effectif</span>
          <span className="tabular-nums">{formatPercent(result.effectiveTaxRate)}</span>
        </div>
      </div>

      {/* IR/PS detail — collapsed by default to preserve the visual hierarchy
          of the headline figures above. Stop click propagation so toggling
          the disclosure does not also toggle the radio selection. */}
      <details
        className="mt-3 group"
        onClick={(e) => e.stopPropagation()}
      >
        <summary className="text-xs text-gray-500 hover:text-gray-700 cursor-pointer flex items-center gap-1 list-none">
          <ChevronDown className="h-3 w-3 transition-transform group-open:rotate-180" />
          Détail IR / PS
        </summary>
        <div className="mt-2 space-y-1 text-xs">
          <Row label="IR gain d'acquisition" value={result.acquisitionGainTax.irBelow + result.acquisitionGainTax.irAbove} />
          <Row label="PS gain d'acquisition" value={result.acquisitionGainTax.psBelow + result.acquisitionGainTax.psAbove} />
          {result.acquisitionGainTax.salaryContribution > 0 && (
            <Row label="Contribution salariale" value={result.acquisitionGainTax.salaryContribution} />
          )}
          <Row label="IR PV cession" value={result.capitalGainTax.ir} />
          <Row label="PS PV cession" value={result.capitalGainTax.ps} />
          {result.cehr > 0 && <Row label="CEHR" value={result.cehr} />}
          {result.cdhr > 0 && <Row label="CDHR" value={result.cdhr} />}
        </div>
      </details>
    </button>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between">
      <span className="text-gray-600">{label}</span>
      <span className="tabular-nums">{formatEUR(value)}</span>
    </div>
  );
}
