/**
 * Acciones y ETFs de EE. UU. (Alpaca), como un exchange más del gráfico.
 *
 * Así heredan todo lo que ya existe: indicadores, temporalidades, watchlist,
 * listas guardadas y el buscador. Nada de esto le pega a Alpaca directo: todo
 * pasa por `/api/alpaca`, que es donde vive la clave.
 *
 * Diferencias con los exchanges de cripto, y por qué:
 *  · **No hay WebSocket.** El de Alpaca pide la clave para conectarse y la
 *    clave no puede bajar al navegador, así que las "suscripciones" son
 *    sondeos cada 15 s contra el proxy. El plan gratis aguanta 200 llamadas
 *    por minuto; esto usa 4 por símbolo-grupo.
 *  · **Mercado con horario.** Fuera de la rueda los datos no cambian: el
 *    sondeo sigue andando pero devuelve lo mismo, que es lo correcto.
 *  · **Feed IEX**, el del plan gratis. El volumen es solo el de ese mercado,
 *    no el consolidado; el precio sirve igual para operar el gráfico.
 *  · Las velas se piden **ajustadas por splits y dividendos** (`adjustment=all`).
 *
 * Endpoints y nombres de campo confirmados contra el SDK oficial
 * (`alpaca-py`): `/v2/stocks/bars` devuelve `{bars:{SYM:[…]}}` con
 * `t/o/h/l/c/v` (`alpaca/data/mappings.py`), `/v2/stocks/snapshots` devuelve
 * el objeto indexado por símbolo, sin envoltorio (`no_sub_key=True` en
 * `alpaca/common/rest.py`), y las temporalidades válidas salen de
 * `alpaca/data/timeframe.py`.
 */

import type {
  Candle,
  SymbolInfo,
  Ticker24h,
  Timeframe,
} from "@/lib/binance/types";
import type { ExchangeAdapter, KlineSubscription, MiniTick } from "./types";

/** Moneda en la que cotizan: todo lo de Alpaca es en dólares. */
export const MONEDA_ACCIONES = "USD";

/** Cada cuánto se vuelve a preguntar (ms). */
const SONDEO = 15_000;

/**
 * Temporalidad de la app → la de Alpaca. `3d` no existe: solo admite
 * 1Day y 1Week.
 */
const TF: Record<Timeframe, string | null> = {
  "1m": "1Min",
  "3m": "3Min",
  "5m": "5Min",
  "15m": "15Min",
  "30m": "30Min",
  "1h": "1Hour",
  "2h": "2Hour",
  "4h": "4Hour",
  "6h": "6Hour",
  "8h": "8Hour",
  "12h": "12Hour",
  "1d": "1Day",
  "3d": null,
  "1w": "1Week",
  "1M": "1Month",
};

interface BarraCruda {
  t: string;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

interface SnapshotCrudo {
  latestTrade?: { p?: number };
  dailyBar?: { o?: number; h?: number; l?: number; c?: number; v?: number };
  prevDailyBar?: { c?: number };
  minuteBar?: { c?: number };
}

const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

async function pedir<T>(params: Record<string, string>): Promise<T> {
  const url = new URL("/api/alpaca", window.location.origin);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const r = await fetch(url, { cache: "no-store" });
  const cuerpo = await r.json().catch(() => null);
  if (!r.ok) {
    const m = (cuerpo as { mensaje?: string } | null)?.mensaje;
    throw new Error(m ?? `Alpaca: error ${r.status}`);
  }
  return cuerpo as T;
}

function barraACandle(b: BarraCruda, isFinal: boolean): Candle {
  return {
    time: Math.floor(Date.parse(b.t) / 1000),
    open: b.o,
    high: b.h,
    low: b.l,
    close: b.c,
    volume: b.v,
    isFinal,
  };
}

export async function traerVelas(
  simbolo: string,
  tf: Timeframe,
  limite = 1000,
): Promise<Candle[]> {
  const alpacaTf = TF[tf];
  if (!alpacaTf) return [];
  const d = await pedir<{ bars?: Record<string, BarraCruda[]> }>({
    recurso: "barras",
    simbolo,
    tf: alpacaTf,
    limit: String(limite),
  });
  const crudas = d?.bars?.[simbolo.toUpperCase()] ?? [];
  // Se piden en orden descendente (las más nuevas primero) porque el límite
  // se aplica desde el principio del histórico: con ascendente traería las
  // 1000 velas MÁS VIEJAS que tiene Alpaca.
  return crudas
    .map((b) => barraACandle(b, true))
    .sort((a, b) => a.time - b.time);
}

function snapshotATicker(simbolo: string, s: SnapshotCrudo): Ticker24h {
  const cierreAnterior = num(s.prevDailyBar?.c);
  const ultimo =
    num(s.latestTrade?.p) ?? num(s.minuteBar?.c) ?? num(s.dailyBar?.c) ?? 0;
  // La variación es contra el cierre anterior, que es como la miden las
  // pantallas de bolsa; no hay "últimas 24 h" en un mercado con horario.
  const cambio = cierreAnterior !== null ? ultimo - cierreAnterior : 0;
  return {
    symbol: simbolo,
    lastPrice: ultimo,
    priceChange: cambio,
    priceChangePercent:
      cierreAnterior && cierreAnterior !== 0 ? (cambio / cierreAnterior) * 100 : 0,
    highPrice: num(s.dailyBar?.h) ?? ultimo,
    lowPrice: num(s.dailyBar?.l) ?? ultimo,
    volume: num(s.dailyBar?.v) ?? 0,
    quoteVolume: (num(s.dailyBar?.v) ?? 0) * ultimo,
  };
}

export async function traerCotizaciones(
  simbolos: string[],
): Promise<Ticker24h[]> {
  if (simbolos.length === 0) return [];
  const d = await pedir<Record<string, SnapshotCrudo>>({
    recurso: "cotizaciones",
    simbolos: simbolos.join(","),
  });
  const salida: Ticker24h[] = [];
  for (const s of simbolos) {
    const snap = d?.[s.toUpperCase()];
    if (snap) salida.push(snapshotATicker(s.toUpperCase(), snap));
  }
  return salida;
}

/** Catálogo de papeles. Se baja una vez por sesión y queda en memoria. */
let catalogo: SymbolInfo[] | null = null;
let cargando: Promise<SymbolInfo[]> | null = null;

export async function traerCatalogoAcciones(): Promise<SymbolInfo[]> {
  if (catalogo) return catalogo;
  cargando ??= pedir<{ activos?: Array<{ s: string; n: string }> }>({
    recurso: "catalogo",
  })
    .then((d) => {
      catalogo = (d?.activos ?? []).map((a) => ({
        symbol: a.s,
        baseAsset: a.s,
        quoteAsset: MONEDA_ACCIONES,
        status: "TRADING",
        nombre: a.n || undefined,
      }));
      return catalogo;
    })
    .finally(() => {
      cargando = null;
    });
  return cargando;
}

/**
 * Nombres de unos pocos papeles, para las filas del watchlist (el catálogo
 * completo pesa varios MB y no hace falta bajarlo para mostrar diez filas).
 */
export async function traerNombresAcciones(
  simbolos: string[],
): Promise<Record<string, string>> {
  if (simbolos.length === 0) return {};
  const d = await pedir<{ nombres?: Record<string, string> }>({
    recurso: "nombres",
    simbolos: simbolos.join(","),
  });
  return d?.nombres ?? {};
}

/**
 * Sondeo con cancelación. Corre una vez al toque y después cada `SONDEO` ms;
 * los errores se avisan una sola vez para no llenar la consola cuando el
 * mercado está cerrado o la clave no está cargada.
 */
function sondear(tarea: () => Promise<void>): () => void {
  let vivo = true;
  let avisado = false;
  const correr = async () => {
    if (!vivo) return;
    try {
      await tarea();
      avisado = false;
    } catch (e) {
      if (!avisado) {
        console.error("Alpaca:", e instanceof Error ? e.message : e);
        avisado = true;
      }
    }
  };
  void correr();
  const id = setInterval(correr, SONDEO);
  return () => {
    vivo = false;
    clearInterval(id);
  };
}

function suscribirVelas(sub: KlineSubscription): () => void {
  const alpacaTf = TF[sub.interval];
  if (!alpacaTf) return () => {};
  return sondear(async () => {
    const d = await pedir<{ bars?: Record<string, BarraCruda[]> }>({
      recurso: "barras",
      simbolo: sub.symbol,
      tf: alpacaTf,
      limit: "2",
    });
    const crudas = d?.bars?.[sub.symbol.toUpperCase()] ?? [];
    // Vienen en orden descendente: la primera es la vela en curso.
    const ultima = crudas[0];
    if (ultima) sub.onCandle(barraACandle(ultima, false));
  });
}

function suscribirCotizaciones(
  simbolos: string[],
  onTick: (t: MiniTick) => void,
): () => void {
  if (simbolos.length === 0) return () => {};
  return sondear(async () => {
    const tickers = await traerCotizaciones(simbolos);
    for (const t of tickers) {
      onTick({
        symbol: t.symbol,
        close: t.lastPrice,
        open: t.lastPrice - t.priceChange,
        pct: t.priceChangePercent,
      });
    }
  });
}

export const alpacaAccionesAdapter: ExchangeAdapter = {
  id: "ALP",
  // Corto a propósito: va en la cabecera del gráfico, al lado del símbolo.
  name: "Bolsa EE. UU.",
  supportsTimeframe: (tf) => TF[tf] !== null,
  fetchKlines: traerVelas,
  fetchTickers24h: traerCotizaciones,
  fetchSymbols: traerCatalogoAcciones,
  subscribeKline: suscribirVelas,
  subscribeMiniTickers: suscribirCotizaciones,
};
