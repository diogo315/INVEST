/**
 * Stop loss y take profit: validarlos, medirlos y decidir si una vela los tocó.
 *
 * Todo el criterio de cuándo se cierra una operación por nivel está acá,
 * sin React y sin gráficos, para poder probarlo con números a mano:
 *   node --experimental-strip-types scripts/verificar-niveles.mjs
 *
 * LA DECISIÓN QUE MÁS CAMBIA EL RESULTADO, y que conviene tener a la
 * vista porque un simulador que la esconde miente:
 *
 *   SI UNA MISMA VELA CONTIENE EL STOP Y EL OBJETIVO, GANA EL STOP.
 *
 * Con una vela de 4 horas no se sabe qué precio tocó primero: el OHLC no
 * guarda el orden. Suponer que ganó el objetivo infla el resultado de
 * forma sistemática —y es justo el supuesto que hace que un backtest se
 * vea hermoso y no se pueda repetir en vivo—. Suponer el stop lo deprime.
 * Se elige deprimirlo: un simulador pesimista que igual da ganancia es
 * información; uno optimista, no.
 *
 * La otra: SE EJECUTA AL PRECIO DEL NIVEL, no al cierre de la vela. Es lo
 * que haría una orden parada en el mercado. El deslizamiento real existe
 * y acá no se modela; vale la pena recordarlo antes de creerle al número.
 */

import type { LadoOperacion } from "@/lib/backtest/tipos";

/** Los dos niveles de una operación. Cualquiera de los dos puede faltar. */
export interface Niveles {
  stopLoss?: number;
  takeProfit?: number;
}

/** Una vela, reducida a lo que hace falta para decidir si tocó. */
export interface RangoVela {
  time: number;
  high: number;
  low: number;
}

export type MotivoCierre = "stop" | "objetivo";

export interface Toque {
  motivo: MotivoCierre;
  /** Precio al que se ejecuta: el del nivel. */
  precio: number;
  time: number;
}

/**
 * ¿De qué lado del precio de entrada tiene que estar cada nivel?
 *
 * Comprado: el stop va DEBAJO y el objetivo ARRIBA. Vendido, al revés.
 * Ponerlos al revés no es un detalle estético: un stop por encima de la
 * entrada en una compra se ejecutaría en la vela siguiente casi seguro, y
 * el backtest registraría una ganancia instantánea que no existe.
 */
export function ladoValido(
  lado: LadoOperacion,
  entrada: number,
  nivel: number,
  cual: "stop" | "objetivo",
): boolean {
  if (!Number.isFinite(nivel) || nivel <= 0) return false;
  const arriba = nivel > entrada;
  if (lado === "compra") return cual === "objetivo" ? arriba : !arriba;
  return cual === "objetivo" ? !arriba : arriba;
}

/** Qué está mal, en castellano, o null si está todo bien. */
export function problemaDeNiveles(
  lado: LadoOperacion,
  entrada: number,
  n: Niveles,
): string | null {
  if (!Number.isFinite(entrada) || entrada <= 0) return "El precio de entrada no es válido.";
  const compra = lado === "compra";
  if (n.stopLoss !== undefined && !ladoValido(lado, entrada, n.stopLoss, "stop")) {
    return compra
      ? "En una compra el stop va por DEBAJO del precio de entrada."
      : "En una venta el stop va por ENCIMA del precio de entrada.";
  }
  if (n.takeProfit !== undefined && !ladoValido(lado, entrada, n.takeProfit, "objetivo")) {
    return compra
      ? "En una compra el objetivo va por ENCIMA del precio de entrada."
      : "En una venta el objetivo va por DEBAJO del precio de entrada.";
  }
  return null;
}

/** Riesgo por unidad: cuánto se pierde por acción si salta el stop. */
export function riesgoPorUnidad(entrada: number, stopLoss: number): number {
  return Math.abs(entrada - stopLoss);
}

/** Ganancia por unidad si llega al objetivo. */
export function premioPorUnidad(entrada: number, takeProfit: number): number {
  return Math.abs(takeProfit - entrada);
}

/**
 * Relación beneficio/riesgo.
 *
 * Devuelve null —y no cero ni infinito— cuando falta un nivel o el riesgo
 * es cero: un número inventado en esa casilla es peor que una casilla
 * vacía, porque se lee como si significara algo.
 */
export function relacionRB(
  entrada: number,
  n: Niveles,
): number | null {
  if (n.stopLoss === undefined || n.takeProfit === undefined) return null;
  const r = riesgoPorUnidad(entrada, n.stopLoss);
  if (r <= 1e-12) return null;
  return premioPorUnidad(entrada, n.takeProfit) / r;
}

/**
 * ¿Esta vela tocó alguno de los niveles?
 *
 * Se mira con el máximo y el mínimo, no con el cierre: una vela que bajó
 * a tocar el stop y se recuperó para cerrar arriba SÍ ejecutó el stop en
 * la realidad, y leerla por el cierre la daría por ganadora.
 */
export function toqueEnVela(
  lado: LadoOperacion,
  vela: RangoVela,
  n: Niveles,
): Toque | null {
  const compra = lado === "compra";
  const tocoStop =
    n.stopLoss !== undefined &&
    (compra ? vela.low <= n.stopLoss : vela.high >= n.stopLoss);
  const tocoObjetivo =
    n.takeProfit !== undefined &&
    (compra ? vela.high >= n.takeProfit : vela.low <= n.takeProfit);

  // El stop primero, siempre. Ver el comentario de arriba.
  if (tocoStop) {
    return { motivo: "stop", precio: n.stopLoss as number, time: vela.time };
  }
  if (tocoObjetivo) {
    return { motivo: "objetivo", precio: n.takeProfit as number, time: vela.time };
  }
  return null;
}

/**
 * El primer toque en un tramo de velas.
 *
 * `velas` tiene que ser SOLO lo que el backtest ya vivió. Pasarle la serie
 * completa cerraría operaciones con velas del futuro, que es la forma más
 * silenciosa de arruinar una simulación.
 *
 * `desdeTiempo` excluye la vela de entrada hacia atrás: una operación
 * abierta al cierre de una vela no puede ejecutarse con el recorrido de
 * esa misma vela, que ya pasó.
 */
export function primerToque(
  lado: LadoOperacion,
  velas: RangoVela[],
  n: Niveles,
  desdeTiempo: number,
): Toque | null {
  if (n.stopLoss === undefined && n.takeProfit === undefined) return null;
  for (const v of velas) {
    if (v.time <= desdeTiempo) continue;
    const t = toqueEnVela(lado, v, n);
    if (t) return t;
  }
  return null;
}

/**
 * Niveles propuestos a partir de un porcentaje, para arrancar en algún lado.
 *
 * No es una recomendación: es un punto de partida arrastrable. Un 1 % de
 * stop en diario y un 1 % en 5 minutos son cosas muy distintas, y por eso
 * lo que importa es poder moverlo, no el número con el que aparece.
 */
export function nivelesPorPct(
  lado: LadoOperacion,
  entrada: number,
  pctStop: number,
  pctObjetivo: number,
): Required<Niveles> {
  const signo = lado === "compra" ? 1 : -1;
  return {
    stopLoss: entrada * (1 - (signo * pctStop) / 100),
    takeProfit: entrada * (1 + (signo * pctObjetivo) / 100),
  };
}

/**
 * El salto mínimo de cantidad de un instrumento.
 *
 * Un bitcoin a 88.000 no se compra entero con 5.000 de capital, y
 * obligar a una cantidad entera dejaba el botón de comprar apagado para
 * siempre: ese era el problema. Las cripto se fraccionan de verdad (en
 * Binance, BTC hasta 0,00001), así que el paso sale del PRECIO, que es
 * lo que determina si una unidad es mucha plata o poca.
 *
 * Las acciones también se fraccionan hoy (Alpaca las opera así), pero
 * ahí el salto natural sigue siendo 1 a menos que el papel sea caro.
 */
export function pasoDeCantidad(precio: number): number {
  if (!Number.isFinite(precio) || precio <= 0) return 1;
  if (precio >= 10000) return 0.00001;
  if (precio >= 1000) return 0.0001;
  if (precio >= 100) return 0.001;
  if (precio >= 10) return 0.01;
  return 1;
}

/** Redondea una cantidad al salto que le corresponde a ese precio. */
export function redondearCantidad(cantidad: number, precio: number): number {
  const paso = pasoDeCantidad(precio);
  if (!Number.isFinite(cantidad) || cantidad <= 0) return paso;
  const n = Math.round(cantidad / paso) * paso;
  // El redondeo en coma flotante deja colas (0,1+0,2); se corta a los
  // decimales que el paso permite.
  const dec = Math.max(0, Math.round(-Math.log10(paso)));
  return Math.max(paso, Number(n.toFixed(dec)));
}

/**
 * Cuántas unidades se van a operar.
 *
 * `null` —o un 0 escrito a mano— quiere decir «las que entren con el
 * efectivo libre». Las dos cosas significan lo mismo a propósito:
 * devolver el salto mínimo porque el usuario borró el número lo dejaría
 * con 0,00001 de bitcoin sin haberlo pedido.
 *
 * Vive acá, y no dentro del panel, porque el gráfico también la necesita:
 * las etiquetas de las líneas dicen cuántos dólares hay en juego, y si
 * cada uno calculara la suya, el riesgo del panel y el del gráfico
 * podrían no coincidir.
 */
export function cantidadEfectiva(
  manual: number | null,
  efectivo: number,
  precio: number,
): number {
  if (manual !== null && Number.isFinite(manual) && manual > 0) {
    return redondearCantidad(manual, precio);
  }
  if (!Number.isFinite(precio) || precio <= 0) return pasoDeCantidad(precio);
  const paso = pasoDeCantidad(precio);
  // Hacia ABAJO: proponer más de lo que entra deja el botón apagado, que
  // es exactamente el problema que esto viene a resolver.
  const cruda = efectivo / precio;
  const dec = Math.max(0, Math.round(-Math.log10(paso)));
  const n = Number((Math.floor(cruda / paso) * paso).toFixed(dec));
  return Math.max(paso, n);
}

/**
 * De dólares a unidades del activo.
 *
 * Es la otra forma de decir lo mismo, y para cripto es la natural: uno
 * piensa «meto 500 dólares», no «compro 0,00563 bitcoin».
 */
export function unidadesPorDolares(dolares: number, precio: number): number {
  if (!Number.isFinite(dolares) || dolares <= 0) return 0;
  if (!Number.isFinite(precio) || precio <= 0) return 0;
  return redondearCantidad(dolares / precio, precio);
}

/** Cuántos dólares cuesta una cantidad. */
export function dolaresPorUnidades(cantidad: number, precio: number): number {
  if (!Number.isFinite(cantidad) || !Number.isFinite(precio)) return 0;
  return cantidad * precio;
}

/** Redondea un nivel a un paso de precio razonable para el instrumento. */
export function redondearNivel(precio: number): number {
  if (!Number.isFinite(precio) || precio <= 0) return 0;
  // Más decimales cuanto más chico el precio, igual que una cotización.
  const dec = precio >= 1000 ? 2 : precio >= 1 ? 4 : 8;
  return Number(precio.toFixed(dec));
}

/** Saca la basura de unos niveles guardados. */
export function sanearNiveles(crudo: unknown): Niveles {
  if (!crudo || typeof crudo !== "object") return {};
  const n = crudo as Partial<Niveles>;
  const out: Niveles = {};
  if (Number.isFinite(n.stopLoss) && (n.stopLoss as number) > 0) {
    out.stopLoss = n.stopLoss as number;
  }
  if (Number.isFinite(n.takeProfit) && (n.takeProfit as number) > 0) {
    out.takeProfit = n.takeProfit as number;
  }
  return out;
}
