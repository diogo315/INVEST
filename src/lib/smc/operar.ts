/**
 * De una señal del SMC a una operación del backtest.
 *
 * El indicador original no dice cuánto comprar: es un indicador, no una
 * estrategia, y dibuja la entrada, el stop y el objetivo sin opinar
 * sobre el tamaño. Pero un backtest sin tamaño no da ningún número, así
 * que esta parte es añadida y conviene saberlo.
 *
 * La regla elegida es RIESGO FIJO: cada operación arriesga el mismo
 * porcentaje del capital INICIAL entre la entrada y el stop. Dos razones
 * contra la alternativa obvia (meter todo el efectivo disponible):
 *
 * - Con tamaño fijo en dinero, una señal con el stop lejos arriesga
 *   diez veces más que una con el stop cerca, y la serie de resultados
 *   mide el azar de dónde quedaron los stops, no si la idea sirve.
 * - Con todo el efectivo, la primera señal se come el capital y las
 *   demás no existen.
 *
 * Sobre el capital INICIAL y no sobre el de cada momento: así cada
 * operación pesa lo mismo. Componer haría que las últimas del período
 * decidieran el resultado y que el orden importara más que el método.
 *
 * Sin React, sin store, sin gráfico:
 *   node --experimental-strip-types scripts/verificar-smc-operar.mjs
 */

import { ALCISTA, type SenalBOS } from "@/lib/smc/motor";

export interface ConfigTamano {
  /** Qué parte del capital inicial se arriesga por operación, en %. */
  riesgoPorcentaje: number;
  /** Nocional máximo que el efectivo permite. 0 o menos = sin tope. */
  nocionalMaximo: number;
  /** Paso mínimo de cantidad del mercado. */
  pasoCantidad: number;
}

/**
 * Cuántas unidades comprar o vender para arriesgar lo pedido.
 *
 * Devuelve 0 cuando no se puede dimensionar —sin distancia al stop, con
 * datos imposibles o cuando el tope deja menos de un paso—, y 0 quiere
 * decir "no operar". Devolver un mínimo de cortesía sería inventar una
 * operación que el capital no aguanta.
 */
export function unidadesPorRiesgo(
  capitalInicial: number,
  entrada: number,
  stop: number,
  cfg: ConfigTamano,
): number {
  const distancia = Math.abs(entrada - stop);
  if (
    !Number.isFinite(capitalInicial) ||
    !Number.isFinite(entrada) ||
    !Number.isFinite(stop) ||
    capitalInicial <= 0 ||
    entrada <= 0 ||
    distancia <= 0 ||
    cfg.riesgoPorcentaje <= 0
  ) {
    return 0;
  }
  const dinero = (capitalInicial * cfg.riesgoPorcentaje) / 100;
  let unidades = dinero / distancia;
  if (cfg.nocionalMaximo > 0) {
    unidades = Math.min(unidades, cfg.nocionalMaximo / entrada);
  }
  const paso = cfg.pasoCantidad > 0 ? cfg.pasoCantidad : 1e-8;
  // Hacia abajo: redondear hacia arriba sería arriesgar más de lo dicho.
  //
  // El epsilon no es paranoia. Un paso como 0,00001 no existe exacto en
  // binario, así que `10 / 0,00001` da 999.999,9999999999 y el piso se
  // lleva un paso entero: diez unidades se volvían 9,99999. Medido.
  const bruto = unidades / paso;
  const pasos = Math.floor(bruto + Math.max(1e-9, bruto * 1e-9));
  const redondeadas = pasos * paso;
  if (!Number.isFinite(redondeadas) || pasos < 1) return 0;
  // Y acá se limpia lo que deja volver a multiplicar por el paso.
  return Number(redondeadas.toFixed(10));
}

/** Lo que hace falta para fabricar la operación, sin depender del store. */
export interface OperacionDeSenal {
  lado: "compra" | "venta";
  cantidad: number;
  precioEntrada: number;
  tiempoEntrada: number;
  stopLoss: number;
  takeProfit: number;
  /** Solo si la señal ya terminó dentro de las velas disponibles. */
  precioSalida?: number;
  tiempoSalida?: number;
  motivo?: "stop" | "objetivo";
}

/**
 * Convierte una señal en una operación lista para el backtest.
 *
 * Devuelve null si no se puede dimensionar: una operación de cantidad
 * cero ensuciaría la tabla y contaría como un acierto o un fallo que no
 * ocurrió.
 *
 * El caso AMBIGUO —la vela tocó el stop y el objetivo y no se sabe cuál
 * fue primero— se cierra como stop. No es pesimismo decorativo: contarlo
 * como acierto infla el resultado justo en las velas más violentas, que
 * son las que más pesan.
 */
export function operacionDeSenal(
  s: SenalBOS,
  capitalInicial: number,
  cfg: ConfigTamano,
): OperacionDeSenal | null {
  const cantidad = unidadesPorRiesgo(capitalInicial, s.entrada, s.stop, cfg);
  if (cantidad <= 0) return null;
  const base: OperacionDeSenal = {
    lado: s.sesgo === ALCISTA ? "compra" : "venta",
    cantidad,
    precioEntrada: s.entrada,
    tiempoEntrada: s.time,
    stopLoss: s.stop,
    takeProfit: s.objetivo,
  };
  if (!s.salida) return base;
  const porObjetivo = s.salida.motivo === "objetivo";
  return {
    ...base,
    precioSalida: porObjetivo ? s.objetivo : s.stop,
    tiempoSalida: s.salida.time,
    motivo: porObjetivo ? "objetivo" : "stop",
  };
}

/**
 * Las señales que todavía no se pasaron al backtest.
 *
 * Se reconocen por la hora de entrada y el precio: el índice de vela no
 * sirve porque la ventana del backtest se desplaza y el mismo momento
 * cambia de número.
 */
export function senalesNuevas(
  senales: SenalBOS[],
  yaOperadas: Array<{ tiempoEntrada: number; precioEntrada: number }>,
): SenalBOS[] {
  const vistas = new Set(
    yaOperadas.map((o) => `${o.tiempoEntrada}|${o.precioEntrada}`),
  );
  return senales.filter((s) => !vistas.has(`${s.time}|${s.entrada}`));
}
