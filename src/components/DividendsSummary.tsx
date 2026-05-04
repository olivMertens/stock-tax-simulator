import React from 'react';
import { FileCheck } from 'lucide-react';
import { formatUSD } from '../lib/utils';
import type { DividendEvent, CashInterestEvent } from '../lib/transaction-parser';

interface DividendsSummaryProps {
  dividends: DividendEvent[];
  cashInterest?: CashInterestEvent[];
  /** Optional file name to display in the heading (e.g. "depuis fichier.csv"). */
  fileName?: string | null;
  /** Optional extra note shown under the totals (used for the MS 15% hypothesis). */
  footnote?: React.ReactNode;
}

/**
 * Compact totals card for an already-filtered list of dividend events.
 * Shared between the Fidelity transaction-history importer and the
 * Morgan Stanley DRIP auto-import view so both broker cards display a
 * symmetric summary (Brut / Retenue US / Net + count of MSFT events).
 */
export function DividendsSummary({ dividends, cashInterest = [], fileName, footnote }: DividendsSummaryProps) {
  const totals = React.useMemo(() => {
    const gross = dividends.reduce((s, d) => s + d.grossUsd, 0);
    const tax = dividends.reduce((s, d) => s + d.taxWithheldUsd, 0);
    const net = dividends.reduce((s, d) => s + d.netUsd, 0);
    const cash = cashInterest.reduce((s, c) => s + c.amountUsd, 0);
    return { gross, tax, net, cash };
  }, [dividends, cashInterest]);

  if (dividends.length === 0) return null;

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm">
      <div className="flex items-center gap-2 mb-3">
        <FileCheck className="h-4 w-4 text-amber-700" />
        <span className="font-medium text-amber-900">
          {dividends.length} versement{dividends.length > 1 ? 's' : ''} de dividendes MSFT
          {fileName ? ` depuis ${fileName}` : ''}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Cell label="Brut" value={totals.gross} />
        <Cell label="Retenue US" value={totals.tax} />
        <Cell label="Net perçu" value={totals.net} highlight />
      </div>
      {totals.cash > 0 && (
        <p className="text-xs text-gray-600 mt-3 pt-3 border-t border-amber-200">
          Par ailleurs, {formatUSD(totals.cash)} d'intérêts sur le cash (MMKT). À déclarer
          séparément en case 2TR si option barème, non pris en compte ici.
        </p>
      )}
      {footnote && (
        <div className="text-xs text-gray-600 mt-3 pt-3 border-t border-amber-200">
          {footnote}
        </div>
      )}
    </div>
  );
}

function Cell({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className={`bg-white rounded-md border p-2 text-center ${highlight ? 'border-amber-300' : 'border-amber-100'}`}>
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`text-lg font-semibold ${highlight ? 'text-amber-900' : 'text-gray-900'}`}>{formatUSD(value)}</div>
    </div>
  );
}
