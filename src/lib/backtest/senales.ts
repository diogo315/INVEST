/**
 * Las señales del Cipher B, calculadas en un solo lugar.
 *
 * POR QUÉ ESTÁ APARTE. Dos cosas distintas necesitan saber cuándo hay una
 * señal: el indicador, para pintar el punto, y el reproductor, para
 * frenarse en esa vela. Si cada uno la calculara por su cuenta, tarde o
 * temprano discreparían —basta que alguien toque un umbral en un sitio y
 * no en el otro— y el backtest se pararía donde no hay punto, o peor, no
 * se pararía donde sí lo hay. Acá se calculan una vez y las dos leen de
 * la misma lista.
 *
 * Sin imports salvo los tipos y las fórmulas, para poder probarlo suelto:
 *   node --experimental-strip-types scripts/verificar-senales.mjs
 */

import { rsi, wavetrend } from "@/lib/indicators";
import type { IndicatorConfig } from "@/lib/store/chart-store";
import type { Candle } from "@/lib/binance/types";

/** Qué clase de señal es. El orden es de más fuerte a más floja. */
export type TipoSenal = "oro" | "compra" | "venta" | "cruceArriba" | "cruceAbajo";

export interface Senal {
  tipo: TipoSenal;
  /** Vela en la que se confirma. */
  time: number;
  /** Valor de la onda ahí: es dónde va el punto. */
  valor: number;
}

/** Nombre para mostrar. */
export const NOMBRE_SENAL: Record<TipoSenal, string> = {
  oro: "Punto de oro",
  compra: "Compra",
  venta: "Venta",
  cruceArriba: "Cruce al alza",
  cruceAbajo: "Cruce a la baja",
};

/**
 * Todas las señales del Cipher B en las velas que se le pasen.
 *
 * CRÍTICO, igual que en los indicadores: `velas` son SOLO las que el
 * backtest ya vivió. Pasarle la serie entera haría que el reproductor se
 * frenara en señales del futuro, que es justo lo que no puede pasar.
 */
export function senalesCipher(velas: Candle[], c: IndicatorConfig): Senal[] {
  const w = wavetrend(velas, c.wtChannelLen, c.wtAverageLen, c.wtMALen);
  const r = rsi(velas, c.cipherRsiLen);
  const rsiEn = new Map(r.map((p) => [p.time, p.value]));
  const salida: Senal[] = [];

  for (let i = 1; i < w.length; i++) {
    const a = w[i - 1];
    const b = w[i];
    const haciaArriba = a.wt1 <= a.wt2 && b.wt1 > b.wt2;
    const haciaAbajo = a.wt1 >= a.wt2 && b.wt1 < b.wt2;
    if (!haciaArriba && !haciaAbajo) continue;

    // Punto de oro: cruce al alza saliendo del extremo de sobreventa, con
    // el RSI hundido por debajo de 30. Es la señal fuerte del Cipher B y
    // la que Diego mira: sale pocas veces y marca los suelos.
    const rsiAca = rsiEn.get(b.time);
    if (
      haciaArriba &&
      rsiAca !== undefined &&
      rsiAca < 30 &&
      a.wt2 <= c.wtOsLevel3 &&
      b.wt2 - a.wt2 >= 0 &&
      b.wt2 > c.wtOsLevel3 - 5
    ) {
      salida.push({ tipo: "oro", time: b.time, valor: b.wt2 });
      continue;
    }
    if (haciaArriba && b.wt2 <= c.wtOsLevel) {
      salida.push({ tipo: "compra", time: b.time, valor: b.wt2 });
    } else if (haciaAbajo && b.wt2 >= c.wtObLevel) {
      salida.push({ tipo: "venta", time: b.time, valor: b.wt2 });
    } else {
      salida.push({
        tipo: haciaArriba ? "cruceArriba" : "cruceAbajo",
        time: b.time,
        valor: b.wt2,
      });
    }
  }
  return salida;
}

/** Solo los momentos de un tipo, para preguntar rápido por fecha. */
export function tiemposDe(senales: Senal[], tipo: TipoSenal): Set<number> {
  const s = new Set<number>();
  for (const x of senales) if (x.tipo === tipo) s.add(x.time);
  return s;
}
