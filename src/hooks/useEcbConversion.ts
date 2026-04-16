import { useState, useCallback } from 'react';
import { fetchECBRates, convertUsdToEur, formatDateKey } from '../lib/ecb-rates';
import type { StockLot, SoldLot } from '../lib/types';

interface EcbConversionResult {
  convertLots: (lots: StockLot[]) => Promise<{ converted: StockLot[]; missingCount: number }>;
  convertSoldLots: (lots: SoldLot[]) => Promise<{ converted: SoldLot[]; missingCount: number }>;
  loading: boolean;
  error: string | null;
}

/**
 * Hook to convert USD-imported stock lots to EUR using ECB historical rates.
 * Fetches rates for each lot's acquisition date and today's rate for current value.
 */
export function useEcbConversion(): EcbConversionResult {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const convertLots = useCallback(async (lots: StockLot[]) => {
    setLoading(true);
    setError(null);
    try {
      const dates = lots.map((l) => l.acquisitionDate);
      const today = new Date();
      const allDates = [...dates, today];
      const rates = await fetchECBRates(allDates);
      const todayKey = formatDateKey(today);
      const todayRate = rates[todayKey];

      const converted = lots.map((lot) => {
        const dateKey = formatDateKey(lot.acquisitionDate);
        const acqRate = rates[dateKey];
        if (!acqRate) {
          return { ...lot, eurUsdRate: undefined };
        }
        const costBasisPerShare = convertUsdToEur(lot.costBasisPerShareUsd || 0, acqRate);
        const totalCostBasis = convertUsdToEur(lot.totalCostBasisUsd || 0, acqRate);
        const esppFmvPerShare = lot.esppFmvPerShareUsd
          ? convertUsdToEur(lot.esppFmvPerShareUsd, acqRate)
          : undefined;
        const rateForCurrentValue = todayRate || acqRate;
        const currentValue = convertUsdToEur(lot.currentValueUsd || 0, rateForCurrentValue);
        const unrealizedGainLoss = currentValue - totalCostBasis;
        return {
          ...lot,
          eurUsdRate: acqRate,
          costBasisPerShare,
          totalCostBasis,
          esppFmvPerShare,
          currentValue,
          unrealizedGainLoss,
        };
      });

      const missingCount = converted.filter((l) => !l.eurUsdRate).length;
      if (missingCount > 0) {
        setError(`Taux BCE introuvable pour ${missingCount} lot(s). Vérifiez les dates ou renseignez manuellement.`);
      }
      return { converted, missingCount };
    } catch {
      setError('Erreur lors de la récupération des taux BCE. Vérifiez votre connexion.');
      return { converted: lots, missingCount: lots.length };
    } finally {
      setLoading(false);
    }
  }, []);

  const convertSoldLots = useCallback(async (lots: SoldLot[]) => {
    setLoading(true);
    setError(null);
    try {
      // For sold lots, we need rates for the sale date (conversion of proceeds at sale date)
      const saleDates = lots.map((l) => l.saleDate);
      const acqDates = lots.map((l) => l.acquisitionDate);
      const allDates = [...saleDates, ...acqDates];
      const rates = await fetchECBRates(allDates);

      const converted = lots.map((lot) => {
        const saleDateKey = formatDateKey(lot.saleDate);
        const saleRate = rates[saleDateKey];
        if (!saleRate) {
          return { ...lot, eurUsdRate: undefined };
        }
        const proceeds = convertUsdToEur(lot.proceedsUsd || 0, saleRate);
        const costBasis = convertUsdToEur(lot.costBasisUsd || 0, saleRate);
        const gainLoss = proceeds - costBasis;
        return {
          ...lot,
          eurUsdRate: saleRate,
          proceeds,
          costBasis,
          gainLoss,
        };
      });

      const missingCount = converted.filter((l) => !l.eurUsdRate).length;
      if (missingCount > 0) {
        setError(`Taux BCE introuvable pour ${missingCount} lot(s). Vérifiez les dates ou renseignez manuellement.`);
      }
      return { converted, missingCount };
    } catch {
      setError('Erreur lors de la récupération des taux BCE. Vérifiez votre connexion.');
      return { converted: lots, missingCount: lots.length };
    } finally {
      setLoading(false);
    }
  }, []);

  return { convertLots, convertSoldLots, loading, error };
}
