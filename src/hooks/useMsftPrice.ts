import { useState, useCallback, useEffect } from 'react';
import { fetchECBRates, convertUsdToEur, formatDateKey } from '../lib/ecb-rates';
import { formatUSD } from '../lib/utils';

interface MsftPriceResult {
  usdPrice: number | null;
  eurPrice: number | null;
  change: number | null;
  changeEur: number | null;
  changePercent: number | null;
  marketTimestamp: Date | null;
  lastUpdated: Date | null;
  error: string | null;
  loading: boolean;
  /** Manually retry after a transient failure (network / rate limit). */
  retry: () => void;
}

/**
 * Hook that auto-fetches the cached MSFT stock price from the server-side API
 * and converts to EUR via ECB rates. The server controls Finnhub rate-limiting.
 */
export function useMsftPrice(): MsftPriceResult {
  const [usdPrice, setUsdPrice] = useState<number | null>(null);
  const [eurPrice, setEurPrice] = useState<number | null>(null);
  const [change, setChange] = useState<number | null>(null);
  const [changeEur, setChangeEur] = useState<number | null>(null);
  const [changePercent, setChangePercent] = useState<number | null>(null);
  const [marketTimestamp, setMarketTimestamp] = useState<Date | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
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

      if (typeof data.d === 'number') setChange(data.d);
      if (typeof data.dp === 'number') setChangePercent(data.dp);
      if (typeof data.t === 'number') setMarketTimestamp(new Date(data.t * 1000));

      if (data._cachedAt) {
        setLastUpdated(new Date(data._cachedAt));
      }

      // Convert to EUR via ECB rate
      const today = new Date();
      const rates = await fetchECBRates([today]);
      const todayKey = formatDateKey(today);
      const rate = rates[todayKey];
      if (rate) {
        const eur = convertUsdToEur(usd, rate);
        setEurPrice(eur);
        if (typeof data.d === 'number') {
          setChangeEur(convertUsdToEur(data.d, rate));
        }
      } else {
        setError(`Cours MSFT: ${formatUSD(usd)} — Taux BCE du jour indisponible, convertissez manuellement.`);
      }
    } catch {
      setError('Impossible de récupérer le cours MSFT.');
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-fetch on mount. Calling fetchPrice triggers a setState chain inside
  // an async network handler — that is the whole point of this hook.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchPrice();
  }, [fetchPrice]);

  return { usdPrice, eurPrice, change, changeEur, changePercent, marketTimestamp, lastUpdated, error, loading, retry: fetchPrice };
}
