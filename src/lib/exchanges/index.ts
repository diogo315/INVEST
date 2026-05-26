import { binanceAdapter } from "./binance";
import { bitgetAdapter } from "./bitget";
import type { ExchangeAdapter, ExchangeId } from "./types";

export type { ExchangeAdapter, ExchangeId } from "./types";

export const ADAPTERS: Record<ExchangeId, ExchangeAdapter> = {
  BIN: binanceAdapter,
  BG: bitgetAdapter,
};

export const ALL_EXCHANGES: ExchangeAdapter[] = [binanceAdapter, bitgetAdapter];

/**
 * Parse a qualified symbol like "BIN:BTCUSDT" or "BG:ETHUSDT".
 * Legacy symbols without a prefix (e.g. "BTCUSDT") are assumed to be Binance.
 */
export function parseSymbol(qualified: string): {
  exchange: ExchangeId;
  symbol: string;
} {
  const colon = qualified.indexOf(":");
  if (colon > 0) {
    const prefix = qualified.slice(0, colon);
    const sym = qualified.slice(colon + 1);
    if (prefix === "BIN" || prefix === "BG") {
      return { exchange: prefix, symbol: sym };
    }
  }
  return { exchange: "BIN", symbol: qualified };
}

export function formatSymbol(exchange: ExchangeId, symbol: string): string {
  return `${exchange}:${symbol}`;
}

export function getAdapter(qualified: string): {
  adapter: ExchangeAdapter;
  symbol: string;
} {
  const { exchange, symbol } = parseSymbol(qualified);
  return { adapter: ADAPTERS[exchange], symbol };
}
