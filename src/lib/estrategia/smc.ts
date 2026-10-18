/**
 * Las piezas de la estrategia SMC: swings, desequilibrios y estructura.
 *
 * Esto es el vocabulario de la estrategia de la foto —4H para el
 * contexto, 15M para la confirmación, 1M/5M para la entrada— escrito como
 * funciones puras y sin nada de dibujo.
 *
 * LA REGLA QUE MANDA ACÁ: nada puede saberse antes de tiempo. Un swing
 * alto necesita `k` velas DESPUÉS para confirmarse, así que no existe
 * hasta la vela `i + k`; un desequilibrio existe en la vela que lo cierra
 * y no antes. Cada función lleva ese "cuándo se supo" encima, y el motor
 * solo puede leer lo que ya se sabía. Sin eso, un backtest de esta
 * estrategia da números preciosos y falsos.
 *
 * Sin imports salvo el tipo de vela:
 *   node --experimental-strip-types scripts/verificar-smc.mjs
 */

import type { Candle } from "@/lib/binance/types";

// ───────────────────────────── swings ─────────────────────────────

export interface Swing {
  /** Índice de la vela del pivote. */
  i: number;
  time: number;
  precio: number;
  tipo: "alto" | "bajo";
  /**
   * Índice a partir del cual este swing SE SABE.
   *
   * Un pivote necesita `k` velas a cada lado: hasta que no cierran las
   * `k` de la derecha, nadie puede afirmar que era un pivote. Es
   * exactamente `i + k`, y el motor no puede usarlo antes.
   */
  confirmadoEn: number;
}

/**
 * Los pivotes de la serie: máximos y mínimos locales con `k` velas a
 * cada lado.
 *
 * Los empates se resuelven por la izquierda (`>` hacia atrás, `>=` hacia
 * adelante) para que una meseta no produzca dos pivotes pegados.
 */
export function swings(velas: Candle[], k = 2): Swing[] {
  const salida: Swing[] = [];
  if (k < 1 || velas.length < k * 2 + 1) return salida;
  for (let i = k; i < velas.length - k; i++) {
    let alto = true;
    let bajo = true;
    for (let j = 1; j <= k; j++) {
      if (velas[i].high <= velas[i - j].high || velas[i].high < velas[i + j].high) alto = false;
      if (velas[i].low >= velas[i - j].low || velas[i].low > velas[i + j].low) bajo = false;
      if (!alto && !bajo) break;
    }
    if (alto) {
      salida.push({ i, time: velas[i].time, precio: velas[i].high, tipo: "alto", confirmadoEn: i + k });
    }
    if (bajo) {
      salida.push({ i, time: velas[i].time, precio: velas[i].low, tipo: "bajo", confirmadoEn: i + k });
    }
  }
  return salida;
}

/**
 * El último swing de un tipo que ya se sabía en la vela `hasta`.
 *
 * Filtra por `confirmadoEn`, no por `i`: ahí está toda la diferencia
 * entre un backtest honesto y uno que hace trampa.
 */
export function ultimoSwing(
  lista: Swing[],
  tipo: "alto" | "bajo",
  hasta: number,
): Swing | null {
  for (let x = lista.length - 1; x >= 0; x--) {
    const s = lista[x];
    if (s.tipo === tipo && s.confirmadoEn <= hasta) return s;
  }
  return null;
}

// ────────────────────────── desequilibrios ─────────────────────────

export interface Desequilibrio {
  /** Vela que CIERRA el patrón de tres: desde acá se sabe. */
  i: number;
  time: number;
  /** Borde de abajo de la zona. */
  piso: number;
  /** Borde de arriba. */
  techo: number;
  alcista: boolean;
}

/**
 * Los desequilibrios (FVG) de la serie.
 *
 * Un hueco alcista es tres velas donde el mínimo de la tercera queda por
 * ENCIMA del máximo de la primera: el precio pasó tan rápido que dejó un
 * tramo sin negociar. La zona es ese tramo, y es a donde se espera que
 * el precio vuelva. El bajista es el espejo.
 */
export function desequilibrios(velas: Candle[]): Desequilibrio[] {
  const salida: Desequilibrio[] = [];
  for (let i = 2; i < velas.length; i++) {
    const a = velas[i - 2];
    const c = velas[i];
    if (c.low > a.high) {
      salida.push({ i, time: c.time, piso: a.high, techo: c.low, alcista: true });
    } else if (c.high < a.low) {
      salida.push({ i, time: c.time, piso: c.high, techo: a.low, alcista: false });
    }
  }
  return salida;
}

/**
 * ¿Se rellenó el hueco entre su vela y `hasta` (inclusive)?
 *
 * Un desequilibrio ya recorrido dejó de ser una zona interesante: las
 * órdenes que estaban ahí sin llenar, se llenaron.
 */
export function mitigado(
  d: Desequilibrio,
  velas: Candle[],
  hasta: number,
  completo = false,
): boolean {
  const tope = Math.min(hasta, velas.length - 1);
  for (let i = d.i + 1; i <= tope; i++) {
    if (d.alcista) {
      // Alcista: el precio baja a buscarlo. Tocarlo ya cuenta; rellenarlo
      // del todo es pasar por debajo del piso.
      if (completo ? velas[i].low <= d.piso : velas[i].low <= d.techo) return true;
    } else {
      if (completo ? velas[i].high >= d.techo : velas[i].high >= d.piso) return true;
    }
  }
  return false;
}

// ─────────────────────── búsqueda por tiempo ───────────────────────

/**
 * Último índice cuya vela ya había CERRADO en el momento `t`.
 *
 * Es lo que conecta las tres temporalidades sin colar futuro: parado en
 * una vela de 5M a las 10:07, la vela de 4H de las 08:00 todavía está
 * abierta y no se puede usar su cierre. Se usa la de las 04:00.
 */
export function indiceCerrado(velas: Candle[], t: number, segundos: number): number {
  let lo = 0;
  let hi = velas.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (velas[mid].time + segundos <= t) lo = mid + 1;
    else hi = mid;
  }
  return lo - 1;
}

// ───────────────────────────── estructura ──────────────────────────

/**
 * El POI que originó el impulso que rompió `altoRoto`.
 *
 * Es la pieza más discrecional de la estrategia: "el último POI que
 * rompió el máximo previo". Acá se congelan DOS definiciones y el motor
 * elige por parámetro, porque dos personas marcan cosas distintas y el
 * backtest mide la que se elija, no "la estrategia".
 *
 *  · "vela"  — la última vela bajista antes del impulso (el order block
 *              clásico): su rango es la zona.
 *  · "hueco" — el desequilibrio alcista que dejó el propio impulso.
 *
 * Se busca hacia atrás desde la vela que rompió, sin pasar del mínimo
 * que arrancó el movimiento.
 */
export function poiDelImpulso(
  velas: Candle[],
  iRuptura: number,
  iMinimo: number,
  modo: "vela" | "hueco",
): { piso: number; techo: number; i: number } | null {
  if (iRuptura <= iMinimo || iMinimo < 0) return null;
  if (modo === "hueco") {
    // El último hueco alcista dentro del tramo del impulso.
    for (let i = iRuptura; i > iMinimo + 1; i--) {
      const a = velas[i - 2];
      const c = velas[i];
      if (a && c && c.low > a.high) return { piso: a.high, techo: c.low, i };
    }
    return null;
  }
  // `>=` y no `>`: el impulso ARRANCA en la vela del mínimo, así que esa
  // vela también puede ser el order block.
  for (let i = iRuptura; i >= iMinimo; i--) {
    const v = velas[i];
    if (v.close < v.open) return { piso: v.low, techo: v.high, i };
  }
  return null;
}
