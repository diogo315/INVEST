/**
 * Ranking del buscador de activos.
 *
 * Está separado del componente para poder probarlo solo:
 *   node --experimental-strip-types scripts/verificar-buscador.mjs
 */

import type { ExchangeId } from "./types";
// Los atajos en español y sus advertencias viven en macro.ts, que es
// donde se puede leer qué significa cada uno sin pasar por el ranking.
import { atajosDe } from "./macro";

/** Clase de activo, para los filtros del buscador. */
export type ClaseActivo = "cripto" | "accion";

export const CLASE_MERCADO: Record<ExchangeId, ClaseActivo> = {
  BIN: "cripto",
  BINF: "cripto",
  BG: "cripto",
  ALP: "accion",
};

export interface ActivoBuscable {
  /** Símbolo con exchange: "BIN:BTCUSDT". */
  qualified: string;
  exchange: ExchangeId;
  /** Símbolo del exchange: "BTCUSDT". */
  symbol: string;
  /** Moneda: "BTC". */
  base: string;
  /** Moneda de cotización: "USDT". */
  quote: string;
  /** Nombre del activo, si lo tenemos: "Bitcoin". */
  nombre: string | null;
}

/** Chips de mercado del buscador. */
export type FiltroTipo = "TODOS" | "SPOT" | "PERP" | "BOLSA";

/** Los perpetuos son el único mercado de derivados que trae la app. */
export const ES_PERPETUO: Record<ExchangeId, boolean> = {
  BIN: false,
  BINF: true,
  BG: false,
  ALP: false,
};

/** A qué chip de mercado corresponde cada exchange. */
function tipoDe(exchange: ExchangeId): Exclude<FiltroTipo, "TODOS"> {
  if (CLASE_MERCADO[exchange] === "accion") return "BOLSA";
  return ES_PERPETUO[exchange] ? "PERP" : "SPOT";
}

/**
 * Qué par se muestra primero cuando una moneda cotiza contra varias. USDT es
 * el que tiene liquidez y el que usa el resto de la app.
 */
const PRIORIDAD_QUOTE = ["USD", "USDT", "FDUSD", "USDC", "BTC", "ETH", "BNB"];

/** Orden de los exchanges cuando todo lo demás empata. */
const PRIORIDAD_EXCHANGE: ExchangeId[] = ["BIN", "BINF", "BG", "ALP"];

/**
 * Monedas que van arriba en la lista inicial, cuando todavía no se escribió
 * nada. Es el equivalente a los "populares" de TradingView.
 */
const POPULARES = [
  "BTC", "ETH", "SOL", "BNB", "XRP", "DOGE", "ADA", "AVAX", "LINK", "DOT",
  "MATIC", "POL", "TRX", "TON", "LTC", "BCH", "NEAR", "APT", "SUI", "ARB",
  "OP", "INJ", "TIA", "SEI", "ATOM", "FIL", "ICP", "HBAR", "RUNE", "UNI",
  "AAVE", "PEPE", "SHIB", "WIF", "BONK", "ORDI", "STX", "RENDER", "FET", "TAO",
  // Bolsa: los papeles y ETFs que uno quiere ver sin escribir nada.
  "SPY", "QQQ", "AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "META", "TSLA", "GLD",
  "SLV", "USO", "DIA", "IWM", "VTI",
];

/**
 * Atajos en español para lo que no se llama como uno lo busca. Alpaca
 * devuelve los nombres en inglés ("SPDR Gold Shares"), así que escribir
 * "oro" no encontraría nada. La clave se compara con la consulta entera,
 * sin tildes, para no ensuciar los resultados de búsquedas normales.
 */

function indiceO(lista: readonly string[], v: string, porDefecto: number) {
  const i = lista.indexOf(v);
  return i === -1 ? porDefecto : i;
}

/** Desempate estable dentro de un mismo nivel de coincidencia. */
function comparar(a: ActivoBuscable, b: ActivoBuscable): number {
  return (
    indiceO(PRIORIDAD_QUOTE, a.quote, PRIORIDAD_QUOTE.length) -
      indiceO(PRIORIDAD_QUOTE, b.quote, PRIORIDAD_QUOTE.length) ||
    PRIORIDAD_EXCHANGE.indexOf(a.exchange) -
      PRIORIDAD_EXCHANGE.indexOf(b.exchange) ||
    a.base.length - b.base.length ||
    a.symbol.localeCompare(b.symbol)
  );
}

/** Orden de la lista inicial: primero las conocidas, después alfabético. */
function compararSinConsulta(a: ActivoBuscable, b: ActivoBuscable): number {
  return (
    indiceO(POPULARES, a.base, POPULARES.length) -
      indiceO(POPULARES, b.base, POPULARES.length) || comparar(a, b)
  );
}

export interface OpcionesBusqueda {
  exchange?: ExchangeId | "TODOS";
  tipo?: FiltroTipo;
  limite?: number;
}

/**
 * Ordena por qué tan directo es el acierto, de más a menos:
 *   0. un atajo en español                      (oro → GLD)
 *   1. la moneda es exactamente lo escrito      (BTC → BTC/USDT)
 *   2. el símbolo completo es lo escrito        (BTCUSDT)
 *   3. el nombre es exactamente lo escrito      (bitcoin → Bitcoin, no Bitcoin Cash)
 *   4. la moneda empieza con lo escrito         (BT → BTC, BTT)
 *   5. el nombre empieza con lo escrito         (bitc → Bitcoin)
 *   6. el nombre o el símbolo lo contienen      (coin → Dogecoin)
 *
 * Dentro de cada nivel gana el par en USDT, después el exchange spot, y
 * después el ticker más corto: en la práctica, el papel principal.
 */
export function rankearSimbolos(
  activos: ActivoBuscable[],
  consulta: string,
  opciones: OpcionesBusqueda = {},
): ActivoBuscable[] {
  const { exchange = "TODOS", tipo = "TODOS", limite = 150 } = opciones;

  let base = activos;
  if (exchange !== "TODOS") base = base.filter((a) => a.exchange === exchange);
  if (tipo !== "TODOS") base = base.filter((a) => tipoDe(a.exchange) === tipo);

  const t = consulta.trim().toUpperCase();
  if (!t) return [...base].sort(compararSinConsulta).slice(0, limite);

  // Prioridad declarada por el concepto: posición en la lista.
  const atajos = new Map(atajosDe(consulta).map((sym, i) => [sym, i]));
  const niveles: ActivoBuscable[][] = [[], [], [], [], [], [], []];
  for (const a of base) {
    const nombre = a.nombre?.toUpperCase() ?? "";
    if (atajos.has(a.base)) niveles[0].push(a);
    else if (a.base === t) niveles[1].push(a);
    else if (a.symbol === t || a.qualified.toUpperCase() === t)
      niveles[2].push(a);
    // El nombre exacto va antes que el que solo empieza igual, si no
    // "bitcoin" devuelve Bitcoin Cash primero por orden alfabético.
    else if (nombre === t) niveles[3].push(a);
    else if (a.base.startsWith(t)) niveles[4].push(a);
    else if (nombre.startsWith(t)) niveles[5].push(a);
    else if (a.symbol.includes(t) || nombre.includes(t)) niveles[6].push(a);
  }

  // El nivel de los atajos se ordena por la prioridad del concepto, no
  // por el desempate genérico: ahí «el mejor primero» es información que
  // puso una persona, y el alfabético la pisaba.
  niveles[0].sort(
    (a, b) =>
      (atajos.get(a.base) ?? 99) - (atajos.get(b.base) ?? 99) || comparar(a, b),
  );

  const salida: ActivoBuscable[] = [];
  for (const [i, nivel] of niveles.entries()) {
    if (salida.length >= limite) break;
    salida.push(
      ...(i === 0 ? nivel : nivel.sort(comparar)).slice(0, limite - salida.length),
    );
  }
  return salida;
}
