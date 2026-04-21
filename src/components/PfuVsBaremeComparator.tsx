import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Scale, ThumbsUp } from 'lucide-react';
import type { TaxSimulationResult, SaleSimulation, SaleLotEntry, AppSettings } from '../lib/types';
import { runSimulation } from '../lib/tax-engine';
import { getTaxConfig } from '../lib/tax-rates';
import { formatEUR, formatPercent } from '../lib/utils';

interface PfuVsBaremeComparatorProps {
  lots: SaleLotEntry[];
  settings: AppSettings;
  fiscalYear: number;
}

export const PfuVsBaremeComparator = React.memo(function PfuVsBaremeComparator({ lots, settings, fiscalYear }: PfuVsBaremeComparatorProps) {
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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Scale className="h-5 w-5" />
          Comparaison PFU vs Barème progressif
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <ComparisonColumn
            title={`PFU (${(getTaxConfig(fiscalYear).pfuTotalRate * 100).toFixed(1).replace('.', ',')}%)`}
            result={pfuResult}
            isRecommended={pfuBetter}
          />
          <ComparisonColumn
            title="Barème progressif"
            result={baremeResult}
            isRecommended={!pfuBetter}
          />
        </div>

        {/* Recommendation */}
        <div className="p-4 bg-green-50 border border-green-200 rounded-lg flex items-start gap-3">
          <ThumbsUp className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-green-800">
              Recommandation : {recommended}
            </p>
            <p className="text-sm text-green-700 mt-1">
              Économie estimée de <strong>{formatEUR(savings)}</strong> par rapport à l'autre option.
              {!pfuBetter && (
                <> N'oubliez pas de cocher la case <strong>2OP</strong> sur votre déclaration.</>
              )}
            </p>
            {!pfuBetter && baremeResult.capitalGainTax.deductibleCSG > 0 && (
              <p className="text-sm text-green-700 mt-1">
                Le barème permet aussi une CSG déductible de {formatEUR(baremeResult.capitalGainTax.deductibleCSG + baremeResult.acquisitionGainTax.deductibleCSG)} l'année suivante.
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
});

function ComparisonColumn({
  title,
  result,
  isRecommended,
}: {
  title: string;
  result: TaxSimulationResult;
  isRecommended: boolean;
}) {
  return (
    <div className={`p-4 rounded-lg border-2 ${isRecommended ? 'border-green-400 bg-green-50' : 'border-gray-200'}`}>
      <div className="flex items-center justify-between mb-4">
        <h4 className="font-semibold">{title}</h4>
        {isRecommended && (
          <Badge variant="success">Recommandé</Badge>
        )}
      </div>
      <div className="space-y-2 text-sm">
        <Row label="IR gain d'acquisition" value={result.acquisitionGainTax.irBelow + result.acquisitionGainTax.irAbove} />
        <Row label="PS gain d'acquisition" value={result.acquisitionGainTax.psBelow + result.acquisitionGainTax.psAbove} />
        {result.acquisitionGainTax.salaryContribution > 0 && (
          <Row label="Contribution salariale" value={result.acquisitionGainTax.salaryContribution} />
        )}
        <Row label="IR PV cession" value={result.capitalGainTax.ir} />
        <Row label="PS PV cession" value={result.capitalGainTax.ps} />
        {result.cehr > 0 && <Row label="CEHR" value={result.cehr} />}
        <div className="border-t pt-2 flex justify-between font-bold">
          <span>Total impôts</span>
          <span className="text-red-600">{formatEUR(result.totalTax)}</span>
        </div>
        <div className="flex justify-between font-bold text-green-700">
          <span>Montant net</span>
          <span>{formatEUR(result.netAmount)}</span>
        </div>
        <div className="flex justify-between text-gray-500">
          <span>Taux effectif</span>
          <span>{formatPercent(result.effectiveTaxRate)}</span>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between">
      <span className="text-gray-600">{label}</span>
      <span>{formatEUR(value)}</span>
    </div>
  );
}
