import {
  fetchExchangeSymbols,
  fetchKlines,
  fetchTickers24h,
} from "@/lib/binance/rest";
import { getBinanceWS } from "@/lib/binance/ws";
import type { Timeframe } from "@/lib/binance/types";
import type { ExchangeAdapter } from "./types";

// Binance supports virtually all Binance-style timeframes
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

export const binanceAdapter: ExchangeAdapter = {
  id: "BIN",
  name: "Binance",
  supportsTimeframe: (tf) => SUPPORTED.has(tf),
  fetchKlines,
  fetchTickers24h,
  fetchSymbols: fetchExchangeSymbols,
  subscribeKline: (sub) => getBinanceWS().subscribeKline(sub),
  subscribeMiniTickers: (symbols, onTick) =>
    getBinanceWS().subscribeMiniTickers(symbols, onTick),
};
