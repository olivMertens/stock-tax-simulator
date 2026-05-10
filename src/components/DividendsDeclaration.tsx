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
import { FORM_2042_DIVIDENDS } from '../lib/tax-forms';
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

  // The option for the progressive tax rates (case 2OP) is GLOBAL and applies
  // to all investment income of the household (dividends, interest, capital
  // gains). The default is PFU (flat tax 31,4 %) which is the legal default.
  const [taxMode, setTaxMode] = React.useState<'pfu' | 'bareme'>('pfu');
  // The PFNL trimestriel (form 2778-DIV) is rarely filed in practice: most
  // taxpayers benefit from the "dispense" (RFR N-2 < 50k€ / 75k€). Default 0.
  const [pfnlAlreadyPaidEur, setPfnlAlreadyPaidEur] = React.useState<number>(0);

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

  const lines = buildDeclarationLines(yearSummary, { taxMode, pfnlAlreadyPaidEur });

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
        {/* Tax mode toggle (case 2OP) — applies globally to all investment income. */}
        <div className="flex flex-wrap items-center gap-2 p-2 rounded-lg border border-blue-200 bg-blue-50 text-xs">
          <span className="font-medium text-blue-900">Mode d'imposition (case 2OP) :</span>
          <label className="inline-flex items-center gap-1 cursor-pointer">
            <input
              type="radio"
              name="dividends-tax-mode"
              value="pfu"
              checked={taxMode === 'pfu'}
              onChange={() => setTaxMode('pfu')}
              className="h-3 w-3"
            />
            <span>PFU {dividendPfuRateLabel}{'\u202f'}% (par défaut)</span>
          </label>
          <label className="inline-flex items-center gap-1 cursor-pointer">
            <input
              type="radio"
              name="dividends-tax-mode"
              value="bareme"
              checked={taxMode === 'bareme'}
              onChange={() => setTaxMode('bareme')}
              className="h-3 w-3"
            />
            <span>Barème progressif (cocher 2OP)</span>
          </label>
        </div>

        <DeclarationLine
          code={FORM_2042_DIVIDENDS.case2DC.code}
          label="Dividendes bruts (revenus de capitaux mobiliers)"
          amount={lines.box2DC}
          note="Montant brut converti au taux BCE du jour de chaque versement."
          copied={copied === '2DC'}
          onCopy={() => copyValue('2DC', lines.box2DC)}
        />
        {taxMode === 'pfu' ? (
          <DeclarationLine
            code={FORM_2042_DIVIDENDS.case2CG.code}
            label="Revenus déjà soumis aux prélèvements sociaux sans CSG déductible"
            amount={lines.box2CG}
            note="Reporter le même montant qu'en 2DC (régime PFU)."
            copied={copied === '2CG'}
            onCopy={() => copyValue('2CG', lines.box2CG)}
          />
        ) : (
          <DeclarationLine
            code={FORM_2042_DIVIDENDS.case2BH.code}
            label="Revenus déjà soumis aux PS avec CSG déductible si option barème"
            amount={lines.box2BH}
            note="Reporter le même montant qu'en 2DC (option barème, case 2OP cochée)."
            copied={copied === '2BH'}
            onCopy={() => copyValue('2BH', lines.box2BH)}
            variant="success"
          />
        )}
        <DeclarationLine
          code={FORM_2042_DIVIDENDS.case2AB.code}
          label="Crédit d'impôt sur valeurs étrangères (retenue US 15 %)"
          amount={lines.box2AB}
          note="Convention fiscale France–USA : crédit d'impôt récupérable contre l'IR français."
          copied={copied === '2AB'}
          onCopy={() => copyValue('2AB', lines.box2AB)}
        />
        <DeclarationLine
          code={FORM_2042_DIVIDENDS.case2CK.code}
          label="Prélèvement forfaitaire non libératoire déjà versé (PFNL via 2778-DIV)"
          amount={lines.box2CK}
          note="0 € si dispense (RFR N-2 < 50k€ célibataire / 75k€ couple) ou si 2778-DIV non déposés."
          copied={copied === '2CK'}
          onCopy={() => copyValue('2CK', lines.box2CK)}
          editable={{ value: pfnlAlreadyPaidEur, onChange: setPfnlAlreadyPaidEur }}
        />
        <DeclarationLine
          code={FORM_2042_DIVIDENDS.case8VL.code}
          label="Impôt payé à l'étranger ouvrant droit à crédit d'impôt"
          amount={lines.box8VL}
          note="Section 7 « Revenus de source étrangère » — même montant qu'en 2AB."
          copied={copied === '8VL'}
          onCopy={() => copyValue('8VL', lines.box8VL)}
        />
        <DeclarationLine
          code={FORM_2042_DIVIDENDS.case8PL.code}
          label="Revenus nets de source étrangère"
          amount={lines.box8PL}
          note="Montant net des dividendes (après retenue US) ouvrant droit au crédit d'impôt."
          copied={copied === '8PL'}
          onCopy={() => copyValue('8PL', lines.box8PL)}
        />
        <p className="text-xs text-gray-500 pt-2 border-t border-gray-100">
          Conversion en euros au taux BCE du jour de chaque versement (méthode officielle DGFiP).
          Référence : KPMG « Obligations fiscales Microsoft » (mai 2026).
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
  variant,
  editable,
}: {
  code: string;
  label: string;
  amount: number;
  note: string;
  copied: boolean;
  onCopy: () => void;
  variant?: 'success';
  editable?: { value: number; onChange: (n: number) => void };
}) {
  const bg = variant === 'success' ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200';
  return (
    <div className={`flex items-start gap-3 p-3 rounded-lg border ${bg}`}>
      <div className="shrink-0 px-2 py-1 bg-white border border-gray-300 rounded text-xs font-mono font-semibold">
        {code}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-gray-500 mt-0.5">{note}</p>
      </div>
      <div className="shrink-0 flex items-center gap-2">
        {editable ? (
          <input
            type="number"
            min={0}
            step="0.01"
            value={editable.value || 0}
            onChange={(e) => editable.onChange(Number(e.target.value) || 0)}
            className="w-24 px-2 py-1 text-sm text-right border border-gray-300 rounded tabular-nums"
            aria-label={`Saisir la valeur de la case ${code}`}
          />
        ) : (
          <span className="font-semibold tabular-nums">{formatEUR(amount)}</span>
        )}
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
