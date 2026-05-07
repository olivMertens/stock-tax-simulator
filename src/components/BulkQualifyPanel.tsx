import React from 'react';
import { Select } from './ui/select';
import { Button } from './ui/button';
import type { BulkQualifyChoice } from '../lib/bulk-qualify';
import type { PlanType, StockOrigin } from '../lib/types';

/**
 * Panel that lets a user requalify many lots at once when they don't
 * have a Microsoft StockExport file (and so cannot rely on automatic
 * reconciliation). Two modes:
 *   - 'uniform' — same (origin, planType) for all eligible lots.
 *   - 'byDate'  — split on a pivot acquisition date (typically used to
 *                 distinguish pre-Macron from Macron AGAs).
 *
 * The component is fully controlled by the caller through `onApply`. It
 * never mutates lots itself; it just builds a BulkQualifyChoice and
 * hands it back.
 */
export interface BulkQualifyPanelProps {
  eligibleCount: number;
  onApply: (choice: BulkQualifyChoice) => void;
  /** Optional secondary action shown alongside the primary button (e.g. "Importer StockExport"). */
  secondaryAction?: React.ReactNode;
  /** Compact rendering for inline banners. */
  compact?: boolean;
}

type Mode = 'uniform' | 'byDate';

// Default pivot used when the user picks the "by date" mode without
// further input. The Macron law was promulgated on 6 August 2015, but
// Microsoft only switched its qualified plan to the Macron regime for
// grants issued from 30 November 2016 onward (KPMG 2025 deck, p. 23).
//
// MSFT calendar specifics:
//   - Last pré-Macron qualified grant: 29 Nov 2016. With the pre-July-2017
//     qualified schedule (80% at Y+2, 20% at Y+3), its last vests fall in
//     November 2019.
//   - First Macron qualified grant: 30 Nov 2016. First vest at 80% in
//     November 2018.
//
// There is therefore an unavoidable overlap zone (late 2018 – late 2019)
// where vests of both regimes coexist. We default the pivot to the end
// of that overlap (2019-12-01) so users with a single regime get a sane
// default, but the explanatory text below makes the ambiguity explicit.
const DEFAULT_PIVOT_ISO = '2019-12-01';

function pairFor(planType: PlanType): { origin: StockOrigin; planType: PlanType } {
  if (planType === 'qualified_pre_macron') return { origin: 'FQ', planType };
  if (planType === 'non_qualified') return { origin: 'DO', planType };
  return { origin: 'FM', planType: 'qualified_macron' };
}

export function BulkQualifyPanel({ eligibleCount, onApply, secondaryAction, compact = false }: BulkQualifyPanelProps) {
  const [mode, setMode] = React.useState<Mode>('uniform');
  const [uniformPlanType, setUniformPlanType] = React.useState<PlanType>('qualified_macron');
  const [pivotDate, setPivotDate] = React.useState<string>(DEFAULT_PIVOT_ISO);
  const [beforePlanType, setBeforePlanType] = React.useState<PlanType>('qualified_pre_macron');
  const [afterPlanType, setAfterPlanType] = React.useState<PlanType>('qualified_macron');

  const handleApply = () => {
    if (mode === 'uniform') {
      const { origin, planType } = pairFor(uniformPlanType);
      onApply({ kind: 'uniform', origin, planType });
      return;
    }
    const [y, m, d] = pivotDate.split('-').map((s) => parseInt(s, 10));
    const pivot = new Date(y, (m || 1) - 1, d || 1);
    onApply({
      kind: 'byDate',
      pivotDate: pivot,
      before: pairFor(beforePlanType),
      after: pairFor(afterPlanType),
    });
  };

  if (eligibleCount === 0) return null;

  return (
    <div className={compact ? 'space-y-3' : 'space-y-4'}>
      <div role="radiogroup" aria-label="Mode de qualification" className="flex flex-col sm:flex-row gap-2">
        <label
          className={`flex-1 cursor-pointer rounded-lg border p-3 text-sm transition-colors ${
            mode === 'uniform' ? 'border-primary bg-primary/5' : 'border-gray-200 hover:border-gray-300'
          }`}
        >
          <input
            type="radio"
            name="bulk-qualify-mode"
            value="uniform"
            checked={mode === 'uniform'}
            onChange={() => setMode('uniform')}
            className="sr-only"
          />
          <span className="font-medium">Tous identiques</span>
          <span className="block text-xs text-gray-500 mt-0.5">
            Appliquer le même régime à tous les lots non reconciliés.
          </span>
        </label>
        <label
          className={`flex-1 cursor-pointer rounded-lg border p-3 text-sm transition-colors ${
            mode === 'byDate' ? 'border-primary bg-primary/5' : 'border-gray-200 hover:border-gray-300'
          }`}
        >
          <input
            type="radio"
            name="bulk-qualify-mode"
            value="byDate"
            checked={mode === 'byDate'}
            onChange={() => setMode('byDate')}
            className="sr-only"
          />
          <span className="font-medium">Selon la date d'acquisition</span>
          <span className="block text-xs text-gray-500 mt-0.5">
            Avant une date pivot → un régime, après → un autre (pré-Macron / Macron).
          </span>
        </label>
      </div>

      {mode === 'uniform' && (
        <div className="flex items-center gap-2 text-sm">
          <label htmlFor="bulk-uniform-plan" className="text-gray-700 whitespace-nowrap">
            Régime à appliquer :
          </label>
          <Select
            id="bulk-uniform-plan"
            value={uniformPlanType}
            onChange={(e) => setUniformPlanType(e.target.value as PlanType)}
            className="max-w-xs"
          >
            <option value="qualified_macron">AGA qualifiée — Macron</option>
            <option value="qualified_pre_macron">AGA qualifiée — pré-Macron</option>
            <option value="non_qualified">Stock Award — non qualifié</option>
          </Select>
        </div>
      )}

      {mode === 'byDate' && (
        <div className="space-y-2 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="bulk-pivot" className="text-gray-700 whitespace-nowrap">
              Date pivot :
            </label>
            <input
              id="bulk-pivot"
              type="date"
              value={pivotDate}
              onChange={(e) => setPivotDate(e.target.value)}
              className="h-10 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label htmlFor="bulk-before" className="block text-xs text-gray-500 mb-1">Avant la date pivot</label>
              <Select
                id="bulk-before"
                value={beforePlanType}
                onChange={(e) => setBeforePlanType(e.target.value as PlanType)}
              >
                <option value="qualified_pre_macron">AGA qualifiée — pré-Macron</option>
                <option value="qualified_macron">AGA qualifiée — Macron</option>
                <option value="non_qualified">Stock Award — non qualifié</option>
              </Select>
            </div>
            <div>
              <label htmlFor="bulk-after" className="block text-xs text-gray-500 mb-1">À partir de la date pivot</label>
              <Select
                id="bulk-after"
                value={afterPlanType}
                onChange={(e) => setAfterPlanType(e.target.value as PlanType)}
              >
                <option value="qualified_macron">AGA qualifiée — Macron</option>
                <option value="qualified_pre_macron">AGA qualifiée — pré-Macron</option>
                <option value="non_qualified">Stock Award — non qualifié</option>
              </Select>
            </div>
          </div>
          <p className="text-xs text-gray-500">
            Chez Microsoft, le régime Macron s'applique aux attributions à partir du <strong>30 novembre 2016</strong>.
            Avec le calendrier MSFT pré-juillet 2017 (80 % à Y+2, 20 % à Y+3), les premiers vests Macron arrivent
            fin 2018 et les derniers vests pré-Macron jusqu'à fin 2019&nbsp;: une zone de chevauchement existe.
            Ajustez la date pivot selon votre situation réelle, ou qualifiez les lots ambigus manuellement.
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <Button onClick={handleApply}>
          Appliquer à {eligibleCount} lot{eligibleCount > 1 ? 's' : ''}
        </Button>
        {secondaryAction}
      </div>
    </div>
  );
}
