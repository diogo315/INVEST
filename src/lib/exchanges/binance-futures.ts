import {
  fetchFuturesKlines,
  fetchFuturesSymbols,
  fetchFuturesTickers24h,
} from "@/lib/binance/rest-futures";
import { getBinanceFuturesWS } from "@/lib/binance/ws";
import type { Timeframe } from "@/lib/binance/types";
import type { ExchangeAdapter } from "./types";

// Futuros soporta las mismas temporalidades que spot.
const SUPPORTED = new Set<Timeframe>([
  "1m",
  "3m",
  "5m",
  "15m",
  "30m",
  "1h",
  "2h",
  "4h",
  "6h",
  "8h",
  "12h",
  "1d",
  "3d",
  "1w",
  "1M",
]);

export const binanceFuturesAdapter: ExchangeAdapter = {
  id: "BINF",
  name: "Binance Futuros",
  supportsTimeframe: (tf) => SUPPORTED.has(tf),
  fetchKlines: fetchFuturesKlines,
  fetchTickers24h: fetchFuturesTickers24h,
  fetchSymbols: fetchFuturesSymbols,
  subscribeKline: (sub) => getBinanceFuturesWS().subscribeKline(sub),
  subscribeMiniTickers: (symbols, onTick) =>
    getBinanceFuturesWS().subscribeMiniTickers(symbols, onTick),
};
