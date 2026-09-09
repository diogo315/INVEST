import type { Candle, Timeframe } from "./types";

/**
 * Caché de velas en localStorage para pintar el chart al instante al abrir
 * la app, sin esperar el round-trip a Binance/Bitget.
 *
 * Flujo: al montar se pinta lo cacheado (si hay) y en paralelo sale el fetch
 * real, que reemplaza los datos apenas llega. El usuario ve velas en el
 * primer frame en vez de un panel vacío.
 *
 * Formato compacto (arrays posicionales, no objetos) para que entre cómodo
 * en la cuota de localStorage: ~35 KB por símbolo/timeframe.
 */

const PREFIX = "tv-gratis-candles:";
const INDEX_KEY = "tv-gratis-candles-index";
/** Cuántas velas guardamos. Alcanzan para llenar la pantalla inicial. */
const MAX_CANDLES = 400;
/** Cuántas combinaciones símbolo/TF mantenemos antes de descartar la más vieja. */
const MAX_ENTRIES = 8;
/** Más viejo que esto no se pinta: mejor panel vacío que precios engañosos. */
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

type Packed = [number, number, number, number, number, number];

function keyFor(symbol: string, timeframe: Timeframe): string {
  return `${PREFIX}${symbol.toUpperCase()}|${timeframe}`;
}

function readIndex(): string[] {
  try {
    const raw = localStorage.getItem(INDEX_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function touchIndex(key: string): void {
  try {
    const idx = readIndex().filter((k) => k !== key);
    idx.push(key);
    while (idx.length > MAX_ENTRIES) {
      const drop = idx.shift();
      if (drop) localStorage.removeItem(drop);
    }
    localStorage.setItem(INDEX_KEY, JSON.stringify(idx));
  } catch {
    /* cuota llena o storage deshabilitado: seguimos sin caché */
  }
}

export function readCandleCache(
  symbol: string,
  timeframe: Timeframe,
): Candle[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(keyFor(symbol, timeframe));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { t: number; c: Packed[] };
    if (!parsed?.c?.length) return null;
    if (Date.now() - parsed.t > MAX_AGE_MS) return null;
    return parsed.c.map(([time, open, high, low, close, volume]) => ({
      time,
      open,
      high,
      low,
      close,
      volume,
      isFinal: true,
    }));
  } catch {
    return null;
  }
}

export function writeCandleCache(
  symbol: string,
  timeframe: Timeframe,
  candles: Candle[],
): void {
  if (typeof window === "undefined" || candles.length === 0) return;
  const key = keyFor(symbol, timeframe);
  const slice = candles.slice(-MAX_CANDLES);
  const packed: Packed[] = slice.map((k) => [
    k.time,
    k.open,
    k.high,
    k.low,
    k.close,
    k.volume,
  ]);
  try {
    localStorage.setItem(key, JSON.stringify({ t: Date.now(), c: packed }));
    touchIndex(key);
  } catch {
    // Cuota llena: limpiamos todo lo nuestro y reintentamos una vez.
    try {
      for (const k of readIndex()) localStorage.removeItem(k);
      localStorage.removeItem(INDEX_KEY);
      localStorage.setItem(key, JSON.stringify({ t: Date.now(), c: packed }));
      touchIndex(key);
    } catch {
      /* nos rendimos en silencio: la caché es un extra, no un requisito */
    }
  }
}
