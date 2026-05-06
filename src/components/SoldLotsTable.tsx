import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Alert } from './ui/alert';
import { Badge } from './ui/badge';
import { Select } from './ui/select';
import { ShoppingCart, ArrowUpRight, ArrowDownRight, Calendar, CheckCircle2 } from 'lucide-react';
import type { Broker, SoldLot, StockOrigin, PlanType } from '../lib/types';
import { brokerLabel, formatEUR, formatUSD, formatDate } from '../lib/utils';
import { BrokerLogo } from './BrokerLogo';
import { BulkQualifyPanel } from './BulkQualifyPanel';
import { countEligible, type BulkQualifyChoice } from '../lib/bulk-qualify';

interface SoldLotsTableProps {
  soldLots: SoldLot[];
  onSoldLotsChange: (lots: SoldLot[]) => void;
  defaultPlanType: string;
  saleYear: number | null;
  onSaleYearChange: (year: number) => void;
  /** Optional: opens a bulk-qualify panel when there are non-reconciled lots. */
  onBulkQualify?: (choice: BulkQualifyChoice) => void;
  /** Whether the user has imported a StockExport file — drives the wording of the banner. */
  hasGrants?: boolean;
}

export function SoldLotsTable({
  soldLots,
  onSoldLotsChange,
  defaultPlanType,
  saleYear,
  onSaleYearChange,
  onBulkQualify,
  hasGrants = false,
}: SoldLotsTableProps) {
  const [filterBroker, setFilterBroker] = React.useState<Broker | 'all'>('all');

  // Compute available years
  const saleYears = [...new Set(soldLots.map((l) => l.saleDate.getFullYear()))].sort((a, b) => b - a);
  const hasMultipleYears = saleYears.length > 1;

  const presentBrokers = Array.from(new Set(soldLots.map((l) => l.broker))) as Broker[];
  const hasMultipleBrokers = presentBrokers.length > 1;

  // Filter lots by selected year and broker
  const filteredLots = soldLots.filter((l) => {
    if (saleYear != null && l.saleDate.getFullYear() !== saleYear) return false;
    if (filterBroker !== 'all' && l.broker !== filterBroker) return false;
    return true;
  });
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

  // Bulk panel toggled from the alert banner. We keep it collapsed by
  // default so users with already-classified portfolios don't see a
  // mass-action UI they don't need. The bulk action operates on ALL
  // non-reconciled lots regardless of year/broker filters — a deliberate
  // choice to keep the result predictable: filters drive what the user
  // *sees*, not what gets requalified.
  const [bulkOpen, setBulkOpen] = React.useState(false);
  const totalEligible = countEligible(soldLots);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShoppingCart className="h-5 w-5" />
          Ventes effectuées ({filteredLots.length} lot{filteredLots.length > 1 ? 's' : ''})
          {hasMultipleYears && (
            <span className="ml-auto flex items-center gap-2 text-sm font-normal">
              <Calendar className="h-4 w-4 text-gray-400" aria-hidden="true" />
              <Select
                value={String(saleYear ?? '')}
                aria-label="Filtrer par année de cession"
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
          {filteredLots.some((l) => !l.reconciled) ? (
            <Alert>
              <div className="flex flex-col gap-2">
                <div>
                  Les exports de ventes ne fournissent pas toujours l'origine et le régime fiscal exacts des actions.
                  {hasGrants ? (
                    <> Les lots <strong>reconciliés</strong> avec votre StockExport sont marqués d'un badge ; pour les autres,
                    vérifiez et corrigez le <strong>type</strong> et le <strong>régime fiscal</strong> ci-dessous. </>
                  ) : (
                    <> Importez votre fichier <strong>StockExport</strong> dans <em>Mes données &gt; Attributions</em> pour
                    qualifier automatiquement les lots — ou utilisez la qualification en lot ci-dessous. </>
                  )}
                </div>
                {onBulkQualify && totalEligible > 1 && (
                  <button
                    type="button"
                    onClick={() => setBulkOpen((v) => !v)}
                    className="self-start text-xs font-medium text-primary hover:underline"
                  >
                    {bulkOpen ? 'Masquer la qualification en lot' : `Qualifier en lot ${totalEligible} lots non reconciliés`}
                  </button>
                )}
              </div>
            </Alert>
          ) : (
            <Alert>
              Tous les lots affichés ont été <strong>reconciliés automatiquement</strong> avec votre StockExport.
            </Alert>
          )}
          {onBulkQualify && bulkOpen && totalEligible > 0 && (
            <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
              <BulkQualifyPanel
                eligibleCount={totalEligible}
                onApply={(choice) => {
                  onBulkQualify(choice);
                  setBulkOpen(false);
                }}
                compact
              />
            </div>
          )}
        </div>

        {hasMultipleBrokers && (
          <div className="mb-4">
            <Select
              value={filterBroker}
              onChange={(e) => setFilterBroker(e.target.value as Broker | 'all')}
              aria-label="Filtrer par courtier"
              className="w-48"
            >
              <option value="all">Tous courtiers</option>
              {presentBrokers.map((b) => (
                <option key={b} value={b}>{brokerLabel(b)}</option>
              ))}
            </Select>
          </div>
        )}

        {/* Table — desktop */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">Liste des lots vendus avec quantité, produits, coût, plus/moins-value et régime fiscal</caption>
            <thead>
              <tr className="border-b text-left text-gray-500">
                <th scope="col" className="pb-2 pr-3 font-medium">Acquisition</th>
                <th scope="col" className="pb-2 pr-3 font-medium">Vente</th>
                {hasMultipleBrokers && <th scope="col" className="pb-2 pr-3 font-medium">Courtier</th>}
                <th scope="col" className="pb-2 pr-3 font-medium text-right">Qté</th>
                <th scope="col" className="pb-2 pr-3 font-medium text-right">Produits</th>
                <th scope="col" className="pb-2 pr-3 font-medium text-right">Coût</th>
                <th scope="col" className="pb-2 pr-3 font-medium text-right">+/- value</th>
                <th scope="col" className="pb-2 pr-3 font-medium">Origine</th>
                <th scope="col" className="pb-2 font-medium">Plan</th>
              </tr>
            </thead>
            <tbody>
              {filteredLots.map((lot) => (
                <tr key={lot.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-2 pr-3">
                    <span className="inline-flex items-center gap-1">
                      {formatDate(lot.acquisitionDate)}
                      {lot.reconciled && (
                        <CheckCircle2
                          className="h-3.5 w-3.5 text-green-600"
                          aria-label="Lot reconcilié avec StockExport"
                        />
                      )}
                    </span>
                  </td>
                  <td className="py-2 pr-3">{formatDate(lot.saleDate)}</td>
                  {hasMultipleBrokers && (
                    <td className="py-2 pr-3">
                      <BrokerLogo broker={lot.broker} className="h-5" />
                    </td>
                  )}
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
                      aria-label={`Origine du lot acquis le ${formatDate(lot.acquisitionDate)}`}
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
                        aria-label={`Régime fiscal du lot acquis le ${formatDate(lot.acquisitionDate)}`}
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

        {/* Cards — mobile (< md) */}
        <div className="md:hidden space-y-2">
          {filteredLots.length === 0 && (
            <p className="text-sm text-gray-500 text-center py-4">
              Aucune vente à afficher.
            </p>
          )}
          {filteredLots.map((lot) => (
            <div key={lot.id} className="border rounded-lg p-3 space-y-2">
              {hasMultipleBrokers && (
                <div>
                  <BrokerLogo broker={lot.broker} className="h-5" />
                </div>
              )}
              <div className="flex items-start justify-between gap-2 text-xs">
                <div>
                  <div className="text-gray-500">Acquis le</div>
                  <div className="font-medium inline-flex items-center gap-1">
                    {formatDate(lot.acquisitionDate)}
                    {lot.reconciled && (
                      <CheckCircle2
                        className="h-3.5 w-3.5 text-green-600"
                        aria-label="Lot reconcilié avec StockExport"
                      />
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-gray-500">Vendu le</div>
                  <div className="font-medium">{formatDate(lot.saleDate)}</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <div className="text-gray-500">Qté</div>
                  <div className="font-medium tabular-nums">
                    {lot.quantity.toLocaleString('fr-FR', { maximumFractionDigits: 4 })}
                  </div>
                </div>
                <div className={`font-medium tabular-nums ${lot.gainLoss >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                  <div className="text-gray-500 font-normal">+/- value</div>
                  {formatEUR(lot.gainLoss)}
                </div>
                <div>
                  <div className="text-gray-500">Produits</div>
                  <div className="font-medium tabular-nums">{formatEUR(lot.proceeds)}</div>
                </div>
                <div>
                  <div className="text-gray-500">Coût</div>
                  <div className="font-medium tabular-nums">{formatEUR(lot.costBasis)}</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2 border-t">
                <Select
                  value={lot.origin}
                  aria-label={`Origine du lot acquis le ${formatDate(lot.acquisitionDate)}`}
                  onChange={(e) => handleOriginChange(lot.id, e.target.value as StockOrigin)}
                  className="text-xs h-8"
                >
                  <option value="DO">Stock Award</option>
                  <option value="FM">AGA Macron</option>
                  <option value="FQ">AGA pré-Macron</option>
                  <option value="SP">ESPP</option>
                </Select>
                {lot.origin === 'SP' ? (
                  <Badge variant="outline" className="justify-center">ESPP</Badge>
                ) : (
                  <Select
                    value={lot.planType}
                    aria-label={`Régime fiscal du lot acquis le ${formatDate(lot.acquisitionDate)}`}
                    onChange={(e) => handlePlanTypeChange(lot.id, e.target.value as PlanType)}
                    className="text-xs h-8"
                  >
                    <option value="qualified_macron">Qualifié (Macron)</option>
                    <option value="qualified_pre_macron">Qualifié (pré-Macron)</option>
                    <option value="non_qualified">Non qualifié</option>
                  </Select>
                )}
              </div>
            </div>
          ))}
        </div>

        {hiddenCount > 0 && (
          <p className="mt-3 text-xs text-gray-500">
            {hiddenCount} cession{hiddenCount > 1 ? 's' : ''} masquée{hiddenCount > 1 ? 's' : ''} par les filtres
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
