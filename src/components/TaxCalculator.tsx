import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Tooltip } from './ui/tooltip';
import { Receipt, TrendingUp, TrendingDown, AlertTriangle } from 'lucide-react';
import type { TaxSimulationResult, TaxMode, FamilyStatus } from '../lib/types';
import { getTaxConfig } from '../lib/tax-rates';
import { analyzeThresholds } from '../lib/thresholds';
import { formatEUR, formatPercent } from '../lib/utils';

interface TaxCalculatorProps {
  result: TaxSimulationResult | null;
  taxMode: TaxMode;
  onTaxModeChange: (mode: TaxMode) => void;
  fiscalYear: number;
  familyStatus?: FamilyStatus;
  /**
   * When true, indicates the underlying lot selection has changed since this
   * result was computed; renders a discreet badge prompting the user to
   * re-run the simulation.
   */
  stale?: boolean;
}

export const TaxCalculator = React.memo(function TaxCalculator({ result, taxMode, onTaxModeChange, fiscalYear, familyStatus = 'single', stale = false }: TaxCalculatorProps) {
  const cfg = React.useMemo(() => getTaxConfig(fiscalYear), [fiscalYear]);
  const thresholds = React.useMemo(
    () => (result ? analyzeThresholds(result, fiscalYear, familyStatus) : null),
    [result, fiscalYear, familyStatus]
  );

  if (!result) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-gray-500">
          Lancez une simulation de vente pour voir les résultats fiscaux.
        </CardContent>
      </Card>
    );
  }

  const r = result;

  const fmtRate = (r: number) => `${(r * 100).toFixed(1).replace('.', ',')}%`;
  const psRate = fmtRate(cfg.psPatrimoine);
  const psActiviteRate = fmtRate(cfg.psActivite);
  const pfuIrRate = fmtRate(cfg.pfuIrRate);
  const pfuTotalRate = fmtRate(cfg.pfuTotalRate);
  const salaryRate = fmtRate(cfg.salaryContributionRate);

  // UX: surface the 300k€ AGA threshold overrun prominently — the tax regime
  // changes drastically above this limit (no 50% abatement, +10% salary contrib).
  // Detection delegated to analyzeThresholds() for a single source of truth.
  const { exceedsAgaThreshold, amountAboveAgaThreshold, cehrTriggered, cehrEntryThreshold, cehrCoupleEntryThreshold, agaThreshold } = thresholds!;

  return (
    <div className="space-y-6">
      {stale && (
        <div
          className="flex items-center gap-2 px-3 py-2 rounded-md border border-amber-200 bg-amber-50 text-amber-800 text-xs"
          role="status"
        >
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span>Sélection modifiée — relancez la simulation pour mettre à jour le résultat.</span>
        </div>
      )}
      {/* Live region announces major threshold changes to screen readers. */}
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        Simulation mise à jour — montant net {formatEUR(r.netAmount)}, impôt total {formatEUR(r.totalTax)}.
      </div>
      {exceedsAgaThreshold && (
        <div
          className="flex items-start gap-3 p-4 rounded-lg border-2 border-amber-300 bg-amber-50 text-amber-900"
          role="alert"
        >
          <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" aria-hidden="true" />
          <div className="text-sm">
            <p className="font-semibold">
              Seuil de {formatEUR(agaThreshold)} dépassé — fraction soumise à {formatEUR(amountAboveAgaThreshold)}
            </p>
            <p className="mt-1">
              Au-delà de {formatEUR(agaThreshold)} de gain d'acquisition AGA, vous perdez l'abattement de 50 %,
              les prélèvements sociaux passent à {psActiviteRate} (régime salarial) et une
              contribution salariale de {salaryRate} s'applique. Envisagez d'étaler les ventes sur plusieurs années.
            </p>
          </div>
        </div>
      )}
      {cehrTriggered && (
        <div
          className="flex items-start gap-3 p-4 rounded-lg border-2 border-orange-300 bg-orange-50 text-orange-900"
          role="alert"
        >
          <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" aria-hidden="true" />
          <div className="text-sm">
            <p className="font-semibold">
              Contribution exceptionnelle hauts revenus (CEHR) déclenchée : {formatEUR(r.cehr)}
            </p>
            <p className="mt-1">
              Votre revenu fiscal de référence dépasse {formatEUR(cehrEntryThreshold)} (célibataire) ou {formatEUR(cehrCoupleEntryThreshold)} (couple).
              La CEHR s'ajoute à vos impôts (3 % ou 4 % selon les tranches).
            </p>
          </div>
        </div>
      )}

      {/* Tax mode toggle */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium text-gray-700">Régime fiscal :</span>
            <div className="flex gap-2">
              <Button
                variant={taxMode === 'pfu' ? 'default' : 'outline'}
                size="sm"
                onClick={() => onTaxModeChange('pfu')}
              >
                PFU (Flat Tax {pfuTotalRate})
              </Button>
              <Button
                variant={taxMode === 'bareme' ? 'default' : 'outline'}
                size="sm"
                onClick={() => onTaxModeChange('bareme')}
              >
                Barème progressif
              </Button>
            </div>
            <Tooltip content={`Le PFU applique un taux forfaitaire de ${pfuTotalRate} (${pfuIrRate} IR + ${psRate} PS) sur les plus-values de cession. Le barème progressif utilise les tranches de l'IR. ATTENTION : le gain d'acquisition AGA est toujours au barème progressif, quel que soit le choix.`} />
          </div>
        </CardContent>
      </Card>

      {/* Key figures */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-sm text-gray-500">Produit brut</p>
            <p className="text-2xl font-bold">{formatEUR(r.totalProceeds)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-sm text-gray-500">Total impôts</p>
            <p className="text-2xl font-bold text-red-600">{formatEUR(r.totalTax)}</p>
            <p className="text-xs text-gray-400">Taux effectif : {formatPercent(r.effectiveTaxRate)}</p>
          </CardContent>
        </Card>
        <Card className="border-green-200 bg-green-50">
          <CardContent className="p-4 text-center">
            <p className="text-sm text-gray-500">Montant net estimé</p>
            <p className="text-2xl font-bold text-green-700">{formatEUR(r.netAmount)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Detailed breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5" />
            Détail du calcul fiscal
          </CardTitle>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <tbody>
              {/* Produit brut */}
              <tr className="border-b">
                <td className="py-2 font-medium">Produit brut de la vente</td>
                <td className="py-2 text-right font-bold">{formatEUR(r.totalProceeds)}</td>
              </tr>

              {/* Gain d'acquisition */}
              {r.totalAcquisitionGain > 0 && (
                <>
                  <tr className="border-b bg-blue-50">
                    <td className="py-2 font-medium flex items-center gap-1">
                      Gain d'acquisition (AGA)
                      <Tooltip content="Le gain d'acquisition des AGA est TOUJOURS imposé au barème progressif, même avec le PFU." />
                    </td>
                    <td className="py-2 text-right font-bold">{formatEUR(r.totalAcquisitionGain)}</td>
                  </tr>
                  <tr className="border-b bg-gray-50 text-xs text-gray-600">
                    <td colSpan={2} className="py-1 pl-6">
                      📋 <strong>Reportable sur</strong>: Form 2042, Cases <strong>1AJ</strong> ou <strong>1BJ</strong> (impôt) + <strong>8HV</strong>/<strong>8IV</strong> (retenue à source)
                    </td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-2 pl-6 text-gray-600">Fraction ≤ {formatEUR(agaThreshold)}</td>
                    <td className="py-2 text-right">{formatEUR(r.acquisitionGainTax.below300k)}</td>
                  </tr>
                  {r.acquisitionGainTax.above300k > 0 && (
                    <tr className="border-b">
                      <td className="py-2 pl-6 text-gray-600">Fraction {'>'} {formatEUR(agaThreshold)}</td>
                      <td className="py-2 text-right">{formatEUR(r.acquisitionGainTax.above300k)}</td>
                    </tr>
                  )}
                  <tr className="border-b">
                    <td className="py-2 pl-6 text-gray-600">Abattement 50% (≤ 300k€)</td>
                    <td className="py-2 text-right text-green-600">-{formatEUR(r.acquisitionGainTax.abatement50)}</td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-2 pl-6 text-gray-600">IR sur gain d'acquisition (≤ 300k€)</td>
                    <td className="py-2 text-right text-red-600">{formatEUR(r.acquisitionGainTax.irBelow)}</td>
                  </tr>
                  {r.acquisitionGainTax.irAbove > 0 && (
                    <tr className="border-b">
                      <td className="py-2 pl-6 text-gray-600">IR sur gain d'acquisition ({'>'}300k€)</td>
                      <td className="py-2 text-right text-red-600">{formatEUR(r.acquisitionGainTax.irAbove)}</td>
                    </tr>
                  )}
                  <tr className="border-b">
                    <td className="py-2 pl-6 text-gray-600">PS sur gain d'acquisition (≤ 300k€, {psRate})</td>
                    <td className="py-2 text-right text-red-600">{formatEUR(r.acquisitionGainTax.psBelow)}</td>
                  </tr>
                  {r.acquisitionGainTax.psAbove > 0 && (
                    <tr className="border-b">
                      <td className="py-2 pl-6 text-gray-600">PS sur gain d'acquisition ({'>'}300k€, {psActiviteRate})</td>
                      <td className="py-2 text-right text-red-600">{formatEUR(r.acquisitionGainTax.psAbove)}</td>
                    </tr>
                  )}
                  {r.acquisitionGainTax.salaryContribution > 0 && (
                    <tr className="border-b">
                      <td className="py-2 pl-6 text-gray-600">Contribution salariale {salaryRate}</td>
                      <td className="py-2 text-right text-red-600">{formatEUR(r.acquisitionGainTax.salaryContribution)}</td>
                    </tr>
                  )}
                  <tr className="border-b font-medium">
                    <td className="py-2 pl-6">Sous-total gain d'acquisition</td>
                    <td className="py-2 text-right text-red-600">{formatEUR(r.acquisitionGainTax.total)}</td>
                  </tr>
                </>
              )}

              {/* Plus-value de cession */}
              <tr className="border-b bg-blue-50">
                <td className="py-2 font-medium flex items-center gap-1">
                  Plus-value de cession
                  {r.totalCapitalGain >= 0 ? (
                    <TrendingUp className="h-4 w-4 text-green-600" />
                  ) : (
                    <TrendingDown className="h-4 w-4 text-red-600" />
                  )}
                </td>
                <td className={`py-2 text-right font-bold ${r.totalCapitalGain >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {r.totalCapitalGain >= 0 ? '+' : ''}{formatEUR(r.totalCapitalGain)}
                </td>
              </tr>
              {r.totalCapitalGain > 0 && (
                <tr className="border-b bg-gray-50 text-xs text-gray-600">
                  <td colSpan={2} className="py-1 pl-6">
                    📋 <strong>Reportable sur</strong>: Form 2042, Cases <strong>2042C</strong> ou menu "Gains" du site impots.gouv.fr 
                  </td>
                </tr>
              )}
              {r.capitalGainTax.netLoss > 0 && (
                <tr className="border-b bg-gray-50 text-xs text-gray-600">
                  <td colSpan={2} className="py-1 pl-6">
                    📋 <strong>Moins-value reportable</strong>: Cases <strong>2042C</strong> (reportable 10 ans)
                  </td>
                </tr>
              )}
              {r.capitalGainTax.netGain > 0 && (
                <>
                  <tr className="border-b">
                    <td className="py-2 pl-6 text-gray-600">
                      IR sur PV cession ({taxMode === 'pfu' ? pfuIrRate : 'barème'})
                    </td>
                    <td className="py-2 text-right text-red-600">{formatEUR(r.capitalGainTax.ir)}</td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-2 pl-6 text-gray-600">PS sur PV cession ({psRate})</td>
                    <td className="py-2 text-right text-red-600">{formatEUR(r.capitalGainTax.ps)}</td>
                  </tr>
                  <tr className="border-b font-medium">
                    <td className="py-2 pl-6">Sous-total PV cession</td>
                    <td className="py-2 text-right text-red-600">{formatEUR(r.capitalGainTax.total)}</td>
                  </tr>
                </>
              )}
              {r.capitalGainTax.netLoss > 0 && (
                <tr className="border-b">
                  <td className="py-2 pl-6 text-gray-600">Moins-value reportable (10 ans)</td>
                  <td className="py-2 text-right text-amber-600">{formatEUR(r.capitalGainTax.netLoss)}</td>
                </tr>
              )}

              {/* CEHR */}
              {r.cehr > 0 && (
                <tr className="border-b">
                  <td className="py-2 font-medium">Contribution exceptionnelle hauts revenus (CEHR)</td>
                  <td className="py-2 text-right text-red-600">{formatEUR(r.cehr)}</td>
                </tr>
              )}

              {/* Totals */}
              <tr className="border-b-2 border-gray-300 bg-red-50">
                <td className="py-3 font-bold text-lg">Total impôts et prélèvements</td>
                <td className="py-3 text-right font-bold text-lg text-red-700">{formatEUR(r.totalTax)}</td>
              </tr>
              <tr className="bg-green-50">
                <td className="py-3 font-bold text-lg">Montant net estimé</td>
                <td className="py-3 text-right font-bold text-lg text-green-700">{formatEUR(r.netAmount)}</td>
              </tr>
              <tr>
                <td className="py-2 text-gray-600">Taux effectif d'imposition</td>
                <td className="py-2 text-right font-medium">{formatPercent(r.effectiveTaxRate)}</td>
              </tr>
            </tbody>
          </table>

          {/* CSG déductible reminder */}
          {(r.acquisitionGainTax.deductibleCSG > 0 || r.capitalGainTax.deductibleCSG > 0) && (
            <div className="mt-4 p-3 bg-blue-50 rounded text-sm text-blue-800">
              💡 CSG déductible à reporter l'année suivante :{' '}
              <strong>{formatEUR(r.acquisitionGainTax.deductibleCSG + r.capitalGainTax.deductibleCSG)}</strong>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
});
