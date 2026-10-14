/**
 * Dos gráficas de distinta temporalidad en el mismo backtest, sin futuro.
 *
 * EL PROBLEMA. El reloj del backtest avanza vela a vela de la gráfica
 * BASE. Si la otra gráfica es más gruesa —base 1h, segunda 1d— la vela
 * diaria que contiene al reloj ya trae el OHLC del día ENTERO: el máximo
 * de la tarde, el cierre. Dibujarla sería mostrar el futuro, y con eso el
 * backtest no vale nada: uno "decide" viendo lo que todavía no pasó.
 *
 * LA REGLA. Con el reloj en `tiempo` y la base en velas de `segundosBase`,
 * lo que se sabe llega hasta `tiempo + segundosBase` (el cierre de la vela
 * base actual). Es la convención que el backtest ya tenía con una sola
 * gráfica: parado en una vela, se ve esa vela completa. Entonces, para
 * cualquier panel:
 *
 *   - las velas que cierran dentro del horizonte van tal cual;
 *   - la que lo cruza se arma a mano con las velas finas de la base, que
 *     sí están dentro;
 *   - si no hay con qué armarla (el panel es más fino que la base), no se
 *     dibuja.
 *
 * Sin imports de la app salvo el tipo de vela:
 *   node --experimental-strip-types scripts/verificar-multi.mjs
 */

import type { Candle } from "@/lib/binance/types";

/** Las temporalidades que ofrece el backtesting, de más fina a más gruesa. */
export const TEMPORALIDADES_BT = ["5m", "15m", "1h", "4h", "1d", "1w"] as const;

/**
 * Con qué temporalidad arranca la segunda gráfica.
 *
 * Un escalón MÁS GRUESA que la primera: mirar dos temporalidades es casi
 * siempre buscar el contexto de arriba para una entrada de abajo. Si la
 * primera ya es la más gruesa, se va para el otro lado.
 */
export function otraTemporalidad(tf: string): string {
  const i = TEMPORALIDADES_BT.indexOf(tf as (typeof TEMPORALIDADES_BT)[number]);
  if (i < 0) return "1d";
  return TEMPORALIDADES_BT[i + 1] ?? TEMPORALIDADES_BT[i - 1] ?? tf;
}

/**
 * Último índice + 1 de las velas que cierran en o antes de `fin`.
 *
 * Búsqueda binaria: las series largas (cinco años en 5m) se recorren en
 * cada vela del reproductor y un `filter` ahí se nota.
 */
function cuantasCierranHasta(velas: Candle[], fin: number, segundos: number): number {
  let lo = 0;
  let hi = velas.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (velas[mid].time + segundos <= fin) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Primer índice con `time >= t`. */
function desdeTiempo(velas: Candle[], t: number): number {
  let lo = 0;
  let hi = velas.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (velas[mid].time < t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * La vela en curso, armada con las finas que caen en [inicio, fin).
 *
 * Es lo que hace TradingView con la vela que todavía no cerró: apertura la
 * primera, cierre la última, máximo y mínimo lo que haya pasado hasta
 * ahora. Nada de lo que viene después del horizonte entra acá.
 */
export function armarParcial(
  finas: Candle[],
  inicio: number,
  fin: number,
  time = inicio,
): Candle | null {
  const i0 = desdeTiempo(finas, inicio);
  if (i0 >= finas.length || finas[i0].time >= fin) return null;
  let high = finas[i0].high;
  let low = finas[i0].low;
  let close = finas[i0].close;
  let volume = finas[i0].volume;
  for (let i = i0 + 1; i < finas.length && finas[i].time < fin; i++) {
    if (finas[i].high > high) high = finas[i].high;
    if (finas[i].low < low) low = finas[i].low;
    close = finas[i].close;
    volume += finas[i].volume;
  }
  return { time, open: finas[i0].open, high, low, close, volume };
}

/**
 * Las velas que un panel puede mostrar con el reloj donde está.
 *
 * `base` es la gráfica que manda el reproductor: su temporalidad fija el
 * horizonte y sus velas son las finas con las que se arma la parcial.
 */
export function velasDelPanel(
  velas: Candle[],
  segundos: number,
  tiempo: number,
  base: { velas: Candle[]; segundos: number },
): Candle[] {
  if (velas.length === 0) return [];
  const fin = tiempo + base.segundos;
  const n = cuantasCierranHasta(velas, fin, segundos);
  const cerradas = velas.slice(0, n);
  const curso = velas[n];
  // No hay vela a medio hacer, o la que sigue arranca después del
  // horizonte: lo cerrado es todo lo que se sabe.
  if (!curso || curso.time >= fin) return cerradas;
  // El panel es igual o más fino que la base: no hay nada más fino con qué
  // completar esa vela, así que no se dibuja a medias.
  if (base.segundos >= segundos) return cerradas;
  const parcial = armarParcial(base.velas, curso.time, fin);
  return parcial ? [...cerradas, parcial] : cerradas;
}
