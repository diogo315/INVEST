/**
 * Nombres de los activos: BTC → Bitcoin.
 *
 * El diccionario está en el repo (`src/lib/data/nombres-cripto.json`) en vez
 * de pedirse a una API: así el buscador muestra los nombres al instante, sin
 * una llamada más ni una dependencia que se pueda caer. Para refrescarlo o
 * ampliarlo:
 *
 *   node scripts/actualizar-nombres.mjs
 *
 * Lo que no está en el diccionario no inventa nada: se muestra solo el
 * ticker.
 */

import crudo from "@/lib/data/nombres-cripto.json";
import { CLASE_MERCADO } from "./buscar";
import type { ExchangeId } from "./types";

const NOMBRES = crudo as Record<string, string>;

/** Nombre del activo, o null si no lo tenemos. */
export function nombreDeActivo(base: string): string | null {
  return NOMBRES[base.toUpperCase()] ?? null;
}

/** Cuántos activos tiene el diccionario (para las pruebas). */
export const TOTAL_NOMBRES = Object.keys(NOMBRES).length;

/**
 * Descripción de un par, como la muestra TradingView debajo del símbolo:
 * "Bitcoin / TetherUS". Si falta algún nombre se usa el ticker.
 */
export function descripcionPar(base: string, cotizacion: string): string {
  return `${nombreDeActivo(base) ?? base} / ${nombreDeActivo(cotizacion) ?? cotizacion}`;
}

/** Cómo se llama el mercado de cada exchange, en español. */
export const TIPO_MERCADO: Record<ExchangeId, string> = {
  BIN: "spot cripto",
  BINF: "perpetuo cripto",
  BG: "spot cripto",
  ALP: "acción · ETF",
};

/** Nombre largo del exchange para la columna derecha del buscador. */
export const NOMBRE_EXCHANGE: Record<ExchangeId, string> = {
  BIN: "Binance",
  BINF: "Binance Futuros",
  BG: "Bitget",
  ALP: "Bolsa EE. UU.",
};

/**
 * Nombres de acciones y ETFs que se van conociendo (del catálogo de Alpaca o
 * de la consulta puntual del watchlist). El diccionario de cripto es fijo y
 * está en el repo; este se llena en caliente.
 */
const nombresBolsa = new Map<string, string>();

export function recordarNombres(nuevos: Record<string, string>): void {
  for (const [sim, nombre] of Object.entries(nuevos)) {
    if (nombre) nombresBolsa.set(sim.toUpperCase(), nombre);
  }
}

export function nombreDeAccion(simbolo: string): string | null {
  return nombresBolsa.get(simbolo.toUpperCase()) ?? null;
}

/** Nombre de cualquier activo, sea cripto o papel de bolsa. */
export function nombreDeSimbolo(
  exchange: ExchangeId,
  base: string,
): string | null {
  return CLASE_MERCADO[exchange] === "accion"
    ? nombreDeAccion(base)
    : nombreDeActivo(base);
}
