import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
let cached: { data: unknown; timestamp: number } | null = null;

export async function msftQuote(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  // Serve from cache if fresh
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return { status: 200, jsonBody: cached.data };
  }

  const apiKey = process.env.FINNHUB_API_KEY;
  if (!apiKey) {
    context.error('FINNHUB_API_KEY is not configured');
    return { status: 500, jsonBody: { error: 'API key not configured on server' } };
  }

  try {
    const res = await fetch(
      `https://finnhub.io/api/v1/quote?symbol=MSFT&token=${encodeURIComponent(apiKey)}`
    );

    if (!res.ok) {
      return { status: res.status, jsonBody: { error: 'Finnhub API error' } };
    }

    const data = await res.json();
    cached = { data, timestamp: Date.now() };
    return { status: 200, jsonBody: data };
  } catch (err) {
    context.error('Failed to fetch Finnhub quote:', err);
    return { status: 502, jsonBody: { error: 'Failed to reach Finnhub API' } };
  }
}

app.http('msft-quote', {
  methods: ['GET'],
  authLevel: 'anonymous',
  handler: msftQuote,
});
