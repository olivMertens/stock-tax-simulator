import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Coins, Copy, Check } from 'lucide-react';
import { Button } from './ui/button';
import { Select } from './ui/select';
import type { DividendEvent } from '../lib/transaction-parser';
import {
  enrichDividendsWithEur,
  groupDividendsByYear,
  buildDeclarationLines,
} from '../lib/dividends';
import { fetchECBRates } from '../lib/ecb-rates';
import { formatEUR } from '../lib/utils';
import { getTaxConfig } from '../lib/tax-rates';

interface DividendsDeclarationProps {
  dividends: DividendEvent[];
  fiscalYear: number;
}

export function DividendsDeclaration({ dividends, fiscalYear }: DividendsDeclarationProps) {
  const [rates, setRates] = React.useState<Record<string, number>>({});
  const [copied, setCopied] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (dividends.length === 0) return;
    let cancelled = false;
    fetchECBRates(dividends.map((d) => d.date)).then((r) => {
      if (!cancelled) setRates(r);
    });
    return () => {
      cancelled = true;
    };
  }, [dividends]);

  const { enriched } = React.useMemo(
    () => enrichDividendsWithEur(dividends, rates),
    [dividends, rates],
  );

  const groups = React.useMemo(() => groupDividendsByYear(enriched), [enriched]);
  const availableYears = React.useMemo(() => groups.map((g) => g.year), [groups]);

  // Default: fiscalYear if available, otherwise the most recent year with data,
  // otherwise n-1 (fiscalYear is typically the current calendar year, but dividend
  // declarations always concern the previous year).
  const defaultYear = React.useMemo(() => {
    if (availableYears.includes(fiscalYear)) return fiscalYear;
    if (availableYears.length > 0) return availableYears[availableYears.length - 1];
    return fiscalYear - 1;
  }, [availableYears, fiscalYear]);

  const [selectedYear, setSelectedYear] = React.useState<number>(defaultYear);
  // When the upstream `defaultYear` changes (e.g. a new dividend import shifts
  // the most-recent-year heuristic), realign the selected year. Tracked via
  // a "previous-prop" state slot so the reset happens during render — see
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  const [lastDefaultYear, setLastDefaultYear] = React.useState(defaultYear);
  if (defaultYear !== lastDefaultYear) {
    setLastDefaultYear(defaultYear);
    setSelectedYear(defaultYear);
  }

  const yearSummary = React.useMemo(
    () => groups.find((g) => g.year === selectedYear) ?? null,
    [groups, selectedYear],
  );

  if (dividends.length === 0) return null;

  const copyValue = (key: string, value: number) => {
    navigator.clipboard.writeText(value.toFixed(2).replace('.', ',')).catch(() => {});
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  };

  const yearPicker = availableYears.length > 1 && (
    <Select
      value={String(selectedYear)}
      onChange={(e) => setSelectedYear(Number(e.target.value))}
      className="h-8 text-sm w-auto"
      aria-label="Année de déclaration"
    >
      {availableYears.map((y) => (
        <option key={y} value={y}>
          {y}
        </option>
      ))}
    </Select>
  );

  if (!yearSummary) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Coins className="h-5 w-5" />
              Dividendes US {selectedYear}
            </CardTitle>
            {yearPicker}
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-600">
            Aucun dividende perçu en {selectedYear} d'après votre historique importé.
            {availableYears.length > 0 && (
              <> Données disponibles pour : {availableYears.join(', ')}.</>
            )}
          </p>
        </CardContent>
      </Card>
    );
  }

  const lines = buildDeclarationLines(yearSummary);

  // Dividends are taxed at the rate in force at the payment date (fait
  // générateur), not at the annual collection time. So a payment made in
  // year Y uses the year-Y PFU rate even if declared in year Y+1.
  const dividendPfuRateLabel = (
    getTaxConfig(selectedYear).pfuDividendsTotalRate * 100
  )
    .toFixed(1)
    .replace('.', ',');

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Coins className="h-5 w-5" />
              Dividendes US {selectedYear}
            </CardTitle>
            <CardDescription>
              {yearSummary.count} versement{yearSummary.count > 1 ? 's' : ''} Microsoft · brut{' '}
              {formatEUR(yearSummary.grossEur)} · retenue US {formatEUR(yearSummary.taxWithheldEur)}
            </CardDescription>
          </div>
          {yearPicker}
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        <DeclarationLine
          code="2DC"
          label="Dividendes bruts (revenus de capitaux mobiliers)"
          amount={lines.box2DC}
          note="Formulaire 2042 — à reporter tel quel."
          copied={copied === '2DC'}
          onCopy={() => copyValue('2DC', lines.box2DC)}
        />
        <DeclarationLine
          code="2AB"
          label="Crédit d'impôt lié aux revenus de capitaux mobiliers"
          amount={lines.box2AB}
          note="Retenue à la source US (15% par la convention fiscale France–USA), récupérable en crédit d'impôt."
          copied={copied === '2AB'}
          onCopy={() => copyValue('2AB', lines.box2AB)}
        />
        <DeclarationLine
          code="2BH"
          label="Revenus éligibles à l'abattement de 40% (si option barème)"
          amount={lines.box2BH}
          note={`À reporter uniquement si vous optez pour l'imposition au barème progressif. Sinon, PFU à ${dividendPfuRateLabel}\u202f% sur 2DC.`}
          copied={copied === '2BH'}
          onCopy={() => copyValue('2BH', lines.box2BH)}
        />
        <p className="text-xs text-gray-500 pt-2 border-t border-gray-100">
          Conversion en euros au taux BCE du jour de chaque versement (méthode officielle DGFiP).
        </p>
      </CardContent>
    </Card>
  );
}

function DeclarationLine({
  code,
  label,
  amount,
  note,
  copied,
  onCopy,
}: {
  code: string;
  label: string;
  amount: number;
  note: string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div className="flex items-start gap-3 p-3 rounded-lg border border-gray-200 bg-gray-50">
      <div className="shrink-0 px-2 py-1 bg-white border border-gray-300 rounded text-xs font-mono font-semibold">
        {code}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-gray-500 mt-0.5">{note}</p>
      </div>
      <div className="shrink-0 flex items-center gap-2">
        <span className="font-semibold tabular-nums">{formatEUR(amount)}</span>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={onCopy}
          aria-label={`Copier la valeur de la case ${code}`}
        >
          {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}
