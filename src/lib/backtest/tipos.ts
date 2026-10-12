/**
 * Contabilidad del backtesting: qué es una operación y cómo se suma.
 *
 * Toda la plata se calcula acá. La vista solo muestra lo que estas
 * funciones devuelven, así que el número del resumen y el de la fila de la
 * tabla no pueden discrepar: salen del mismo sitio.
 *
 * Sin imports salvo la cadena, que tampoco trae ninguno:
 *   node --experimental-strip-types scripts/verificar-backtest.mjs
 */

import {
  MULTIPLICADOR,
  precioContrato,
  type VelaMin,
} from "@/lib/backtest/cadena";
import { sanearIndicadores } from "@/lib/backtest/indicadores";

export type TipoInstrumento = "activo" | "call" | "put";
export type LadoOperacion = "compra" | "venta";

export interface Operacion {
  id: string;
  instrumento: TipoInstrumento;
  lado: LadoOperacion;
  /** Acciones si es el activo; contratos si es una opción. */
  cantidad: number;
  /** Precio por acción, o prima por acción (no por contrato). */
  precioEntrada: number;
  tiempoEntrada: number;
  /** Solo opciones. */
  strike?: number;
  vencimiento?: number;
  /** Volatilidad con la que se abrió, para poder revalorarla igual. */
  volEntrada?: number;
  /** Nulo mientras siga abierta. */
  precioSalida?: number;
  tiempoSalida?: number;
  /** Por qué se cerró: a mano, o porque venció. */
  motivo?: "manual" | "vencimiento";
  nota?: string;
}

export interface Backtest {
  id: string;
  nombre: string;
  /** Símbolo cualificado, como "ALP:AAPL" o "BIN:BTCUSDT". */
  simbolo: string;
  /** Temporalidad con la que se arrancó (se puede cambiar en marcha). */
  temporalidad: string;
  desde: number;
  capitalInicial: number;
  operaciones: Operacion[];
  /** Hasta dónde avanzó el reloj la última vez. */
  tiempoActual: number;
  /** Indicadores encendidos, por clave. Se guardan con la corrida: parte
   * de lo que se quiere recordar es QUÉ estabas mirando al decidir. */
  indicadores: string[];
  creado: number;
}

/** Cuántas unidades del subyacente controla la operación. */
export function unidades(op: Operacion): number {
  return op.instrumento === "activo"
    ? op.cantidad
    : op.cantidad * MULTIPLICADOR;
}

/**
 * Plata que sale del bolsillo al abrir.
 *
 * Una compra cuesta. Una venta de opción NO ingresa plata libre: cobrás la
 * prima pero el bróker te retiene garantía, y tratarla como ingreso haría
 * parecer que vender primas regala capital. Se modela como que inmoviliza
 * el mismo importe que costaría comprarla, que es conservador y simple.
 */
export function costoApertura(op: Operacion): number {
  return op.precioEntrada * unidades(op);
}

/** Valor de la operación a un precio dado del instrumento. */
export function valorA(op: Operacion, precioInstrumento: number): number {
  return precioInstrumento * unidades(op);
}

/**
 * Resultado en dólares a un precio dado del instrumento.
 *
 * Comprado gana si sube; vendido, si baja. Es la única resta de todo el
 * módulo y de acá sale cada porcentaje de la pantalla.
 */
export function resultadoA(op: Operacion, precioInstrumento: number): number {
  const dif = precioInstrumento - op.precioEntrada;
  return (op.lado === "compra" ? dif : -dif) * unidades(op);
}

/** Si ya está cerrada, su resultado definitivo. */
export function resultadoFinal(op: Operacion): number | null {
  return op.precioSalida === undefined
    ? null
    : resultadoA(op, op.precioSalida);
}

export function estaAbierta(op: Operacion): boolean {
  return op.precioSalida === undefined;
}

/**
 * Precio del instrumento de una operación en un momento dado.
 *
 * Para el activo es el precio del activo. Para una opción se revalora con
 * la misma fórmula que la vendió, con el tiempo que le queda y la
 * volatilidad del momento; pasado el vencimiento solo queda el
 * intrínseco, que es lo que Black-Scholes devuelve con T = 0.
 */
export function precioDe(
  op: Operacion,
  subyacente: number,
  tiempo: number,
  vol: number,
): number {
  if (op.instrumento === "activo") return subyacente;
  const k = op.strike ?? subyacente;
  const v = op.vencimiento ?? tiempo;
  return precioContrato(
    subyacente,
    k,
    op.instrumento,
    Math.min(tiempo, v),
    v,
    vol,
  ).prima;
}

export interface Resumen {
  /** Capital si se cerrara todo ahora mismo. */
  capital: number;
  /** Efectivo libre: lo que no está inmovilizado en posiciones abiertas. */
  efectivo: number;
  /** Inmovilizado en posiciones abiertas, a precio de entrada. */
  expuesto: number;
  /** Ganado o perdido respecto del capital inicial. */
  resultado: number;
  pct: number;
  /** Solo de lo ya cerrado. */
  realizado: number;
  /** Solo de lo que sigue abierto. */
  abierto: number;
  operaciones: number;
  abiertas: number;
  ganadoras: number;
  perdedoras: number;
  /** Peor caída desde un máximo de capital, en porcentaje. */
  maxCaida: number;
}

/**
 * El resumen completo a un momento dado.
 *
 * `valorar` dice cuánto vale cada operación ahora; se pasa de fuera para
 * que esta función no necesite saber nada de precios ni de velas, y se
 * pueda probar con números a mano.
 */
export function resumir(
  bt: Backtest,
  valorar: (op: Operacion) => number,
  curva: number[] = [],
): Resumen {
  let realizado = 0;
  let abierto = 0;
  let expuesto = 0;
  let abiertas = 0;
  let ganadoras = 0;
  let perdedoras = 0;

  for (const op of bt.operaciones) {
    const fin = resultadoFinal(op);
    if (fin === null) {
      abiertas++;
      expuesto += costoApertura(op);
      abierto += resultadoA(op, valorar(op));
    } else {
      realizado += fin;
      if (fin > 0) ganadoras++;
      else if (fin < 0) perdedoras++;
    }
  }

  const capital = bt.capitalInicial + realizado + abierto;
  return {
    capital,
    efectivo: bt.capitalInicial + realizado - expuesto,
    expuesto,
    resultado: capital - bt.capitalInicial,
    pct:
      bt.capitalInicial > 0
        ? ((capital - bt.capitalInicial) / bt.capitalInicial) * 100
        : 0,
    realizado,
    abierto,
    operaciones: bt.operaciones.length,
    abiertas,
    ganadoras,
    perdedoras,
    maxCaida: caidaMaxima(curva),
  };
}

/** Peor caída porcentual desde un máximo previo. */
export function caidaMaxima(curva: number[]): number {
  let pico = -Infinity;
  let peor = 0;
  for (const v of curva) {
    if (v > pico) pico = v;
    if (pico > 0) {
      const caida = ((pico - v) / pico) * 100;
      if (caida > peor) peor = caida;
    }
  }
  return peor;
}

/**
 * Curva de capital vela a vela, para dibujarla.
 *
 * En cada vela cuenta lo cerrado hasta ese momento más lo que valían las
 * posiciones que estaban abiertas, usando el cierre de esa vela.
 */
export function curvaDeCapital(
  bt: Backtest,
  velas: VelaMin[],
  volEn: (i: number) => number,
): Array<{ time: number; value: number }> {
  const out: Array<{ time: number; value: number }> = [];
  for (let i = 0; i < velas.length; i++) {
    const { time, close } = velas[i];
    if (time < bt.desde) continue;
    let total = bt.capitalInicial;
    for (const op of bt.operaciones) {
      if (op.tiempoEntrada > time) continue;
      const cerradaYa =
        op.tiempoSalida !== undefined && op.tiempoSalida <= time;
      if (cerradaYa) {
        total += resultadoA(op, op.precioSalida as number);
      } else {
        total += resultadoA(op, precioDe(op, close, time, volEn(i)));
      }
    }
    out.push({ time, value: Number(total.toFixed(2)) });
  }
  return out;
}

/** Nombre que no choque con otro backtest guardado. */
export function nombreLibre(usados: string[], deseado: string): string {
  const base = deseado.trim().slice(0, 40) || "Backtest";
  const set = new Set(usados.map((n) => n.toLowerCase()));
  if (!set.has(base.toLowerCase())) return base;
  for (let i = 2; i < 200; i++) {
    const t = `${base} (${i})`;
    if (!set.has(t.toLowerCase())) return t;
  }
  return `${base} ${usados.length + 1}`;
}

/** Saca la basura de lo guardado. */
export function sanearBacktests(crudo: unknown): Backtest[] {
  if (!Array.isArray(crudo)) return [];
  return crudo
    .filter(
      (b): b is Backtest =>
        !!b &&
        typeof b === "object" &&
        typeof (b as Backtest).id === "string" &&
        typeof (b as Backtest).simbolo === "string" &&
        Array.isArray((b as Backtest).operaciones),
    )
    .slice(0, 50)
    .map((b) => ({
      id: b.id,
      nombre: typeof b.nombre === "string" && b.nombre.trim() ? b.nombre.slice(0, 40) : "Backtest",
      simbolo: b.simbolo,
      temporalidad: typeof b.temporalidad === "string" ? b.temporalidad : "1d",
      desde: Number.isFinite(b.desde) ? b.desde : 0,
      capitalInicial:
        Number.isFinite(b.capitalInicial) && b.capitalInicial > 0
          ? b.capitalInicial
          : 10000,
      tiempoActual: Number.isFinite(b.tiempoActual) ? b.tiempoActual : b.desde,
      indicadores: sanearIndicadores(b.indicadores),
      creado: Number.isFinite(b.creado) ? b.creado : 0,
      operaciones: b.operaciones
        .filter(
          (o): o is Operacion =>
            !!o &&
            typeof o === "object" &&
            typeof o.id === "string" &&
            Number.isFinite(o.precioEntrada) &&
            Number.isFinite(o.cantidad),
        )
        .slice(0, 500),
    }));
}
