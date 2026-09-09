import type { Candle, SymbolInfo, Ticker24h, Timeframe } from "./types";

/**
 * REST de Binance Futures (USDⓈ-M). Mismo formato de klines que spot, pero
 * host y rutas distintas (`fapi/v1` en vez de `api/v3`).
 */
const BASE = "https://fapi.binance.com/fapi/v1";

export async function fetchFuturesKlines(
  symbol: string,
  interval: Timeframe,
  limit = 1000,
): Promise<Candle[]> {
  const url = `${BASE}/klines?symbol=${symbol.toUpperCase()}&interval=${interval}&limit=${limit}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`futures klines ${res.status}`);
  const data = (await res.json()) as unknown[][];
  return data.map((k) => ({
    time: Math.floor((k[0] as number) / 1000),
    open: parseFloat(k[1] as string),
    high: parseFloat(k[2] as string),
    low: parseFloat(k[3] as string),
    close: parseFloat(k[4] as string),
    volume: parseFloat(k[5] as string),
    isFinal: true,
  }));
}

function mapTicker(t: Record<string, string>): Ticker24h {
  return {
    symbol: t.symbol,
    lastPrice: parseFloat(t.lastPrice),
    priceChange: parseFloat(t.priceChange),
    priceChangePercent: parseFloat(t.priceChangePercent),
    highPrice: parseFloat(t.highPrice),
    lowPrice: parseFloat(t.lowPrice),
    volume: parseFloat(t.volume),
    quoteVolume: parseFloat(t.quoteVolume),
  };
}

/**
 * Futuros NO soporta el parámetro `symbols=[...]` que sí tiene spot: lo
 * ignora y devuelve los ~770 símbolos del mercado (verificado contra la API).
 * Por eso se pide uno por uno; el watchlist siempre es corto.
 */
export async function fetchFuturesTickers24h(
  symbols: string[],
): Promise<Ticker24h[]> {
  const results = await Promise.all(
    symbols.map(async (s) => {
      try {
        const res = await fetch(
          `${BASE}/ticker/24hr?symbol=${s.toUpperCase()}`,
          { cache: "no-store" },
        );
        if (!res.ok) return null;
        return mapTicker(await res.json());
      } catch {
        return null;
      }
    }),
  );
  return results.filter((t): t is Ticker24h => t !== null);
}

let cachedFuturesSymbols: SymbolInfo[] | null = null;

/** Solo perpetuos con margen en USDT (los ~530 que interesan para operar). */
export async function fetchFuturesSymbols(): Promise<SymbolInfo[]> {
  if (cachedFuturesSymbols) return cachedFuturesSymbols;
  const res = await fetch(`${BASE}/exchangeInfo`, { cache: "force-cache" });
  if (!res.ok) throw new Error(`futures exchangeInfo ${res.status}`);
  const data = await res.json();
  cachedFuturesSymbols = (
    data.symbols as Array<{
      symbol: string;
      baseAsset: string;
      quoteAsset: string;
      status: string;
      contractType: string;
    }>
  )
    .filter(
      (s) =>
        s.status === "TRADING" &&
        s.quoteAsset === "USDT" &&
        s.contractType === "PERPETUAL",
    )
    .map((s) => ({
      symbol: s.symbol,
      baseAsset: s.baseAsset,
      quoteAsset: s.quoteAsset,
      status: s.status,
    }));
  return cachedFuturesSymbols;
}
