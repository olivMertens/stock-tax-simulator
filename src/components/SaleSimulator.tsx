import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Alert } from './ui/alert';
import { Badge } from './ui/badge';
import { Calculator, ShoppingCart, RefreshCw, Filter } from 'lucide-react';
import type { StockLot, SaleLotEntry, AppSettings, StockOrigin } from '../lib/types';
import { formatEUR, formatUSD, formatDate, originLabel } from '../lib/utils';
import { useMsftPrice } from '../hooks/useMsftPrice';

interface SaleSimulatorProps {
  lots: StockLot[];
  settings: AppSettings;
  onSimulate: (entries: SaleLotEntry[]) => void;
}

export const SaleSimulator = React.memo(function SaleSimulator({ lots, onSimulate }: SaleSimulatorProps) {
  const [selectedLots, setSelectedLots] = React.useState<Record<string, { quantity: number; price: number }>>({});
  const [defaultPrice, setDefaultPrice] = React.useState<number>(0);
  const [originFilter, setOriginFilter] = React.useState<StockOrigin | 'all'>('all');

  const {
    usdPrice: livePriceUsd,
    eurPrice: livePriceEur,
    error: priceError,
    loading: fetchingPrice,
    fetchPrice: fetchLiveMsftPrice,
  } = useMsftPrice();

  // Sync EUR price to default price when fetched
  React.useEffect(() => {
    if (livePriceEur !== null) {
      setDefaultPrice(Math.round(livePriceEur * 100) / 100);
    }
  }, [livePriceEur]);

  const toggleLot = (lot: StockLot) => {
    setSelectedLots((prev) => {
      const next = { ...prev };
      if (next[lot.id]) {
        delete next[lot.id];
      } else {
        next[lot.id] = {
          quantity: lot.quantity,
          price: defaultPrice || lot.costBasisPerShare,
        };
      }
      return next;
    });
  };

  const updateQuantity = (lotId: string, quantity: number) => {
    const lot = lots.find((l) => l.id === lotId);
    const clamped = lot ? Math.min(Math.max(0, quantity), lot.quantity) : Math.max(0, quantity);
    setSelectedLots((prev) => ({
      ...prev,
      [lotId]: { ...prev[lotId], quantity: clamped },
    }));
  };

  const updatePrice = (lotId: string, price: number) => {
    setSelectedLots((prev) => ({
      ...prev,
      [lotId]: { ...prev[lotId], price },
    }));
  };

  const applyDefaultPrice = () => {
    if (defaultPrice <= 0) return;
    setSelectedLots((prev) => {
      const next: Record<string, { quantity: number; price: number }> = {};
      for (const [id, entry] of Object.entries(prev)) {
        next[id] = { ...entry, price: defaultPrice };
      }
      return next;
    });
  };

  const availableLots = lots.filter((lot) => !(lot.availableForSaleDate && lot.availableForSaleDate > new Date()));
  const filteredLots = originFilter === 'all' ? availableLots : availableLots.filter((lot) => lot.origin === originFilter);
  const allSelected = filteredLots.length > 0 && filteredLots.every((lot) => !!selectedLots[lot.id]);

  const toggleSelectAll = () => {
    if (allSelected) {
      // Deselect only filtered lots
      setSelectedLots((prev) => {
        const next = { ...prev };
        for (const lot of filteredLots) delete next[lot.id];
        return next;
      });
    } else {
      setSelectedLots((prev) => {
        const next = { ...prev };
        for (const lot of filteredLots) {
          if (!next[lot.id]) {
            next[lot.id] = {
              quantity: lot.quantity,
              price: defaultPrice || lot.costBasisPerShare,
            };
          }
        }
        return next;
      });
    }
  };

  // Distinct origins present in lots
  const origins = React.useMemo(() => {
    const set = new Set(lots.map((l) => l.origin));
    return Array.from(set).sort();
  }, [lots]);

  const handleSimulate = () => {
    const entries: SaleLotEntry[] = [];
    for (const [lotId, sel] of Object.entries(selectedLots)) {
      const lot = lots.find((l) => l.id === lotId);
      if (!lot || sel.quantity <= 0) continue;
      entries.push({
        lot,
        quantitySold: Math.min(sel.quantity, lot.quantity),
        salePricePerShare: sel.price,
      });
    }
    if (entries.length === 0) return;
    onSimulate(entries);
  };

  const selectedCount = Object.keys(selectedLots).length;
  const totalSelectedQuantity = Object.entries(selectedLots).reduce((sum, [, sel]) => sum + sel.quantity, 0);
  const estimatedProceeds = Object.entries(selectedLots).reduce(
    (sum, [, sel]) => sum + sel.quantity * sel.price,
    0
  );

  const hasNonQualifiedDO = Object.keys(selectedLots).some((id) => {
    const lot = lots.find((l) => l.id === id);
    return lot && lot.origin === 'DO' && lot.planType === 'non_qualified';
  });

  return (
    <div className="space-y-6">
      {/* Sale price */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5" />
            Prix de vente
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-3 flex-wrap">
            <div>
              <label className="text-sm text-gray-600 block mb-1">Prix de vente unitaire (€)</label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={defaultPrice || ''}
                onChange={(e) => setDefaultPrice(parseFloat(e.target.value) || 0)}
                placeholder="Ex: 420.00"
                className="w-40"
              />
            </div>
            <Button variant="outline" size="sm" onClick={applyDefaultPrice} disabled={defaultPrice <= 0}>
              Appliquer à tous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchLiveMsftPrice}
              disabled={fetchingPrice}
              className="gap-1.5"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${fetchingPrice ? 'animate-spin' : ''}`} />
              Cours MSFT actuel
            </Button>
          </div>
          {livePriceUsd !== null && livePriceEur !== null && (
            <p className="mt-2 text-xs text-green-700 bg-green-50 p-2 rounded">
              Cours MSFT : {formatUSD(livePriceUsd)} → <strong>{formatEUR(livePriceEur)}</strong> (taux BCE du jour)
            </p>
          )}
          {priceError && (
            <p className="mt-2 text-xs text-amber-700 bg-amber-50 p-2 rounded">
              {priceError}
            </p>
          )}
        </CardContent>
      </Card>

      {hasNonQualifiedDO && (
        <Alert variant="warning">
          <strong>Lots non qualifiés sélectionnés :</strong> Le gain d'acquisition est déjà inclus dans votre salaire imposable (case 1AJ). Vérifiez votre bulletin de paie.
        </Alert>
      )}

      {/* Lot selection table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <CardTitle>Sélectionner les lots à vendre</CardTitle>
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-gray-400" />
              <div className="flex gap-1">
                <button
                  onClick={() => setOriginFilter('all')}
                  className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${
                    originFilter === 'all'
                      ? 'bg-primary text-white border-primary'
                      : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  Tous
                </button>
                {origins.map((o) => (
                  <button
                    key={o}
                    onClick={() => setOriginFilter(o)}
                    className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${
                      originFilter === o
                        ? 'bg-primary text-white border-primary'
                        : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    {originLabel(o)}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="p-3 w-10">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleSelectAll}
                      className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                      title={allSelected ? 'Tout désélectionner' : 'Tout sélectionner'}
                    />
                  </th>
                  <th className="text-left p-3 font-medium">Date acq.</th>
                  <th className="text-center p-3 font-medium">Origine</th>
                  <th className="text-right p-3 font-medium">Disponible</th>
                  <th className="text-right p-3 font-medium">Prix revient</th>
                  <th className="text-right p-3 font-medium">Qté à vendre</th>
                  <th className="text-right p-3 font-medium">Prix vente</th>
                  <th className="text-right p-3 font-medium">PV/MV estimée</th>
                </tr>
              </thead>
              <tbody>
                {filteredLots.map((lot) => {
                  const isSelected = !!selectedLots[lot.id];
                  const sel = selectedLots[lot.id];
                  const notAvailable = lot.availableForSaleDate && lot.availableForSaleDate > new Date();
                  const estimatedGain = isSelected
                    ? sel.quantity * (sel.price - lot.costBasisPerShare)
                    : 0;

                  return (
                    <tr
                      key={lot.id}
                      className={`border-b ${isSelected ? 'bg-blue-50' : 'hover:bg-gray-50'} ${notAvailable ? 'opacity-50' : ''}`}
                    >
                      <td className="p-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleLot(lot)}
                          disabled={!!notAvailable}
                          className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                        />
                      </td>
                      <td className="p-3">
                        {formatDate(lot.acquisitionDate)}
                        {notAvailable && <span className="block text-xs text-amber-600">Non disponible</span>}
                      </td>
                      <td className="p-3 text-center">
                        <Badge variant={lot.origin === 'SP' ? 'secondary' : 'default'}>
                          {originLabel(lot.origin)}
                        </Badge>
                      </td>
                      <td className="p-3 text-right">{lot.quantity.toLocaleString('fr-FR', { maximumFractionDigits: 4 })}</td>
                      <td className="p-3 text-right">{formatEUR(lot.costBasisPerShare)}</td>
                      <td className="p-3 text-right">
                        {isSelected ? (
                          <div>
                            <Input
                              type="number"
                              step="0.0001"
                              min="0"
                              max={lot.quantity}
                              value={sel.quantity}
                              onChange={(e) => updateQuantity(lot.id, parseFloat(e.target.value) || 0)}
                              className={`w-24 text-right h-8 text-sm ${sel.quantity > lot.quantity ? 'border-red-400' : ''}`}
                            />
                            {sel.quantity > lot.quantity && (
                              <span className="text-xs text-red-500 block mt-0.5">Max: {lot.quantity}</span>
                            )}
                          </div>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="p-3 text-right">
                        {isSelected ? (
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            value={sel.price}
                            onChange={(e) => updatePrice(lot.id, parseFloat(e.target.value) || 0)}
                            className="w-28 text-right h-8 text-sm"
                          />
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className={`p-3 text-right font-medium ${estimatedGain >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {isSelected ? (estimatedGain >= 0 ? '+' : '') + formatEUR(estimatedGain) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Summary & simulate button */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex gap-6 text-sm">
              <div>
                <span className="text-gray-500">Lots sélectionnés : </span>
                <strong>{selectedCount}</strong>
              </div>
              <div>
                <span className="text-gray-500">Actions : </span>
                <strong>{totalSelectedQuantity.toLocaleString('fr-FR', { maximumFractionDigits: 4 })}</strong>
              </div>
              <div>
                <span className="text-gray-500">Produit brut estimé : </span>
                <strong>{formatEUR(estimatedProceeds)}</strong>
              </div>
            </div>
            <Button onClick={handleSimulate} disabled={selectedCount === 0} className="gap-2">
              <Calculator className="h-4 w-4" />
              Simuler la vente
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
});
