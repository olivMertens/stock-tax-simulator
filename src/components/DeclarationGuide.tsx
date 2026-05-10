import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { FileText, Copy, Check } from 'lucide-react';
import type { TaxSimulationResult, SaleLotEntry } from '../lib/types';
import { generateDeclaration, formatDeclarationText } from '../lib/declaration';
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
                  <CaseRow code="3VG" label="Plus-value nette de cession" value={declaration.case3VG} />
                )}
                {declaration.case3VH > 0 && (
                  <CaseRow code="3VH" label="Moins-value nette" value={declaration.case3VH} variant="warning" />
                )}
                <div className="flex items-center gap-3 p-2 rounded bg-gray-50">
                  <span className="font-mono font-bold text-sm bg-gray-200 px-2 py-1 rounded">2OP</span>
                  <span className="flex-1 text-sm">Option barème progressif</span>
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
                      code="1TZ"
                      label="Gain d'acquisition AGA (≤ 300k€, après abattement 50%)"
                      value={declaration.case1TZ}
                    />
                  )}
                  {declaration.case1UZ > 0 && (
                    <CaseRow
                      code="1UZ"
                      label="Abattement 50% appliqué"
                      value={declaration.case1UZ}
                      variant="success"
                    />
                  )}
                  {declaration.case1TT > 0 && (
                    <CaseRow
                      code="1TT"
                      label="Gain d'acquisition AGA (> 300k€)"
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
                        Date vente <span className="text-gray-500 font-normal">(512)</span>
                      </th>
                      <th className="p-2 text-right">
                        Nb actions <span className="text-gray-500 font-normal">(515)</span>
                      </th>
                      <th className="p-2 text-left">
                        Type <span className="text-gray-500 font-normal">(511)</span>
                      </th>
                      <th className="p-2 text-right">
                        Prix vente <span className="text-gray-500 font-normal">(516)</span>
                      </th>
                      <th className="p-2 text-right">
                        Prix revient <span className="text-gray-500 font-normal">(523)</span>
                      </th>
                      <th className="p-2 text-right">
                        PV/MV <span className="text-gray-500 font-normal">(524)</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {declaration.form2074Lines.map((line, i) => (
                      <tr key={i} className="border-b">
                        <td className="p-2">{line.date}</td>
                        <td className="p-2 text-right">{line.quantity.toLocaleString('fr-FR', { maximumFractionDigits: 4 })}</td>
                        <td className="p-2">{line.origin}</td>
                        <td className="p-2 text-right">{formatEUR(line.salePrice)}</td>
                        <td className="p-2 text-right">{formatEUR(line.costBasis)}</td>
                        <td className={`p-2 text-right font-medium ${line.gainLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {line.gainLoss >= 0 ? '+' : ''}{formatEUR(line.gainLoss)}
                        </td>
                      </tr>
                    ))}
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
                {declaration.case3VH > 0 && (
                  <li>La moins-value de <strong>{formatEUR(declaration.case3VH)}</strong> est reportable pendant 10 ans.</li>
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
