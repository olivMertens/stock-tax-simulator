import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Alert } from './ui/alert';
import { Tooltip } from './ui/tooltip';
import { Select } from './ui/select';
import { BarChart3, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend } from 'recharts';
import type { StockLot, StockOrigin } from '../lib/types';
import { formatEUR, formatUSD, formatDate, originLabel, planTypeLabel } from '../lib/utils';
import { safeSetItem } from '../lib/storage';

interface PortfolioProps {
  lots: StockLot[];
  onLotsChange: (lots: StockLot[]) => void;
}

export function Portfolio({ lots, onLotsChange }: PortfolioProps) {
  const [filterOrigin, setFilterOrigin] = React.useState<StockOrigin | 'all'>('all');
  const [filterHolding, setFilterHolding] = React.useState<'all' | 'Short' | 'Long'>('all');
  const [sortBy, setSortBy] = React.useState<'date' | 'type' | 'gain'>('date');

  const filteredLots = React.useMemo(() => {
    let result = [...lots];
    if (filterOrigin !== 'all') result = result.filter((l) => l.origin === filterOrigin);
    if (filterHolding !== 'all') result = result.filter((l) => l.holdingPeriod === filterHolding);

    result.sort((a, b) => {
      if (sortBy === 'date') return a.acquisitionDate.getTime() - b.acquisitionDate.getTime();
      if (sortBy === 'type') return a.origin.localeCompare(b.origin);
      return b.unrealizedGainLoss - a.unrealizedGainLoss;
    });

    return result;
  }, [lots, filterOrigin, filterHolding, sortBy]);

  const totalQuantity = lots.reduce((sum, l) => sum + l.quantity, 0);
  const totalValue = lots.reduce((sum, l) => sum + l.currentValue, 0);
  const totalGainLoss = lots.reduce((sum, l) => sum + l.unrealizedGainLoss, 0);

  const byOrigin = lots.reduce<Record<string, number>>((acc, l) => {
    acc[l.origin] = (acc[l.origin] || 0) + l.currentValue;
    return acc;
  }, {});

  const pieData = Object.entries(byOrigin).map(([origin, value]) => ({
    name: originLabel(origin),
    value: Math.round(value * 100) / 100,
  }));

  const COLORS = ['var(--color-primary)', '#50E6FF', '#FFB900', '#E74856'];

  const handlePlanTypeChange = (lotId: string, planType: string) => {
    const updated = lots.map((l) => {
      if (l.id === lotId && l.origin === 'DO') {
        const newLot = { ...l, planType: planType as StockLot['planType'] };
        // Persist in localStorage
        const overrides = JSON.parse(localStorage.getItem('planTypeOverrides') || '{}');
        overrides[lotId] = planType;
        safeSetItem('planTypeOverrides', JSON.stringify(overrides));
        return newLot;
      }
      return l;
    });
    onLotsChange(updated);
  };

  const hasDOLots = lots.some((l) => l.origin === 'DO');
  const hasUsdImport = lots.some((l) => l.importCurrency === 'USD');

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-gray-500">Actions totales</p>
            <p className="text-2xl font-bold">{totalQuantity.toLocaleString('fr-FR', { maximumFractionDigits: 4 })}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-gray-500">Valeur totale</p>
            <p className="text-2xl font-bold">{formatEUR(totalValue)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-gray-500">PV/MV latente</p>
            <p className={`text-2xl font-bold ${totalGainLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {totalGainLoss >= 0 ? '+' : ''}{formatEUR(totalGainLoss)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-gray-500">Nombre de lots</p>
            <p className="text-2xl font-bold">{lots.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Pie chart */}
      {pieData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Répartition par type
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, percent }: { name?: string; percent?: number }) => `${name ?? ''} (${((percent ?? 0) * 100).toFixed(0)}%)`}>
                    {pieData.map((_, index) => (
                      <Cell key={index} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* DO lots info */}
      {hasDOLots && (
        <Alert>
          Les lots <strong>DO</strong> n'indiquent pas le régime fiscal. Les lots <strong>FM</strong> et <strong>FQ</strong> sont automatiquement qualifiés.
          Vérifiez le régime de vos lots DO auprès de votre RH. Vous pouvez modifier le régime lot par lot ci-dessous.
        </Alert>
      )}

      {/* Origin codes legend */}
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-gray-500">
        <span><Badge variant="default">SP</Badge> ESPP — Employee Stock Purchase Plan</span>
        <span><Badge variant="default">DO</Badge> Stock Award — RSU / Discretionary Award</span>
        <span><Badge variant="default">FM</Badge> AGA Macron — Attribution gratuite qualifiée (post-2018)</span>
        <span><Badge variant="default">FQ</Badge> AGA pré-Macron — Attribution gratuite qualifiée (pré-2018)</span>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Select value={filterOrigin} onChange={(e) => setFilterOrigin(e.target.value as StockOrigin | 'all')} className="w-40">
          <option value="all">Tous types</option>
          <option value="SP">ESPP (SP)</option>
          <option value="DO">Stock Award (DO)</option>
          <option value="FM">AGA Macron (FM)</option>
          <option value="FQ">AGA pré-Macron (FQ)</option>
        </Select>
        <Select value={filterHolding} onChange={(e) => setFilterHolding(e.target.value as 'all' | 'Short' | 'Long')} className="w-40">
          <option value="all">Toute période</option>
          <option value="Short">Court terme</option>
          <option value="Long">Long terme</option>
        </Select>
        <Select value={sortBy} onChange={(e) => setSortBy(e.target.value as 'date' | 'type' | 'gain')} className="w-40">
          <option value="date">Tri par date</option>
          <option value="type">Tri par type</option>
          <option value="gain">Tri par gain</option>
        </Select>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="text-left p-3 font-medium">Date acq.</th>
                  <th className="text-right p-3 font-medium">Quantité</th>
                  <th className="text-right p-3 font-medium">Prix/action</th>
                  {hasUsdImport && (
                    <>
                      <th className="text-right p-3 font-medium">Prix USD</th>
                      <th className="text-right p-3 font-medium">Taux BCE</th>
                    </>
                  )}
                  <th className="text-right p-3 font-medium">Valeur</th>
                  <th className="text-right p-3 font-medium">PV/MV</th>
                  <th className="text-center p-3 font-medium">Origine</th>
                  <th className="text-center p-3 font-medium">
                    Statut fiscal
                    <Tooltip content="Le régime fiscal détermine le traitement de votre gain d'acquisition. Les lots FM/FQ sont automatiquement qualifiés." />
                  </th>
                  <th className="text-center p-3 font-medium">Période</th>
                  <th className="text-left p-3 font-medium">Dispo. vente</th>
                </tr>
              </thead>
              <tbody>
                {filteredLots.map((lot) => {
                  const notYetAvailable = lot.availableForSaleDate && lot.availableForSaleDate > new Date();
                  return (
                    <tr key={lot.id} className="border-b hover:bg-gray-50">
                      <td className="p-3">{formatDate(lot.acquisitionDate)}</td>
                      <td className="p-3 text-right">{lot.quantity.toLocaleString('fr-FR', { maximumFractionDigits: 4 })}</td>
                      <td className="p-3 text-right">{formatEUR(lot.costBasisPerShare)}</td>
                      {hasUsdImport && (
                        <>
                          <td className="p-3 text-right text-gray-500">
                            {lot.costBasisPerShareUsd ? formatUSD(lot.costBasisPerShareUsd) : '—'}
                          </td>
                          <td className="p-3 text-right text-gray-500 font-mono text-xs">
                            {lot.eurUsdRate ? lot.eurUsdRate.toFixed(4) : '—'}
                          </td>
                        </>
                      )}
                      <td className="p-3 text-right">{formatEUR(lot.currentValue)}</td>
                      <td className={`p-3 text-right ${lot.unrealizedGainLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        <span className="inline-flex items-center gap-1">
                          {lot.unrealizedGainLoss >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                          {formatEUR(Math.abs(lot.unrealizedGainLoss))}
                        </span>
                      </td>
                      <td className="p-3 text-center">
                        <Badge variant={lot.origin === 'SP' ? 'secondary' : lot.origin === 'FM' ? 'success' : 'default'}>
                          {originLabel(lot.origin)}
                        </Badge>
                      </td>
                      <td className="p-3 text-center">
                        {lot.origin === 'DO' ? (
                          <Select
                            value={lot.planType}
                            onChange={(e) => handlePlanTypeChange(lot.id, e.target.value)}
                            className="w-44 text-xs h-8"
                          >
                            <option value="qualified_macron">Qualifié (Macron)</option>
                            <option value="non_qualified">Non qualifié</option>
                          </Select>
                        ) : (
                          <span className="text-xs">{planTypeLabel(lot.planType)}</span>
                        )}
                      </td>
                      <td className="p-3 text-center">
                        <Badge variant={lot.holdingPeriod === 'Long' ? 'success' : 'outline'}>
                          {lot.holdingPeriod === 'Long' ? '≥ 2 ans' : '< 2 ans'}
                        </Badge>
                      </td>
                      <td className="p-3">
                        {notYetAvailable ? (
                          <span className="text-amber-600 text-xs font-medium">
                            ⚠️ {formatDate(lot.availableForSaleDate)}
                          </span>
                        ) : (
                          <span className="text-green-600 text-xs">Disponible</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
