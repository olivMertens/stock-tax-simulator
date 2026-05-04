import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Select } from './ui/select';
import { Alert } from './ui/alert';
import { Badge } from './ui/badge';
import { Calculator, ShoppingCart } from 'lucide-react';
import type { StockLot, SaleLotEntry, AppSettings, StockOrigin, Broker } from '../lib/types';
import { formatEUR, formatUSD, formatDate, originLabel } from '../lib/utils';
import { useMsftPrice } from '../hooks/useMsftPrice';
import { ErrorFallback } from './ErrorFallback';
import { BrokerLogo } from './BrokerLogo';

interface SaleSimulatorProps {
  lots: StockLot[];
  settings: AppSettings;
  onSimulate: (entries: SaleLotEntry[]) => void;
  /**
   * Optional callback invoked when the lot selection or quantities change
   * after the very first render. Used by the parent to mark a previous
   * simulation as "stale" and prompt the user to re-run the calculation.
   */
  onSelectionChange?: () => void;
}

export const SaleSimulator = React.memo(function SaleSimulator({ lots, onSimulate, onSelectionChange }: SaleSimulatorProps) {
  const [selectedLots, setSelectedLots] = React.useState<Record<string, { quantity: number; price: number }>>({});
  const [defaultPrice, setDefaultPrice] = React.useState<number>(0);
  const [priceInput, setPriceInput] = React.useState<string>('0');
  // Tracks whether the user has manually edited the price input. Once true,
  // the live-price sync effect must not overwrite their value.
  const hasUserEditedPriceRef = React.useRef(false);
  const [originFilter, setOriginFilter] = React.useState<StockOrigin | 'all'>('all');
  const [brokerFilter, setBrokerFilter] = React.useState<Broker | 'all'>('all');
  const [holdingFilter, setHoldingFilter] = React.useState<'all' | 'Long' | 'Short'>('all');

  const {
    usdPrice: livePriceUsd,
    eurPrice: livePriceEur,
    changeEur,
    changePercent,
    marketTimestamp,
    error: priceError,
    loading: fetchingPrice,
    retry: retryPrice,
  } = useMsftPrice();

  // Sync EUR price to default price when fetched — but only if the user
  // hasn't typed anything yet. Otherwise their input would be stomped on
  // every refetch.
  React.useEffect(() => {
    if (livePriceEur !== null && !hasUserEditedPriceRef.current) {
      const rounded = Math.round(livePriceEur * 100) / 100;
      setDefaultPrice(rounded);
      setPriceInput(String(rounded));
    }
  }, [livePriceEur]);

  // Debounce priceInput -> defaultPrice (300ms)
  React.useEffect(() => {
    const timer = setTimeout(() => {
      const parsed = parseFloat(priceInput);
      if (!isNaN(parsed) && parsed >= 0) setDefaultPrice(parsed);
    }, 300);
    return () => clearTimeout(timer);
  }, [priceInput]);

  const toggleLot = (lot: StockLot) => {
    setSelectedLots((prev) => {
      const next = { ...prev };
      if (next[lot.id]) {
        delete next[lot.id];
      } else {
        next[lot.id] = {
          quantity: lot.quantity,
          price: defaultPrice,
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
  const filteredLots = React.useMemo(() => availableLots.filter((lot) => {
    if (originFilter !== 'all' && lot.origin !== originFilter) return false;
    if (brokerFilter !== 'all' && lot.broker !== brokerFilter) return false;
    if (holdingFilter !== 'all' && lot.holdingPeriod !== holdingFilter) return false;
    return true;
  }), [availableLots, originFilter, brokerFilter, holdingFilter]);
  const isFiltered = originFilter !== 'all' || brokerFilter !== 'all' || holdingFilter !== 'all';
  const resetFilters = () => {
    setOriginFilter('all');
    setBrokerFilter('all');
    setHoldingFilter('all');
  };
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
              price: defaultPrice,
            };
          }
        }
        return next;
      });
    }
  };

  // Distinct origins/brokers present in lots
  const origins = React.useMemo(() => {
    const set = new Set(lots.map((l) => l.origin));
    return Array.from(set).sort();
  }, [lots]);
  const brokers = React.useMemo(() => {
    const set = new Set(lots.map((l) => l.broker)) as Set<Broker>;
    return Array.from(set).sort();
  }, [lots]);

  // Show the broker column only when lots span multiple brokers; with a single
  // broker the BrokerSection on the data tab already conveys the courtier.
  const hasMultipleBrokers = brokers.length > 1;

  // Notify parent when the selection mutates after first render. We skip the
  // initial mount so we don't fire before the user has done anything.
  const initialMountRef = React.useRef(true);
  React.useEffect(() => {
    if (initialMountRef.current) {
      initialMountRef.current = false;
      return;
    }
    onSelectionChange?.();
  }, [selectedLots, onSelectionChange]);

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

  const hasInvalidPrice = Object.values(selectedLots).some((sel) => sel.quantity > 0 && sel.price <= 0);

  const hasNonQualifiedDO = Object.keys(selectedLots).some((id) => {
    const lot = lots.find((l) => l.id === id);
    return lot && lot.origin === 'DO' && lot.planType === 'non_qualified';
  });

  return (
    <div className="space-y-6 pb-28">
      {hasNonQualifiedDO && (
        <Alert variant="warning">
          <strong>Lots non qualifiés sélectionnés :</strong> Le gain d'acquisition est déjà inclus dans votre salaire imposable (case 1AJ). Vérifiez votre bulletin de paie.
        </Alert>
      )}

      {hasInvalidPrice && (
        <Alert variant="destructive">
          Renseignez un prix de vente pour tous les lots sélectionnés, ou cliquez <strong>Appliquer à tous</strong>.
        </Alert>
      )}

      {/* Lot selection table (with price section merged into header) */}
      <Card>
        <CardHeader className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <CardTitle className="flex items-center gap-2">
              <ShoppingCart className="h-5 w-5" />
              Sélectionner les lots à vendre
            </CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              {hasMultipleBrokers && (
                <Select
                  aria-label="Filtrer par courtier"
                  value={brokerFilter}
                  onChange={(e) => setBrokerFilter(e.target.value as Broker | 'all')}
                  className="h-8 text-xs w-36"
                >
                  <option value="all">Tous courtiers</option>
                  {brokers.map((b) => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </Select>
              )}
              <Select
                aria-label="Filtrer par type"
                value={originFilter}
                onChange={(e) => setOriginFilter(e.target.value as StockOrigin | 'all')}
                className="h-8 text-xs w-36"
              >
                <option value="all">Toutes origines</option>
                {origins.map((o) => (
                  <option key={o} value={o}>{originLabel(o)}</option>
                ))}
              </Select>
              <Select
                aria-label="Filtrer par détention"
                value={holdingFilter}
                onChange={(e) => setHoldingFilter(e.target.value as 'all' | 'Long' | 'Short')}
                className="h-8 text-xs w-36"
              >
                <option value="all">Toutes détentions</option>
                <option value="Long">≥ 2 ans</option>
                <option value="Short">&lt; 2 ans</option>
              </Select>
              {isFiltered && (
                <Button variant="ghost" size="sm" onClick={resetFilters} className="h-8 text-xs">
                  Réinitialiser
                </Button>
              )}
              <span className="text-xs text-gray-500 ml-1">
                {filteredLots.length} / {availableLots.length} lots
              </span>
            </div>
          </div>

          {/* Inline price bar */}
          <div className="flex items-center justify-between gap-4 flex-wrap p-3 bg-gray-50 rounded-lg border border-gray-200">
            {/* Live quote */}
            <div className="min-w-0">
              {fetchingPrice && (
                <span className="text-sm text-gray-400">Chargement du cours…</span>
              )}
              {livePriceEur !== null && livePriceUsd !== null && (
                <div className="flex items-center gap-3">
                  {/* EUR price — hero */}
                  <div className="flex items-center gap-2">
                    <span className="relative flex h-2 w-2 shrink-0">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                    </span>
                    <span className="text-2xl font-bold text-gray-900 tabular-nums">{formatEUR(livePriceEur)}</span>
                  </div>
                  {/* Variation badge */}
                  {changeEur !== null && changePercent !== null && (
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${
                      changePercent >= 0
                        ? 'bg-green-100 text-green-700'
                        : 'bg-red-100 text-red-700'
                    }`}>
                      {changePercent >= 0 ? '▲' : '▼'} {changePercent >= 0 ? '+' : ''}{formatEUR(changeEur)} ({changePercent >= 0 ? '+' : ''}{changePercent.toFixed(2)} %)
                    </span>
                  )}
                  {/* Secondary line: USD + market status */}
                  <div className="flex items-center gap-2 text-xs text-gray-400">
                    <span className="tabular-nums">{formatUSD(livePriceUsd)}</span>
                    {marketTimestamp && (
                      <>
                        <span>·</span>
                        <span>Clôture {marketTimestamp.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} {marketTimestamp.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
                      </>
                    )}
                  </div>
                </div>
              )}
              {priceError && (
                <ErrorFallback
                  variant="warning"
                  message={priceError}
                  hint="Vous pouvez saisir un prix manuellement ci-contre."
                  onRetry={retryPrice}
                  className="mt-1"
                />
              )}
            </div>

            {/* Price input + apply */}
            <div className="flex items-center gap-2 shrink-0">
              <label className="text-xs text-gray-500 whitespace-nowrap">Prix unitaire €</label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={priceInput}
                onChange={(e) => {
                  hasUserEditedPriceRef.current = true;
                  setPriceInput(e.target.value);
                }}
                placeholder="Ex: 420.00"
                className="w-32 h-8 text-sm"
              />
              <Button variant="outline" size="sm" onClick={applyDefaultPrice} disabled={defaultPrice <= 0}>
                Appliquer à tous
              </Button>
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
                      aria-label={allSelected ? `Désélectionner les ${filteredLots.length} lots filtrés` : `Sélectionner les ${filteredLots.length} lots filtrés`}
                      title={allSelected ? `Désélectionner les ${filteredLots.length} lots filtrés` : `Sélectionner les ${filteredLots.length} lots filtrés`}
                    />
                  </th>
                  <th className="text-left p-3 font-medium">Date acq.</th>
                  {hasMultipleBrokers && <th className="text-center p-3 font-medium">Courtier</th>}
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
                  const refPrice = lot.origin === 'SP'
                    ? (lot.esppFmvPerShare ?? lot.costBasisPerShare)
                    : lot.costBasisPerShare;
                  const estimatedGain = isSelected
                    ? sel.quantity * (sel.price - refPrice)
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
                      {hasMultipleBrokers && (
                        <td className="p-3 text-center">
                          <BrokerLogo broker={lot.broker} className="h-5 mx-auto" />
                        </td>
                      )}
                      <td className="p-3 text-center">
                        <Badge variant={lot.origin === 'SP' ? 'secondary' : 'default'}>
                          {originLabel(lot.origin)}
                        </Badge>
                      </td>
                      <td className="p-3 text-right">{lot.quantity.toLocaleString('fr-FR', { maximumFractionDigits: 4 })}</td>
                      <td className="p-3 text-right">{formatEUR(lot.origin === 'SP' ? (lot.esppFmvPerShare ?? lot.costBasisPerShare) : lot.costBasisPerShare)}</td>
                      <td className="p-3 text-right">
                        {isSelected ? (
                          <div className="ml-auto w-fit flex items-center gap-1">
                            <Input
                              type="number"
                              step="0.0001"
                              min="0"
                              max={lot.quantity}
                              value={sel.quantity}
                              onChange={(e) => updateQuantity(lot.id, parseFloat(e.target.value) || 0)}
                              className={`w-24 text-right h-8 text-sm ${sel.quantity > lot.quantity ? 'border-red-400' : ''}`}
                            />
                            <button
                              type="button"
                              onClick={() => updateQuantity(lot.id, lot.quantity)}
                              className="px-1.5 py-0.5 text-[10px] font-medium text-primary border border-primary/30 rounded hover:bg-primary/10 transition-colors shrink-0"
                              title={`Quantité max : ${lot.quantity}`}
                            >
                              Max
                            </button>
                            {sel.quantity > lot.quantity && (
                              <span className="text-xs text-red-500 whitespace-nowrap">Max: {lot.quantity}</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-300">—</span>
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
                            className={`w-28 text-right h-8 text-sm ml-auto ${sel.price <= 0 ? 'border-red-400' : ''}`}
                          />
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      <td className="p-3 text-right font-medium">
                        {isSelected && sel.price > 0
                          ? <span className={estimatedGain >= 0 ? 'text-green-600' : 'text-red-600'}>{(estimatedGain >= 0 ? '+' : '') + formatEUR(estimatedGain)}</span>
                          : <span className="text-gray-300">—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Sticky summary bar */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur border-t border-gray-200 shadow-[0_-2px_10px_rgba(0,0,0,0.08)]">
        <div className="max-w-5xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-4">
          <div className="flex gap-6 text-sm">
            <div>
              <span className="text-gray-500">Lots : </span>
              <strong>{selectedCount}</strong>
            </div>
            <div>
              <span className="text-gray-500">Actions : </span>
              <strong>{totalSelectedQuantity.toLocaleString('fr-FR', { maximumFractionDigits: 4 })}</strong>
            </div>
            <div>
              <span className="text-gray-500">Produit brut : </span>
              <strong>{formatEUR(estimatedProceeds)}</strong>
            </div>
          </div>
          <Button onClick={handleSimulate} disabled={selectedCount === 0 || hasInvalidPrice} className="gap-2">
            <Calculator className="h-4 w-4" />
            Simuler la vente
          </Button>
        </div>
      </div>
    </div>
  );
});
