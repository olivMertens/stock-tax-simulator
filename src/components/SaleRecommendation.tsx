import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Alert } from './ui/alert';
import { Tooltip } from './ui/tooltip';
import { Lightbulb, TrendingUp, AlertTriangle, ArrowUpDown, Info } from 'lucide-react';
import type { StockLot, AppSettings } from '../lib/types';
import { rankLotsForSale, type LotRanking } from '../lib/tax-engine';
import { formatEUR, formatPercent, formatDate, originLabel } from '../lib/utils';

interface SaleRecommendationProps {
  lots: StockLot[];
  settings: AppSettings;
}

type SortKey = 'rank' | 'origin' | 'date' | 'rate' | 'net';

function ratingLabel(rate: number): string {
  if (rate < 20) return 'Excellent';
  if (rate < 35) return 'Bon';
  if (rate < 50) return 'Moyen';
  return 'Élevé';
}

function ratingBadgeVariant(rate: number): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (rate < 20) return 'default';
  if (rate < 35) return 'secondary';
  return 'destructive';
}

export function SaleRecommendation({ lots, settings }: SaleRecommendationProps) {
  const [salePrice, setSalePrice] = React.useState<number>(0);
  const [rankings, setRankings] = React.useState<LotRanking[]>([]);
  const [sortKey, setSortKey] = React.useState<SortKey>('rank');
  const [sortAsc, setSortAsc] = React.useState(true);
  const [computed, setComputed] = React.useState(false);

  const compute = () => {
    if (salePrice <= 0) return;
    const ranked = rankLotsForSale(
      lots,
      salePrice,
      settings.otherTaxableIncome,
      settings.taxShares,
      settings.familyStatus,
      settings.priorLosses,
      settings.fiscalYear
    );
    setRankings(ranked);
    setComputed(true);
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(true);
    }
  };

  const sorted = React.useMemo(() => {
    if (!rankings.length) return [];
    const arr = [...rankings];
    const dir = sortAsc ? 1 : -1;
    switch (sortKey) {
      case 'rank':
        arr.sort((a, b) => dir * (a.bestRate - b.bestRate));
        break;
      case 'origin':
        arr.sort((a, b) => dir * originLabel(a.lot.origin).localeCompare(originLabel(b.lot.origin)));
        break;
      case 'date':
        arr.sort((a, b) => dir * (a.lot.acquisitionDate.getTime() - b.lot.acquisitionDate.getTime()));
        break;
      case 'rate':
        arr.sort((a, b) => dir * (a.bestRate - b.bestRate));
        break;
      case 'net':
        arr.sort((a, b) => dir * (a.netAmountBest - b.netAmountBest));
        break;
    }
    return arr;
  }, [rankings, sortKey, sortAsc]);

  // Summary stats
  const bestLot = rankings[0];
  const worstLot = rankings[rankings.length - 1];
  const avgRate = rankings.length
    ? rankings.reduce((s, r) => s + r.bestRate, 0) / rankings.length
    : 0;
  const lotsWithWarnings = rankings.filter((r) => r.warnings.length > 0).length;

  const SortButton = ({ columnKey, label }: { columnKey: SortKey; label: string }) => (
    <button
      onClick={() => handleSort(columnKey)}
      className="flex items-center gap-1 font-medium text-left hover:text-blue-600"
    >
      {label}
      <ArrowUpDown className={`h-3 w-3 ${sortKey === columnKey ? 'text-blue-600' : 'text-gray-400'}`} />
    </button>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Lightbulb className="h-5 w-5 text-amber-500" />
          Recommandation de vente
        </CardTitle>
        <CardDescription>
          Classement des lots par efficacité fiscale. Chaque lot est simulé individuellement avec vos paramètres fiscaux
          pour calculer le taux effectif d'imposition réel.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Price input */}
        <div className="flex items-end gap-3">
          <div className="flex-1 max-w-xs">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Prix de vente estimé par action (€)
            </label>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={salePrice || ''}
              onChange={(e) => setSalePrice(parseFloat(e.target.value) || 0)}
              placeholder="ex: 450.00"
            />
          </div>
          <Button onClick={compute} disabled={salePrice <= 0} className="gap-1.5">
            <TrendingUp className="h-4 w-4" />
            Analyser
          </Button>
        </div>

        {computed && rankings.length > 0 && (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center">
                <div className="text-xs text-green-600 mb-1">Meilleur taux</div>
                <div className="text-lg font-bold text-green-800">
                  {formatPercent(bestLot.bestRate)}
                </div>
                <div className="text-xs text-green-600 truncate">
                  {originLabel(bestLot.lot.origin)}
                </div>
              </div>
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-center">
                <div className="text-xs text-red-600 mb-1">Pire taux</div>
                <div className="text-lg font-bold text-red-800">
                  {formatPercent(worstLot.bestRate)}
                </div>
                <div className="text-xs text-red-600 truncate">
                  {originLabel(worstLot.lot.origin)}
                </div>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-center">
                <div className="text-xs text-blue-600 mb-1">Taux moyen</div>
                <div className="text-lg font-bold text-blue-800">
                  {formatPercent(avgRate)}
                </div>
                <div className="text-xs text-blue-600">
                  {rankings.length} lot{rankings.length > 1 ? 's' : ''}
                </div>
              </div>
              <div className={`border rounded-lg p-3 text-center ${lotsWithWarnings > 0 ? 'bg-amber-50 border-amber-200' : 'bg-gray-50 border-gray-200'}`}>
                <div className={`text-xs mb-1 ${lotsWithWarnings > 0 ? 'text-amber-600' : 'text-gray-600'}`}>Alertes</div>
                <div className={`text-lg font-bold ${lotsWithWarnings > 0 ? 'text-amber-800' : 'text-gray-800'}`}>
                  {lotsWithWarnings}
                </div>
                <div className={`text-xs ${lotsWithWarnings > 0 ? 'text-amber-600' : 'text-gray-600'}`}>
                  lot{lotsWithWarnings !== 1 ? 's' : ''} avec alerte
                </div>
              </div>
            </div>

            {/* Ranking table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-gray-600">
                    <th className="py-2 pr-2 text-left w-8">#</th>
                    <th className="py-2 px-2 text-left">
                      <SortButton columnKey="origin" label="Lot" />
                    </th>
                    <th className="py-2 px-2 text-left">
                      <SortButton columnKey="date" label="Acquisition" />
                    </th>
                    <th className="py-2 px-2 text-right">Qté</th>
                    <th className="py-2 px-2 text-right">Produit brut</th>
                    <th className="py-2 px-2 text-right">
                      <SortButton columnKey="rate" label="Taux effectif" />
                    </th>
                    <th className="py-2 px-2 text-right">Régime optimal</th>
                    <th className="py-2 px-2 text-right">
                      <SortButton columnKey="net" label="Net estimé" />
                    </th>
                    <th className="py-2 px-2 text-center">Note</th>
                    <th className="py-2 pl-2 text-left">Alertes</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((r, i) => {
                    const rank = sortKey === 'rank' ? i + 1 : rankings.indexOf(r) + 1;
                    return (
                      <tr key={r.lot.id} className="border-b hover:bg-gray-50">
                        <td className="py-2.5 pr-2 text-gray-400 font-mono">{rank}</td>
                        <td className="py-2.5 px-2">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs">
                              {originLabel(r.lot.origin)}
                            </Badge>
                            {r.lot.holdingPeriod === 'Long' && (
                              <span className="text-xs text-green-600 font-medium">Long</span>
                            )}
                          </div>
                        </td>
                        <td className="py-2.5 px-2 text-gray-600">{formatDate(r.lot.acquisitionDate)}</td>
                        <td className="py-2.5 px-2 text-right font-mono">{r.lot.quantity}</td>
                        <td className="py-2.5 px-2 text-right">{formatEUR(r.proceeds)}</td>
                        <td className="py-2.5 px-2 text-right">
                          <Tooltip content={`PFU: ${formatPercent(r.effectiveTaxRatePfu)} | Barème: ${formatPercent(r.effectiveTaxRateBareme)}`}>
                            <span className="font-semibold cursor-help">
                              {formatPercent(r.bestRate)}
                            </span>
                          </Tooltip>
                        </td>
                        <td className="py-2.5 px-2 text-right">
                          <Badge variant={r.bestMode === 'pfu' ? 'outline' : 'secondary'} className="text-xs">
                            {r.bestMode === 'pfu' ? 'PFU' : 'Barème'}
                          </Badge>
                        </td>
                        <td className="py-2.5 px-2 text-right font-semibold">{formatEUR(r.netAmountBest)}</td>
                        <td className="py-2.5 px-2 text-center">
                          <Badge variant={ratingBadgeVariant(r.bestRate)} className="text-xs">
                            {ratingLabel(r.bestRate)}
                          </Badge>
                        </td>
                        <td className="py-2.5 pl-2">
                          {r.warnings.length > 0 && (
                            <Tooltip content={r.warnings.join(' • ')}>
                              <span className="flex items-center gap-1 text-amber-600 cursor-help">
                                <AlertTriangle className="h-3.5 w-3.5" />
                                <span className="text-xs">{r.warnings.length}</span>
                              </span>
                            </Tooltip>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Legend & tips */}
            <div className="flex items-start gap-2 text-xs text-gray-500 bg-gray-50 rounded-lg p-3">
              <Info className="h-4 w-4 mt-0.5 shrink-0" />
              <div className="space-y-1">
                <p>
                  <strong>Taux effectif</strong> = impôt total / produit brut. Survolez pour voir PFU vs Barème.
                  Le classement simule chaque lot individuellement avec vos paramètres fiscaux (revenus, parts, pertes antérieures).
                </p>
                <p>
                  <strong>Conseil :</strong> Vendez en priorité les lots verts (ESPP, DO non-qualifié) et étalez les AGA qualifiées
                  sur plusieurs années pour rester sous le seuil de 300 000 € de gain d'acquisition.
                </p>
              </div>
            </div>
          </>
        )}

        {computed && rankings.length === 0 && (
          <Alert>Aucun lot à analyser. Vérifiez que le prix de vente est supérieur à 0.</Alert>
        )}
      </CardContent>
    </Card>
  );
}
