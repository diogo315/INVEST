import { getAdapter } from "@/lib/exchanges";
import type { Candle, Timeframe } from "./types";

interface CacheEntry {
  candles: Candle[];
  fetchedAt: number; // ms epoch
  promise?: Promise<Candle[]>;
}

const cache = new Map<string, CacheEntry>();

// How long to trust cached data per timeframe before refetching.
// Smaller TFs go stale faster.
function ttlMsFor(tf: Timeframe): number {
  switch (tf) {
    case "1m":
    case "3m":
    case "5m":
      return 60_000;
    case "15m":
    case "30m":
      return 5 * 60_000;
    case "1h":
    case "2h":
    case "4h":
      return 15 * 60_000;
    default:
      return 60 * 60_000;
  }
}

function key(symbol: string, tf: Timeframe): string {
  return `${symbol.toUpperCase()}|${tf}`;
}

/**
 * Fetch klines for a `qualifiedSymbol`/`timeframe` with an in-memory TTL cache.
 * `qualifiedSymbol` is a prefixed symbol like "BIN:BTCUSDT" or "BG:ETHUSDT".
 * Concurrent callers share the same in-flight promise.
 */
export function fetchKlinesCached(
  qualifiedSymbol: string,
  timeframe: Timeframe,
  limit = 500,
): Promise<Candle[]> {
  const k = key(qualifiedSymbol, timeframe);
  const now = Date.now();
  const entry = cache.get(k);
  if (entry) {
    if (entry.promise) return entry.promise;
    if (now - entry.fetchedAt < ttlMsFor(timeframe))
      return Promise.resolve(entry.candles);
  }
  const { adapter, symbol: raw } = getAdapter(qualifiedSymbol);
  const promise = adapter
    .fetchKlines(raw, timeframe, limit)
    .then((candles) => {
      cache.set(k, { candles, fetchedAt: Date.now() });
      return candles;
    })
    .catch((err) => {
      // On failure, drop the in-flight marker so the next call can retry.
      const prev = cache.get(k);
      if (prev && prev.promise === promise) cache.delete(k);
      throw err;
    });
  cache.set(k, {
    candles: entry?.candles ?? [],
    fetchedAt: entry?.fetchedAt ?? 0,
    promise,
  });
  return promise;
}

export function invalidateMultiTFCache(qualifiedSymbol?: string): void {
  if (!qualifiedSymbol) {
    cache.clear();
    return;
  }
  const prefix = `${qualifiedSymbol.toUpperCase()}|`;
  for (const k of cache.keys()) if (k.startsWith(prefix)) cache.delete(k);
}
