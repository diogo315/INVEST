/**
 * Futuros con apalancamiento, comisiones y financiamiento.
 *
 * Toda la matemática del dinero está acá, sin React y sin gráficos, para
 * poder probarla con números a mano:
 *   node --experimental-strip-types scripts/verificar-futuros.mjs
 *
 * CUATRO COSAS QUE CONVIENE TENER CLARAS ANTES DE MIRAR UN NÚMERO:
 *
 * 1. EL APALANCAMIENTO NO MULTIPLICA LA GANANCIA POR OPERACIÓN. Lo que
 *    hace es inmovilizar menos capital: con 5x, una posición de 5.000
 *    dólares retiene 1.000 de margen en vez de 5.000. La ganancia en
 *    dólares de esa posición es la misma que sin apalancar. Lo que
 *    cambia es que con el mismo capital podés abrir cinco veces más
 *    nocional —y ahí sí se multiplica todo, incluidas las pérdidas.
 *
 * 2. LA LIQUIDACIÓN ES LA ÚNICA ASIMETRÍA REAL. Es lo que el
 *    apalancamiento agrega de verdad: un movimiento en contra que se
 *    come el margen cierra la posición a la fuerza, y ya no participás
 *    de la recuperación. Se evalúa con el máximo y el mínimo de la
 *    vela, NO con el cierre: una vela que fue a tocar el precio de
 *    liquidación y se recuperó te liquidó igual.
 *
 * 3. LA COMISIÓN SE PAGA SOBRE EL NOCIONAL, NO SOBRE EL MARGEN. Con 10x
 *    la comisión de abrir y cerrar es diez veces la de la misma plata
 *    sin apalancar. Es el costo que más sorprende y el que más mata una
 *    estrategia de muchas operaciones.
 *
 * 4. EL FINANCIAMIENTO SE COBRA CADA OCHO HORAS sobre el nocional.
 *    Parece poco (0,01 %) hasta que una posición apalancada se queda
 *    abierta tres semanas.
 */

import type { LadoOperacion } from "@/lib/backtest/tipos";

/** Cada cuánto se cobra el financiamiento de un perpetuo, en segundos. */
export const PERIODO_FINANCIAMIENTO = 8 * 3600;

export interface ConfigFuturos {
  /** Apalancamiento. 1 = sin apalancar. */
  apalancamiento: number;
  /** Comisión por lado, en porcentaje del nocional. */
  comision: number;
  /**
   * Financiamiento por período de 8 h, en porcentaje del nocional.
   * Positivo = lo paga el largo (que es lo habitual en un mercado alcista).
   */
  financiamiento: number;
  /**
   * Margen de mantenimiento, en fracción del nocional. Por debajo de
   * esto el bróker liquida. En Binance arranca en 0,4 % y sube con el
   * tamaño; 0,5 % es una aproximación conservadora.
   */
  mantenimiento: number;
}

export const FUTUROS_POR_DEFECTO: ConfigFuturos = {
  apalancamiento: 1,
  // Taker de Binance USDT-M. Se usa el taker y no el maker a propósito:
  // en un backtest uno entra cuando lo decide, no cuando le ejecutan una
  // orden puesta antes, así que el taker es lo honesto.
  comision: 0.04,
  financiamiento: 0.01,
  mantenimiento: 0.005,
};

export const APALANCAMIENTOS = [1, 2, 3, 5, 10, 20, 25, 50, 100] as const;

/** Margen inmovilizado por una posición de ese nocional. */
export function margenRequerido(nocional: number, apalancamiento: number): number {
  const lev = Math.max(1, apalancamiento || 1);
  return Math.abs(nocional) / lev;
}

/**
 * Precio al que te liquidan.
 *
 * Fórmula: el margen cubre una caída de (1/lev) del nocional, y hay que
 * dejar el mantenimiento sin tocar. Así que el movimiento en contra que
 * se aguanta es (1/lev − mantenimiento), en fracción del precio.
 *
 * A 1x TAMBIÉN hay liquidación, y esto me costó una prueba fallada por
 * creer que no: en futuros, aunque el margen sea el nocional completo,
 * el bróker cierra cuando el patrimonio cae al margen de mantenimiento.
 * A 1x eso es una caída del 99,5 %. Es un número extremo pero real, y
 * devolver null ahí sería decir «esto no puede pasar», que es falso.
 *
 * (En SPOT no hay liquidación de ninguna clase; eso lo decide quien
 * llama, no esta función.)
 *
 * Devuelve null solo si el precio de entrada no sirve.
 */
export function precioLiquidacion(
  lado: LadoOperacion,
  entrada: number,
  cfg: ConfigFuturos,
): number | null {
  const lev = Math.max(1, cfg.apalancamiento || 1);
  if (!Number.isFinite(entrada) || entrada <= 0) return null;
  const aguanta = 1 / lev - cfg.mantenimiento;
  if (aguanta <= 0) return entrada;          // margen insuficiente desde el minuto cero
  return lado === "compra"
    ? entrada * (1 - aguanta)
    : entrada * (1 + aguanta);
}

/** ¿Esta vela tocó el precio de liquidación? */
export function tocaLiquidacion(
  lado: LadoOperacion,
  vela: { high: number; low: number },
  precioLiq: number | null,
): boolean {
  if (precioLiq === null) return false;
  return lado === "compra" ? vela.low <= precioLiq : vela.high >= precioLiq;
}

/** Comisión de UN lado (abrir o cerrar), en dólares. */
export function comisionDe(nocional: number, cfg: ConfigFuturos): number {
  return (Math.abs(nocional) * cfg.comision) / 100;
}

/**
 * Comisión de la vuelta completa.
 *
 * Se cobra sobre el nocional de ENTRADA y sobre el de SALIDA, que no son
 * el mismo si el precio se movió. Cobrar dos veces el de entrada es el
 * atajo habitual y subestima el costo de las operaciones ganadoras.
 */
export function comisionVuelta(
  nocionalEntrada: number,
  nocionalSalida: number,
  cfg: ConfigFuturos,
): number {
  return comisionDe(nocionalEntrada, cfg) + comisionDe(nocionalSalida, cfg);
}

/**
 * Financiamiento pagado por tener la posición abierta.
 *
 * Se cuenta por períodos COMPLETOS de ocho horas: una posición de siete
 * horas no paga nada, igual que en el mercado real, donde se cobra a
 * horas fijas a quien esté adentro en ese instante. Es una aproximación
 * —no se sabe si se cruzó una hora de cobro o dos—, y por eso se declara.
 */
export function financiamientoPagado(
  nocional: number,
  segundosAbierta: number,
  lado: LadoOperacion,
  cfg: ConfigFuturos,
): number {
  if (!Number.isFinite(segundosAbierta) || segundosAbierta <= 0) return 0;
  const periodos = Math.floor(segundosAbierta / PERIODO_FINANCIAMIENTO);
  if (periodos <= 0) return 0;
  const monto = (Math.abs(nocional) * cfg.financiamiento) / 100;
  // Con financiamiento positivo paga el largo y cobra el corto.
  return (lado === "compra" ? 1 : -1) * monto * periodos;
}

export interface CostosOperacion {
  comision: number;
  financiamiento: number;
  /** Lo que se le resta al resultado bruto. */
  total: number;
  /**
   * De ese total, lo que YA SALIÓ DE LA CUENTA.
   *
   * En una posición cerrada es todo. En una abierta es la comisión de
   * ENTRADA más el financiamiento corrido: la comisión de salida todavía
   * no se pagó porque no se ha cerrado.
   *
   * La distinción no es un detalle contable: el efectivo libre tiene que
   * descontar lo ya pagado. Sin esto, las comisiones de las posiciones
   * abiertas se acumulan sin salir de la cuenta y el golpe llega entero
   * al cerrarlas, dejando el efectivo libre en negativo. Medido: a 25x
   * con veinte posiciones abiertas eran 27,90 dólares que la cuenta
   * decía tener y no tenía.
   */
  pagado: number;
}

/** Todos los costos de una operación cerrada. */
export function costosDe(
  lado: LadoOperacion,
  precioEntrada: number,
  precioSalida: number,
  unidades: number,
  segundosAbierta: number,
  cfg: ConfigFuturos,
  /** false si la posición sigue abierta: la comisión de salida no se pagó. */
  cerrada = true,
): CostosOperacion {
  const nocEnt = precioEntrada * unidades;
  const nocSal = precioSalida * unidades;
  const comEnt = comisionDe(nocEnt, cfg);
  const comSal = comisionDe(nocSal, cfg);
  const fin = financiamientoPagado(nocEnt, segundosAbierta, lado, cfg);
  const total = comEnt + comSal + fin;
  return {
    comision: comEnt + comSal,
    financiamiento: fin,
    total,
    pagado: cerrada ? total : comEnt + fin,
  };
}

/**
 * Cuánto puede moverse el precio en contra antes de liquidar, en porcentaje.
 *
 * Es el número que más vale la pena mirar antes de elegir apalancamiento:
 * a 20x son 4,5 %, y bitcoin hace 4,5 % en un día cualquiera.
 */
export function margenDeMovimiento(cfg: ConfigFuturos): number {
  const lev = Math.max(1, cfg.apalancamiento || 1);
  return Math.max(0, (1 / lev - cfg.mantenimiento) * 100);
}

/**
 * Nocional MÁXIMO que se puede abrir con el efectivo libre.
 *
 * No es `efectivo × apalancamiento`: para abrir una posición hace falta
 * el margen Y la comisión de entrada, las dos sobre el nocional. O sea
 *
 *   N/L + N·c ≤ efectivo   →   N ≤ efectivo / (1/L + c)
 *
 * Ignorar la comisión deja un «máximo» que no se puede pagar, y el botón
 * de comprar apagado sin decir por qué.
 */
export function nocionalMaximo(efectivo: number, cfg: ConfigFuturos): number {
  if (!Number.isFinite(efectivo) || efectivo <= 0) return 0;
  const lev = Math.max(1, cfg.apalancamiento || 1);
  const porUnidad = 1 / lev + cfg.comision / 100;
  return porUnidad > 0 ? efectivo / porUnidad : 0;
}

/**
 * Nocional que se PROPONE por defecto.
 *
 * Es el efectivo libre, sin multiplicar por el apalancamiento, y la
 * razón es la misma que explica la barra de arriba: el apalancamiento no
 * está para abrir una posición diez veces más grande, está para que la
 * misma posición inmovilice menos capital.
 *
 * Con el máximo como valor por defecto —que es lo que hacía antes— una
 * sola compra a 10x se llevaba el 100 % del capital como margen, dejaba
 * el efectivo libre en cero y el backtest trabado sin poder operar de
 * nuevo. Medido, y es exactamente lo que le pasó a Diego.
 *
 * Quien quiera el máximo lo pide con el botón, que para eso está.
 */
export function nocionalPorDefecto(efectivo: number, cfg: ConfigFuturos): number {
  if (!Number.isFinite(efectivo) || efectivo <= 0) return 0;
  // Nunca más que el máximo: con apalancamiento 1 el margen ya es todo
  // el nocional, así que la comisión no entraría.
  return Math.min(efectivo, nocionalMaximo(efectivo, cfg));
}

/** Saca la basura de una configuración guardada. */
export function sanearFuturos(crudo: unknown): ConfigFuturos {
  const c = (crudo ?? {}) as Partial<ConfigFuturos>;
  const num = (v: unknown, def: number, min: number, max: number) =>
    Number.isFinite(v) && (v as number) >= min && (v as number) <= max
      ? (v as number)
      : def;
  return {
    apalancamiento: num(c.apalancamiento, 1, 1, 125),
    comision: num(c.comision, FUTUROS_POR_DEFECTO.comision, 0, 1),
    financiamiento: num(c.financiamiento, FUTUROS_POR_DEFECTO.financiamiento, -1, 1),
    mantenimiento: num(c.mantenimiento, FUTUROS_POR_DEFECTO.mantenimiento, 0, 0.2),
  };
}
