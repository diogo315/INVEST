/**
 * Correr la estrategia sobre una lista de activos.
 *
 * Baja las tres temporalidades de cada activo, le pasa el motor y arma
 * las cuentas. El trabajo de red lo hace el navegador de Diego con los
 * adaptadores que ya tiene la app; acá solo está el orden de las cosas.
 *
 * De a UN activo por vez, a propósito: seis meses de velas de un minuto
 * son 259.200 por activo, y bajar treinta y ocho en paralelo es pedirle
 * al navegador que se quede sin memoria y al proveedor que corte por
 * exceso de peticiones.
 */

import type { Candle, Timeframe } from "@/lib/binance/types";
import { TIMEFRAME_SECONDS } from "@/lib/binance/types";
import {
  correrEstrategia,
  type ConfigEstrategia,
  type OperacionEstrategia,
} from "@/lib/estrategia/motor";
import {
  correrDosFvg,
  type ConfigDosFvg,
  type OperacionDosFvg,
} from "@/lib/estrategia/dosfvg";
import { resumir, type Resumen } from "@/lib/estrategia/estadistica";

/** Qué estrategia se corre. Son dos cosas distintas, no variantes de una. */
export type QueEstrategia = "smc" | "dosfvg";

/** La configuración de la estrategia elegida. */
export type ConfigDeEstrategia =
  | { cual: "smc"; cfg: ConfigEstrategia }
  | { cual: "dosfvg"; cfg: ConfigDosFvg };

export interface ResultadoActivo {
  simbolo: string;
  operaciones: Array<OperacionEstrategia | OperacionDosFvg>;
  resumen: Resumen;
  caducados: number;
  invalidados: number;
  /** Qué falló, si falló. */
  error?: string;
  /** Velas que de verdad se bajaron, para saber si la muestra es la pedida. */
  velas: { h4: number; m15: number; entrada: number };
}

export interface Avance {
  hecho: number;
  total: number;
  simbolo: string;
  /** En qué está: bajando datos o calculando. */
  paso: "bajando" | "calculando";
}

/** Cuántas velas hacen falta de cada temporalidad para cubrir `meses`. */
export function velasNecesarias(tf: Timeframe, meses: number): number {
  const segundos = TIMEFRAME_SECONDS[tf];
  const dias = meses * 30.44;
  return Math.ceil((dias * 86400) / segundos) + 50;
}

/**
 * Corre la estrategia sobre un activo.
 *
 * `traer` es la función que baja velas. Se pasa desde afuera para poder
 * probar esto con datos sintéticos, sin red.
 */
export async function correrUno(
  simbolo: string,
  tfEntrada: Timeframe,
  meses: number,
  elegida: ConfigDeEstrategia,
  traer: (simbolo: string, tf: Timeframe, limite: number) => Promise<Candle[]>,
): Promise<ResultadoActivo> {
  const vacio = { h4: 0, m15: 0, entrada: 0 };
  // La de los dos FVG entra en la misma vela de 15M, así que no baja una
  // tercera serie: pedirla sería tráfico al vacío.
  if (elegida.cual === "dosfvg") {
    try {
      const [h4, m15] = await Promise.all([
        traer(simbolo, "4h", velasNecesarias("4h", meses)),
        traer(simbolo, "15m", velasNecesarias("15m", meses)),
      ]);
      const velas = { h4: h4.length, m15: m15.length, entrada: m15.length };
      if (h4.length < 50 || m15.length < 200) {
        return {
          simbolo, operaciones: [], resumen: resumir([]), caducados: 0, invalidados: 0,
          error: `Datos insuficientes (${h4.length} de 4H, ${m15.length} de 15M)`,
          velas,
        };
      }
      const r = correrDosFvg(h4, m15, elegida.cfg);
      return {
        simbolo,
        operaciones: r.operaciones,
        resumen: resumir(r.operaciones.map((o) => o.erres)),
        // Los montajes que se cayeron, cada uno en su columna: acá un
        // toque de 4H se cae por no dar FVG de 15M («caducado») o por
        // darlo y que el precio nunca vuelva a él («invalidado»).
        caducados: r.sinFvg15,
        invalidados: r.sinEntrada,
        velas,
      };
    } catch (e) {
      return {
        simbolo, operaciones: [], resumen: resumir([]), caducados: 0, invalidados: 0,
        error: e instanceof Error ? e.message : "No se pudieron bajar las velas",
        velas: vacio,
      };
    }
  }
  const cfg = elegida.cfg;
  try {
    const [h4, m15, entrada] = await Promise.all([
      traer(simbolo, "4h", velasNecesarias("4h", meses)),
      traer(simbolo, "15m", velasNecesarias("15m", meses)),
      traer(simbolo, tfEntrada, velasNecesarias(tfEntrada, meses)),
    ]);
    const velas = { h4: h4.length, m15: m15.length, entrada: entrada.length };
    // Sin las tres series no hay nada que correr: mejor decirlo que
    // devolver cero operaciones como si fuera un resultado.
    if (h4.length < 50 || m15.length < 200 || entrada.length < 500) {
      return {
        simbolo, operaciones: [], resumen: resumir([]), caducados: 0, invalidados: 0,
        error: `Datos insuficientes (${h4.length} de 4H, ${m15.length} de 15M, ${entrada.length} de ${tfEntrada})`,
        velas,
      };
    }
    const r = correrEstrategia(h4, m15, entrada, TIMEFRAME_SECONDS[tfEntrada], cfg);
    return {
      simbolo,
      operaciones: r.operaciones,
      resumen: resumir(r.operaciones.map((o) => o.erres)),
      caducados: r.caducados,
      invalidados: r.invalidados,
      velas,
    };
  } catch (e) {
    return {
      simbolo, operaciones: [], resumen: resumir([]), caducados: 0, invalidados: 0,
      error: e instanceof Error ? e.message : "No se pudieron bajar las velas",
      velas: vacio,
    };
  }
}

/** Corre la estrategia sobre varios activos, uno detrás de otro. */
export async function correrVarios(
  simbolos: string[],
  tfEntrada: Timeframe,
  meses: number,
  elegida: ConfigDeEstrategia,
  traer: (simbolo: string, tf: Timeframe, limite: number) => Promise<Candle[]>,
  alAvanzar?: (a: Avance) => void,
  seguir?: () => boolean,
): Promise<ResultadoActivo[]> {
  const salida: ResultadoActivo[] = [];
  for (let i = 0; i < simbolos.length; i++) {
    if (seguir && !seguir()) break;
    alAvanzar?.({ hecho: i, total: simbolos.length, simbolo: simbolos[i], paso: "bajando" });
    const r = await correrUno(simbolos[i], tfEntrada, meses, elegida, traer);
    salida.push(r);
    alAvanzar?.({ hecho: i + 1, total: simbolos.length, simbolo: simbolos[i], paso: "calculando" });
  }
  return salida;
}

/** Las cuentas de TODO junto, que es lo único con muestra suficiente. */
export function resumenGlobal(rs: ResultadoActivo[]): Resumen {
  return resumir(rs.flatMap((r) => r.operaciones.map((o) => o.erres)));
}
