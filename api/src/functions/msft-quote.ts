import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';

export async function msftQuote(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
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
