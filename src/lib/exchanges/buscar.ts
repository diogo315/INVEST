/**
 * Ranking del buscador de activos.
 *
 * Está separado del componente para poder probarlo solo:
 *   node --experimental-strip-types scripts/verificar-buscador.mjs
 */

import type { ExchangeId } from "./types";

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

/** Spot y perpetuos, para los chips del buscador. */
export type FiltroTipo = "TODOS" | "SPOT" | "PERP";

/** Los perpetuos son el único mercado de derivados que trae la app. */
export const ES_PERPETUO: Record<ExchangeId, boolean> = {
  BIN: false,
  BINF: true,
  BG: false,
};

/**
 * Qué par se muestra primero cuando una moneda cotiza contra varias. USDT es
 * el que tiene liquidez y el que usa el resto de la app.
 */
const PRIORIDAD_QUOTE = ["USDT", "FDUSD", "USDC", "BTC", "ETH", "BNB"];

/** Orden de los exchanges cuando todo lo demás empata. */
const PRIORIDAD_EXCHANGE: ExchangeId[] = ["BIN", "BINF", "BG"];

/**
 * Monedas que van arriba en la lista inicial, cuando todavía no se escribió
 * nada. Es el equivalente a los "populares" de TradingView.
 */
const POPULARES = [
  "BTC", "ETH", "SOL", "BNB", "XRP", "DOGE", "ADA", "AVAX", "LINK", "DOT",
  "MATIC", "POL", "TRX", "TON", "LTC", "BCH", "NEAR", "APT", "SUI", "ARB",
  "OP", "INJ", "TIA", "SEI", "ATOM", "FIL", "ICP", "HBAR", "RUNE", "UNI",
  "AAVE", "PEPE", "SHIB", "WIF", "BONK", "ORDI", "STX", "RENDER", "FET", "TAO",
];

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
  if (tipo !== "TODOS") {
    const quiero = tipo === "PERP";
    base = base.filter((a) => ES_PERPETUO[a.exchange] === quiero);
  }

  const t = consulta.trim().toUpperCase();
  if (!t) return [...base].sort(compararSinConsulta).slice(0, limite);

  const niveles: ActivoBuscable[][] = [[], [], [], [], [], []];
  for (const a of base) {
    const nombre = a.nombre?.toUpperCase() ?? "";
    if (a.base === t) niveles[0].push(a);
    else if (a.symbol === t || a.qualified.toUpperCase() === t)
      niveles[1].push(a);
    // El nombre exacto va antes que el que solo empieza igual, si no
    // "bitcoin" devuelve Bitcoin Cash primero por orden alfabético.
    else if (nombre === t) niveles[2].push(a);
    else if (a.base.startsWith(t)) niveles[3].push(a);
    else if (nombre.startsWith(t)) niveles[4].push(a);
    else if (a.symbol.includes(t) || nombre.includes(t)) niveles[5].push(a);
  }

  const salida: ActivoBuscable[] = [];
  for (const nivel of niveles) {
    if (salida.length >= limite) break;
    salida.push(...nivel.sort(comparar).slice(0, limite - salida.length));
  }
  return salida;
}
