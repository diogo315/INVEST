/**
 * Cadena de opciones reconstruida para una fecha pasada.
 *
 * POR QUÉ ES NECESARIO: no hay de dónde bajar la cadena real de una fecha
 * pasada. El endpoint de Alpaca que usa la app
 * (`/v1beta1/options/snapshots`) es un *snapshot*: devuelve la cadena de
 * hoy y no acepta fecha. El histórico de OPRA es de pago y de otro
 * proveedor. Así que acá se **reconstruye**: los strikes y vencimientos
 * siguen las reglas reales del mercado de EE. UU., y el precio sale de
 * Black-Scholes con el precio real del subyacente ese día y la
 * volatilidad realizada de la propia serie hasta ese día.
 *
 * QUÉ SIGNIFICA ESO: los precios son **modelados, no cotizaciones**. Son
 * razonables para practicar y para medir si una idea direccional tenía
 * sentido; no reproducen el diferencial de compra-venta, el sesgo de
 * volatilidad por strike (el *smile*), ni el salto de volatilidad antes de
 * un reporte de resultados. Un backtest de venta de primas saldrá mejor de
 * lo que habría salido en la realidad, porque acá no se paga el spread.
 *
 * Sin imports salvo Black-Scholes, que tampoco tiene ninguno:
 *   node --experimental-strip-types scripts/verificar-cadena.mjs
 */

import { griegasBS, type TipoOpcion } from "@/lib/options/black-scholes";

const DIA = 86400;
/** Un contrato de opciones de EE. UU. son 100 acciones. */
export const MULTIPLICADOR = 100;

export interface VelaMin {
  time: number;
  close: number;
}

/**
 * Volatilidad anualizada de los últimos `periodo` rendimientos, hasta
 * `hasta` inclusive.
 *
 * Es la volatilidad *realizada*: lo que el papel de verdad se movió. La
 * implícita real suele estar algo por encima, así que esto tiende a
 * abaratar las opciones. Se usa igual porque es el único dato honesto que
 * se puede sacar de la serie sin inventar nada.
 */
export function volRealizada(
  velas: VelaMin[],
  hasta: number,
  periodo = 20,
  segundosPorVela = DIA,
): number {
  const hastaIdx = indiceHasta(velas, hasta);
  const desde = Math.max(1, hastaIdx - periodo + 1);
  const r: number[] = [];
  for (let i = desde; i <= hastaIdx; i++) {
    const a = velas[i - 1]?.close;
    const b = velas[i]?.close;
    if (a > 0 && b > 0) r.push(Math.log(b / a));
  }
  if (r.length < 2) return 0.3;
  const media = r.reduce((s, x) => s + x, 0) / r.length;
  const varianza =
    r.reduce((s, x) => s + (x - media) ** 2, 0) / (r.length - 1);
  // De volatilidad por vela a volatilidad anual.
  const velasPorAño = (365 * DIA) / segundosPorVela;
  const anual = Math.sqrt(varianza) * Math.sqrt(velasPorAño);
  // Un papel quieto daría cero y entonces toda opción valdría su
  // intrínseco: se acota a un rango que existe en el mercado real.
  return Math.min(3, Math.max(0.05, anual));
}

/** Índice de la última vela con tiempo <= `hasta`. */
export function indiceHasta(velas: VelaMin[], hasta: number): number {
  if (velas.length === 0) return 0;
  let lo = 0;
  let hi = velas.length - 1;
  if (velas[0].time > hasta) return 0;
  while (lo < hi) {
    const m = Math.ceil((lo + hi) / 2);
    if (velas[m].time <= hasta) lo = m;
    else hi = m - 1;
  }
  return lo;
}

/** Los saltos entre strikes que existen de verdad en el mercado. */
export const PASOS_STRIKE = [0.5, 1, 2.5, 5, 10, 25] as const;

/**
 * Separación entre strikes.
 *
 * NO hay una regla única: cada papel tiene la suya y además cambia por
 * vencimiento. Lo que sí es cierto hoy es que los nombres que de verdad
 * se operan —SPY, QQQ, las megacap— cotizan de 1 en 1 sin importar que
 * valgan 70 o 760, y los baratos de 0,50. La tabla vieja (10 en 10 por
 * encima de 250) era la convención antigua y daba cadenas falsas: a SPY
 * en 763 le ponía 760 y 770 cuando existen 761, 762, 763…
 *
 * Como no se puede consultar la lista real de strikes de una fecha
 * pasada, esto es un valor por defecto razonable y el panel deja
 * cambiarlo a mano.
 */
export function pasoDeStrike(precio: number): number {
  if (precio < 25) return 0.5;
  if (precio < 1000) return 1;
  return 5;
}

/**
 * Strikes alrededor del precio, `cuantos` a cada lado.
 *
 * Con `paso` se fuerza una separación concreta; sin él se usa la de la
 * tabla.
 */
export function strikesCerca(precio: number, cuantos = 8, paso = pasoDeStrike(precio)): number[] {
  const centro = Math.round(precio / paso) * paso;
  const out: number[] = [];
  for (let i = -cuantos; i <= cuantos; i++) {
    const k = centro + i * paso;
    if (k > 0) out.push(Number(k.toFixed(2)));
  }
  return out;
}

/**
 * Los próximos vencimientos a partir de una fecha.
 *
 * Las opciones de EE. UU. vencen los viernes. Se devuelven los viernes
 * semanales cercanos y después los terceros viernes de cada mes, que son
 * los que de verdad tienen volumen a plazo largo.
 */
export function vencimientosDesde(tiempo: number, cuantos = 6): number[] {
  const out: number[] = [];
  const d = new Date(tiempo * 1000);
  d.setUTCHours(21, 0, 0, 0); // cierre del mercado, 16:00 de Nueva York

  // Primer viernes estrictamente posterior.
  let cursor = new Date(d);
  const faltan = (5 - cursor.getUTCDay() + 7) % 7 || 7;
  cursor.setUTCDate(cursor.getUTCDate() + faltan);

  // Cuatro semanales seguidos.
  for (let i = 0; i < Math.min(4, cuantos); i++) {
    out.push(Math.floor(cursor.getTime() / 1000));
    cursor = new Date(cursor.getTime() + 7 * DIA * 1000);
  }
  // Después, terceros viernes mensuales.
  let mes = new Date(cursor);
  while (out.length < cuantos) {
    const tercero = tercerViernes(mes.getUTCFullYear(), mes.getUTCMonth());
    if (tercero > out[out.length - 1]) out.push(tercero);
    mes = new Date(Date.UTC(mes.getUTCFullYear(), mes.getUTCMonth() + 1, 1));
  }
  return out.slice(0, cuantos);
}

/** Tercer viernes de un mes, a las 21:00 UTC. */
export function tercerViernes(año: number, mes: number): number {
  const primero = new Date(Date.UTC(año, mes, 1, 21, 0, 0, 0));
  const alPrimerViernes = (5 - primero.getUTCDay() + 7) % 7;
  const dia = 1 + alPrimerViernes + 14;
  return Math.floor(Date.UTC(año, mes, dia, 21, 0, 0, 0) / 1000);
}

export interface ContratoCadena {
  strike: number;
  vencimiento: number;
  /** Días calendario hasta el vencimiento. */
  dias: number;
  tipo: TipoOpcion;
  prima: number;
  delta: number;
  theta: number;
  vega: number;
  /** La volatilidad con la que se calculó. */
  vol: number;
}

/**
 * Precio de un contrato en un momento dado.
 *
 * Es la única puerta: tanto la cadena como la valoración de una posición
 * abierta pasan por acá, así que una posición nunca se valora con una
 * fórmula distinta de la que la vendió.
 */
export function precioContrato(
  subyacente: number,
  strike: number,
  tipo: TipoOpcion,
  tiempo: number,
  vencimiento: number,
  vol: number,
  tasa = 0.04,
): ContratoCadena {
  const segundos = Math.max(0, vencimiento - tiempo);
  const T = segundos / (365 * DIA);
  const g = griegasBS({ S: subyacente, K: strike, T, r: tasa, q: 0, sigma: vol, tipo });
  return {
    strike,
    vencimiento,
    dias: Math.round(segundos / DIA),
    tipo,
    prima: Math.max(0.01, Number(g.precio.toFixed(2))),
    delta: g.delta,
    theta: g.theta,
    vega: g.vega,
    vol,
  };
}

/** La cadena completa de una fecha: cada strike con su call y su put. */
export interface FilaCadena {
  strike: number;
  call: ContratoCadena;
  put: ContratoCadena;
}

export function cadenaEn(
  subyacente: number,
  tiempo: number,
  vencimiento: number,
  vol: number,
  cuantosStrikes = 8,
  tasa = 0.04,
  paso = pasoDeStrike(subyacente),
): FilaCadena[] {
  return strikesCerca(subyacente, cuantosStrikes, paso).map((k) => ({
    strike: k,
    call: precioContrato(subyacente, k, "call", tiempo, vencimiento, vol, tasa),
    put: precioContrato(subyacente, k, "put", tiempo, vencimiento, vol, tasa),
  }));
}
