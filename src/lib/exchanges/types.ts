import type {
  Candle,
  SymbolInfo,
  Ticker24h,
  Timeframe,
} from "@/lib/binance/types";

/** BIN = Binance spot · BINF = Binance futuros (perpetuos USDⓈ-M) · BG = Bitget */
export type ExchangeId = "BIN" | "BINF" | "BG";

export interface KlineSubscription {
  symbol: string;
  interval: Timeframe;
  onCandle: (c: Candle) => void;
}

export interface MiniTick {
  symbol: string;
  close: number;
  open: number;
  pct: number;
}

export interface ExchangeAdapter {
  id: ExchangeId;
  name: string;
  /** Whether this exchange supports the given Binance-style timeframe. */
  supportsTimeframe(tf: Timeframe): boolean;
  fetchKlines(symbol: string, tf: Timeframe, limit?: number): Promise<Candle[]>;
  fetchTickers24h(symbols: string[]): Promise<Ticker24h[]>;
  fetchSymbols(): Promise<SymbolInfo[]>;
  subscribeKline(sub: KlineSubscription): () => void;
  subscribeMiniTickers(
    symbols: string[],
    onTick: (t: MiniTick) => void,
  ): () => void;
}
