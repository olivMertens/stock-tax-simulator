import { useState, useCallback } from 'react';
import { fetchECBRates, convertUsdToEur, formatDateKey } from '../lib/ecb-rates';
import { formatUSD } from '../lib/utils';

interface MsftPriceResult {
  usdPrice: number | null;
  eurPrice: number | null;
  error: string | null;
  loading: boolean;
  fetchPrice: () => Promise<void>;
}

/**
 * Hook to fetch the live MSFT stock price via the server-side API proxy
 * and convert to EUR via ECB rates.
 */
export function useMsftPrice(): MsftPriceResult {
  const [usdPrice, setUsdPrice] = useState<number | null>(null);
  const [eurPrice, setEurPrice] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchPrice = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/msft-quote');
      if (!res.ok) throw new Error('Erreur API');
      const data = await res.json();
      if (!data.c || data.c === 0) throw new Error('Prix indisponible');
      const usd = data.c as number;
      setUsdPrice(usd);

      // Convert to EUR via ECB rate
      const today = new Date();
      const rates = await fetchECBRates([today]);
      const todayKey = formatDateKey(today);
      const rate = rates[todayKey];
      if (rate) {
        const eur = convertUsdToEur(usd, rate);
        setEurPrice(eur);
      } else {
        setError(`Cours MSFT: ${formatUSD(usd)} — Taux BCE du jour indisponible, convertissez manuellement.`);
      }
    } catch {
      setError('Impossible de récupérer le cours MSFT.');
    } finally {
      setLoading(false);
    }
  }, []);

  return { usdPrice, eurPrice, error, loading, fetchPrice };
}
