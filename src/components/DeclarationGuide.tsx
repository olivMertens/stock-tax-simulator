import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { FileText, Copy, Check } from 'lucide-react';
import type { TaxSimulationResult, SaleLotEntry } from '../lib/types';
import { generateDeclaration, formatDeclarationText } from '../lib/declaration';
import { FORM_2042, FORM_2042C_AGA_MACRON, FORM_2074_CADRE_510 } from '../lib/tax-forms';
import { formatEUR } from '../lib/utils';

interface DeclarationGuideProps {
  result: TaxSimulationResult | null;
  lots: SaleLotEntry[];
  fiscalYear: number;
}

export const DeclarationGuide = React.memo(function DeclarationGuide({ result, lots, fiscalYear }: DeclarationGuideProps) {
  const [copied, setCopied] = React.useState(false);

  if (!result) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-gray-500">
          Lancez une simulation de vente pour obtenir les instructions de déclaration.
        </CardContent>
      </Card>
    );
  }

  const declaration = generateDeclaration(result, lots, fiscalYear);
  const text = formatDeclarationText(declaration);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Instructions de déclaration — Revenus {fiscalYear}
            </span>
            <Button variant="outline" size="sm" onClick={handleCopy} className="gap-1">
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? 'Copié !' : 'Copier'}
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {/* Formulaire 2042 */}
            <div>
              <h4 className="font-semibold text-blue-800 mb-3 text-base">FORMULAIRE 2042 — Déclaration principale</h4>
              <div className="space-y-2">
                {declaration.case3VG > 0 && (
                  <CaseRow code={FORM_2042.case3VG.code} label={FORM_2042.case3VG.label} value={declaration.case3VG} />
                )}
                {declaration.case3VH > 0 && (
                  <CaseRow code={FORM_2042.case3VH.code} label={FORM_2042.case3VH.label} value={declaration.case3VH} variant="warning" />
                )}
                <div className="flex items-center gap-3 p-2 rounded bg-gray-50">
                  <span className="font-mono font-bold text-sm bg-gray-200 px-2 py-1 rounded">{FORM_2042.option2OP.code}</span>
                  <span className="flex-1 text-sm">{FORM_2042.option2OP.label}</span>
                  <span className="font-medium text-sm">
                    {declaration.option2OP ? '☑ Cocher' : '☐ Ne pas cocher'}
                  </span>
                </div>
              </div>
            </div>

            {/* Formulaire 2042-C */}
            {(declaration.case1TZ > 0 || declaration.case1UZ > 0 || declaration.case1TT > 0) && (
              <div>
                <h4 className="font-semibold text-blue-800 mb-3 text-base">FORMULAIRE 2042-C — Déclaration complémentaire</h4>
                <div className="space-y-2">
                  {declaration.case1TZ > 0 && (
                    <CaseRow
                      code={FORM_2042C_AGA_MACRON.case1TZ.code}
                      label={FORM_2042C_AGA_MACRON.case1TZ.label}
                      value={declaration.case1TZ}
                    />
                  )}
                  {declaration.case1UZ > 0 && (
                    <CaseRow
                      code={FORM_2042C_AGA_MACRON.case1UZ.code}
                      label={FORM_2042C_AGA_MACRON.case1UZ.label}
                      value={declaration.case1UZ}
                      variant="success"
                    />
                  )}
                  {declaration.case1TT > 0 && (
                    <CaseRow
                      code={FORM_2042C_AGA_MACRON.case1TT.code}
                      label={FORM_2042C_AGA_MACRON.case1TT.label}
                      value={declaration.case1TT}
                    />
                  )}
                </div>
              </div>
            )}

            {/* Formulaire 2074 */}
            <div>
              <h4 className="font-semibold text-blue-800 mb-3 text-base">FORMULAIRE 2074 — Plus-values mobilières</h4>
              <p className="text-sm text-gray-600 mb-3">
                À remplir avec le détail de chaque opération de cession (les numéros entre parenthèses
                renvoient aux lignes du <strong>cadre 510</strong> du formulaire 2074) :
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="p-2 text-left">
                        Date vente <span className="text-gray-500 font-normal">({FORM_2074_CADRE_510.saleDate.line})</span>
                      </th>
                      <th className="p-2 text-left">
                        Type <span className="text-gray-500 font-normal">({FORM_2074_CADRE_510.designation.line})</span>
                      </th>
                      <th className="p-2 text-right">
                        Nb actions <span className="text-gray-500 font-normal">({FORM_2074_CADRE_510.quantity.line})</span>
                      </th>
                      <th className="p-2 text-right">
                        PU vente <span className="text-gray-500 font-normal">({FORM_2074_CADRE_510.unitSalePrice.line})</span>
                      </th>
                      <th className="p-2 text-right">
                        Montant vente <span className="text-gray-500 font-normal">({FORM_2074_CADRE_510.totalSale.line})</span>
                      </th>
                      <th className="p-2 text-right">
                        PU acquisition <span className="text-gray-500 font-normal">({FORM_2074_CADRE_510.unitAcqPrice.line})</span>
                      </th>
                      <th className="p-2 text-right">
                        Prix revient <span className="text-gray-500 font-normal">({FORM_2074_CADRE_510.costBasis.line})</span>
                      </th>
                      <th className="p-2 text-right">
                        PV/MV <span className="text-gray-500 font-normal">({FORM_2074_CADRE_510.result.line})</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {declaration.form2074Lines.map((line, i) => {
                      const totalSale = line.quantity * line.salePrice;
                      const totalCost = line.quantity * line.costBasis;
                      return (
                        <tr key={i} className="border-b">
                          <td className="p-2">{line.date}</td>
                          <td className="p-2">{line.origin}</td>
                          <td className="p-2 text-right">{line.quantity.toLocaleString('fr-FR', { maximumFractionDigits: 4 })}</td>
                          <td className="p-2 text-right">{formatEUR(line.salePrice)}</td>
                          <td className="p-2 text-right">{formatEUR(totalSale)}</td>
                          <td className="p-2 text-right">{formatEUR(line.costBasis)}</td>
                          <td className="p-2 text-right">{formatEUR(totalCost)}</td>
                          <td className={`p-2 text-right font-medium ${line.gainLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {line.gainLoss >= 0 ? '+' : ''}{formatEUR(line.gainLoss)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* PS details */}
            <div>
              <h4 className="font-semibold text-blue-800 mb-3 text-base">PRÉLÈVEMENTS SOCIAUX</h4>
              <div className="space-y-1 text-sm">
                {declaration.psDetails.pvCessionPS > 0 && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">PS sur PV de cession</span>
                    <span className="font-medium">{formatEUR(declaration.psDetails.pvCessionPS)}</span>
                  </div>
                )}
                {declaration.psDetails.acquisitionGainPSBelow > 0 && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">PS sur gain d'acquisition (≤ 300k€)</span>
                    <span className="font-medium">{formatEUR(declaration.psDetails.acquisitionGainPSBelow)}</span>
                  </div>
                )}
                {declaration.psDetails.acquisitionGainPSAbove > 0 && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">PS sur gain d'acquisition ({'>'} 300k€)</span>
                    <span className="font-medium">{formatEUR(declaration.psDetails.acquisitionGainPSAbove)}</span>
                  </div>
                )}
                <div className="flex justify-between border-t pt-1 font-bold">
                  <span>Total PS</span>
                  <span>{formatEUR(declaration.psDetails.total)}</span>
                </div>
              </div>
            </div>

            {/* Reminders */}
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
              <h4 className="font-semibold text-amber-800 mb-2">💡 Rappels</h4>
              <ul className="text-sm text-amber-700 space-y-1 list-disc list-inside">
                <li>Le gain d'acquisition n'est imposé que l'année de la <strong>VENTE</strong> des actions, pas au vesting.</li>
                {declaration.deductibleCSGNextYear > 0 && (
                  <li>
                    La CSG déductible de <strong>{formatEUR(declaration.deductibleCSGNextYear)}</strong> sera à déduire sur la déclaration de l'année suivante.
                  </li>
                )}
                {declaration.case3SG > 0 && (
                  <li>
                    Abattement durée de détention de <strong>{formatEUR(declaration.case3SG)}</strong> appliqué (titres acquis avant le 01/01/2018, option barème).
                    Compléter l'annexe <strong>2074-ABT</strong> « Fiche de calcul de l'abattement pour durée de détention » et reporter le montant en case 3SG.
                  </li>
                )}
                {declaration.case3VH > 0 && (
                  <li>
                    La moins-value de <strong>{formatEUR(declaration.case3VH)}</strong> est reportable pendant 10 ans.
                    À inscrire également au <strong>cadre 12 de la 2074</strong> « Suivi de vos moins-values antérieures reportables sur 10 ans », ligne {declaration.fiscalYear}.
                  </li>
                )}
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
});

function CaseRow({
  code,
  label,
  value,
  variant = 'default',
}: {
  code: string;
  label: string;
  value: number;
  variant?: 'default' | 'success' | 'warning';
}) {
  const colors = {
    default: 'bg-gray-50',
    success: 'bg-green-50',
    warning: 'bg-amber-50',
  };
  return (
    <div className={`flex items-center gap-3 p-2 rounded ${colors[variant]}`}>
      <span className="font-mono font-bold text-sm bg-gray-200 px-2 py-1 rounded">{code}</span>
      <span className="flex-1 text-sm">{label}</span>
      <span className="font-bold">{formatEUR(value)}</span>
    </div>
  );
}
