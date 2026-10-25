import type {
  Candle,
  SymbolInfo,
  Ticker24h,
  Timeframe,
} from "@/lib/binance/types";

/**
 * BIN = Binance spot · BINF = Binance futuros (perpetuos USDⓈ-M) ·
 * BG = Bitget · ALP = acciones y ETFs de EE. UU. por Alpaca
 */
export type ExchangeId = "BIN" | "BINF" | "BG" | "ALP";

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
  /**
   * `hastaMs` termina la ventana en un momento dado en vez de en ahora.
   * Hace falta para el backtesting: en 15m, 10.000 velas desde hoy
   * cubren 104 días y un backtest que arrancó hace nueve meses queda
   * fuera de todas ellas. Sin esto, ese panel se dibuja vacío.
   */
  fetchKlines(
    symbol: string,
    tf: Timeframe,
    limit?: number,
    hastaMs?: number,
  ): Promise<Candle[]>;
  fetchTickers24h(symbols: string[]): Promise<Ticker24h[]>;
  fetchSymbols(): Promise<SymbolInfo[]>;
  subscribeKline(sub: KlineSubscription): () => void;
  subscribeMiniTickers(
    symbols: string[],
    onTick: (t: MiniTick) => void,
  ): () => void;
}
