import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Alert } from './ui/alert';
import { Badge } from './ui/badge';
import { Select } from './ui/select';
import { ShoppingCart, ArrowUpRight, ArrowDownRight, Calendar } from 'lucide-react';
import type { SoldLot, StockOrigin, PlanType } from '../lib/types';
import { formatEUR, formatUSD, formatDate } from '../lib/utils';

interface SoldLotsTableProps {
  soldLots: SoldLot[];
  onSoldLotsChange: (lots: SoldLot[]) => void;
  defaultPlanType: string;
  saleYear: number | null;
  onSaleYearChange: (year: number) => void;
}

export function SoldLotsTable({ soldLots, onSoldLotsChange, defaultPlanType, saleYear, onSaleYearChange }: SoldLotsTableProps) {
  // Compute available years
  const saleYears = [...new Set(soldLots.map((l) => l.saleDate.getFullYear()))].sort((a, b) => b - a);
  const hasMultipleYears = saleYears.length > 1;

  // Filter lots by selected year
  const filteredLots = saleYear != null
    ? soldLots.filter((l) => l.saleDate.getFullYear() === saleYear)
    : soldLots;
  const hiddenCount = soldLots.length - filteredLots.length;

  const totalProceeds = filteredLots.reduce((sum, l) => sum + l.proceeds, 0);
  const totalCostBasis = filteredLots.reduce((sum, l) => sum + l.costBasis, 0);
  const totalGainLoss = filteredLots.reduce((sum, l) => sum + l.gainLoss, 0);
  const totalQuantity = filteredLots.reduce((sum, l) => sum + l.quantity, 0);
  const hasUsd = filteredLots.some((l) => l.importCurrency === 'USD');

  const handleOriginChange = (lotId: string, origin: StockOrigin) => {
    const planMap: Record<StockOrigin, PlanType> = {
      FM: 'qualified_macron',
      FQ: 'qualified_pre_macron',
      SP: 'non_qualified',
      DO: defaultPlanType === 'non_qualified' ? 'non_qualified' : 'qualified_macron',
    };
    onSoldLotsChange(
      soldLots.map((l) =>
        l.id === lotId ? { ...l, origin, planType: planMap[origin] } : l
      )
    );
  };

  const handlePlanTypeChange = (lotId: string, planType: PlanType) => {
    onSoldLotsChange(
      soldLots.map((l) => (l.id === lotId ? { ...l, planType } : l))
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShoppingCart className="h-5 w-5" />
          Ventes effectuées ({filteredLots.length} lot{filteredLots.length > 1 ? 's' : ''})
          {hasMultipleYears && (
            <span className="ml-auto flex items-center gap-2 text-sm font-normal">
              <Calendar className="h-4 w-4 text-gray-400" />
              <Select
                value={String(saleYear ?? '')}
                onChange={(e) => onSaleYearChange(Number(e.target.value))}
              >
                {saleYears.map((y) => (
                  <option key={y} value={y}>Cessions {y}</option>
                ))}
              </Select>
            </span>
          )}
          {!hasMultipleYears && saleYear != null && (
            <Badge variant="outline" className="ml-auto font-normal">Cessions {saleYear}</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-xs text-gray-500">Actions vendues</p>
            <p className="text-lg font-bold">
              {totalQuantity.toLocaleString('fr-FR', { maximumFractionDigits: 4 })}
            </p>
          </div>
          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-xs text-gray-500">Produit de cession</p>
            <p className="text-lg font-bold">{formatEUR(totalProceeds)}</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-xs text-gray-500">Prix de revient total</p>
            <p className="text-lg font-bold">{formatEUR(totalCostBasis)}</p>
          </div>
          <div className={`rounded-lg p-3 ${totalGainLoss >= 0 ? 'bg-green-50' : 'bg-red-50'}`}>
            <p className="text-xs text-gray-500">Plus/Moins-value brute</p>
            <p className={`text-lg font-bold flex items-center gap-1 ${totalGainLoss >= 0 ? 'text-green-700' : 'text-red-700'}`}>
              {totalGainLoss >= 0 ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
              {formatEUR(totalGainLoss)}
            </p>
          </div>
        </div>

        <div className="mb-4">
          <Alert>
            L'export Fidelity des ventes effectuées ne contient pas l'origine des actions. Vérifiez et corrigez le <strong>type</strong> (ESPP, Stock Award, AGA…) et le <strong>régime fiscal</strong> de chaque lot ci-dessous.
          </Alert>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-gray-500">
                <th className="pb-2 pr-3 font-medium">Acquisition</th>
                <th className="pb-2 pr-3 font-medium">Vente</th>
                <th className="pb-2 pr-3 font-medium text-right">Qté</th>
                <th className="pb-2 pr-3 font-medium text-right">Produits</th>
                <th className="pb-2 pr-3 font-medium text-right">Coût</th>
                <th className="pb-2 pr-3 font-medium text-right">+/- value</th>
                <th className="pb-2 pr-3 font-medium">Origine</th>
                <th className="pb-2 font-medium">Plan</th>
              </tr>
            </thead>
            <tbody>
              {filteredLots.map((lot) => (
                <tr key={lot.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-2 pr-3">{formatDate(lot.acquisitionDate)}</td>
                  <td className="py-2 pr-3">{formatDate(lot.saleDate)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">
                    {lot.quantity.toLocaleString('fr-FR', { maximumFractionDigits: 4 })}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">
                    {formatEUR(lot.proceeds)}
                    {hasUsd && lot.proceedsUsd != null && (
                      <span className="block text-xs text-gray-400">{formatUSD(lot.proceedsUsd)}</span>
                    )}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">
                    {formatEUR(lot.costBasis)}
                    {hasUsd && lot.costBasisUsd != null && (
                      <span className="block text-xs text-gray-400">{formatUSD(lot.costBasisUsd)}</span>
                    )}
                  </td>
                  <td className={`py-2 pr-3 text-right tabular-nums font-medium ${lot.gainLoss >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                    {formatEUR(lot.gainLoss)}
                  </td>
                  <td className="py-2 pr-3">
                    <Select
                      value={lot.origin}
                      onChange={(e) => handleOriginChange(lot.id, e.target.value as StockOrigin)}
                    >
                      <option value="DO">Stock Award</option>
                      <option value="FM">AGA Macron</option>
                      <option value="FQ">AGA pré-Macron</option>
                      <option value="SP">ESPP</option>
                    </Select>
                  </td>
                  <td className="py-2">
                    {lot.origin === 'SP' ? (
                      <Badge variant="outline">ESPP</Badge>
                    ) : (
                      <Select
                        value={lot.planType}
                        onChange={(e) => handlePlanTypeChange(lot.id, e.target.value as PlanType)}
                      >
                        <option value="qualified_macron">Qualifié (Macron)</option>
                        <option value="qualified_pre_macron">Qualifié (pré-Macron)</option>
                        <option value="non_qualified">Non qualifié</option>
                      </Select>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {hiddenCount > 0 && (
          <p className="mt-3 text-xs text-gray-500">
            {hiddenCount} cession{hiddenCount > 1 ? 's' : ''} d'autres années masquée{hiddenCount > 1 ? 's' : ''}
          </p>
        )}

        {hasUsd && (
          <p className="mt-3 text-xs text-gray-500">
            Montants convertis en EUR au taux BCE de la date de vente.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
