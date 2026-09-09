import { binanceAdapter } from "./binance";
import { binanceFuturesAdapter } from "./binance-futures";
import { bitgetAdapter } from "./bitget";
import type { ExchangeAdapter, ExchangeId } from "./types";

export type { ExchangeAdapter, ExchangeId } from "./types";

export const ADAPTERS: Record<ExchangeId, ExchangeAdapter> = {
  BIN: binanceAdapter,
  BINF: binanceFuturesAdapter,
  BG: bitgetAdapter,
};

export const ALL_EXCHANGES: ExchangeAdapter[] = [
  binanceAdapter,
  binanceFuturesAdapter,
  bitgetAdapter,
];

/** Etiqueta y color del chip de exchange, en un solo lugar. */
export const EXCHANGE_BADGE: Record<
  ExchangeId,
  { label: string; className: string }
> = {
  BIN: { label: "BIN", className: "bg-[#f3ba2f]/20 text-[#f3ba2f]" },
  BINF: { label: "PERP", className: "bg-[#a78bfa]/20 text-[#a78bfa]" },
  BG: { label: "BG", className: "bg-[#00f0c0]/20 text-[#00f0c0]" },
};

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
    if (prefix === "BIN" || prefix === "BINF" || prefix === "BG") {
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
