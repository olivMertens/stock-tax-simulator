import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
let cached: { data: unknown; timestamp: number } | null = null;

// --- Simple in-memory rate limiter (per client IP) ---
// Protects the upstream Finnhub quota from abuse. For multi-instance deploys,
// replace with Azure API Management or a distributed store (Redis).
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX = 20; // requests per window per IP
const RATE_LIMIT_MAX_ENTRIES = 5000; // cap memory usage
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

function getClientIp(req: HttpRequest): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return req.headers.get('x-client-ip') || 'unknown';
}

function checkRateLimit(ip: string): { allowed: boolean; retryAfterSec: number } {
  const now = Date.now();
  const entry = rateBuckets.get(ip);

  if (!entry || entry.resetAt <= now) {
    // Opportunistic eviction to bound memory
    if (rateBuckets.size >= RATE_LIMIT_MAX_ENTRIES) {
      for (const [key, val] of rateBuckets) {
        if (val.resetAt <= now) rateBuckets.delete(key);
      }
      if (rateBuckets.size >= RATE_LIMIT_MAX_ENTRIES) {
        // Still full: drop oldest entry
        const firstKey = rateBuckets.keys().next().value;
        if (firstKey) rateBuckets.delete(firstKey);
      }
    }
    rateBuckets.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return { allowed: true, retryAfterSec: 0 };
  }

  if (entry.count >= RATE_LIMIT_MAX) {
    return { allowed: false, retryAfterSec: Math.ceil((entry.resetAt - now) / 1000) };
  }
  entry.count++;
  return { allowed: true, retryAfterSec: 0 };
}

export async function msftQuote(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const ip = getClientIp(req);
  const limit = checkRateLimit(ip);
  if (!limit.allowed) {
    return {
      status: 429,
      headers: { 'Retry-After': String(limit.retryAfterSec) },
      jsonBody: { error: 'Too many requests. Please retry later.' },
    };
  }

  // Serve from cache if fresh
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return { status: 200, jsonBody: { ...cached.data as Record<string, unknown>, _cachedAt: cached.timestamp } };
  }

  const apiKey = process.env.FINNHUB_API_KEY;
  if (!apiKey) {
    context.error('FINNHUB_API_KEY is not configured');
    // 503: service unavailable (less exploitable than 500 which suggests a bug)
    return { status: 503, jsonBody: { error: 'Service temporarily unavailable' } };
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
    return { status: 200, jsonBody: { ...data, _cachedAt: cached.timestamp } };
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
