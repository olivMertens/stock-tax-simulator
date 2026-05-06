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
// further input. The Macron law (loi pour la croissance, l'activité et
// l'égalité des chances économiques) was promulgated on 6 August 2015.
// AGAs awarded on/after 8 August 2015 fall under the Macron regime;
// earlier ones are pré-Macron. Vest dates lag award dates by ~3-4 years
// for typical RSU schedules, so 2019-01-01 is a reasonable default
// pivot on the *vest* (acquisition) date axis. The user can adjust.
const DEFAULT_PIVOT_ISO = '2019-01-01';

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
            La loi Macron s'applique aux attributions à partir du 8 août 2015. Les dates d'acquisition (vesting) sont
            généralement décalées de 3-4 ans. Ajustez la date pivot selon votre situation réelle.
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
