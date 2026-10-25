/**
 * «Siempre adentro»: comprar con el punto verde, dar vuelta con el rojo.
 *
 * La regla tal como la planteó Diego: con el punto verde del Cipher B se
 * compra, con el rojo se cierra y se abre corto, y así alternando. Nunca
 * se está afuera del mercado.
 *
 * Tres decisiones de diseño que cambian el resultado y que conviene
 * tener a la vista, porque un backtest que las esconde miente:
 *
 * 1. SE ENTRA AL CIERRE DE LA VELA DE LA SEÑAL. La señal se conoce
 *    recién cuando esa vela cierra (el cruce compara la vela actual con
 *    la anterior), así que ese cierre es el primer precio al que se
 *    puede operar. Es el supuesto más favorable que sigue siendo
 *    honesto: en vivo uno manda la orden unos segundos después.
 *
 * 2. SE COMPARA CONTRA COMPRAR Y ESPERAR, SIEMPRE. Una estrategia de
 *    cripto que gana 40 % en un año donde el activo subió 120 % no es
 *    una buena estrategia: es una forma cara de tener menos bitcoin.
 *    Sin esta comparación, cualquier número positivo parece un éxito.
 *
 * 3. EL CORTO CUESTA PLATA POR DÍA. En perpetuos es el financiamiento;
 *    en acciones es el préstamo del papel. No es un detalle: en una
 *    estrategia que puede quedarse semanas corta, se come el resultado.
 */

import type { Candle } from "@/lib/binance/types";
import type { IndicatorConfig } from "@/lib/store/chart-store";
import { senalesCipher } from "@/lib/backtest/senales";

export interface ConfigSiempreAdentro {
  /** En spot no se puede ir corto: con `false` queda plano tras el rojo. */
  permitirCortos: boolean;
  /** Comisión por lado, en porcentaje. */
  comision: number;
  /** Diferencial, en porcentaje. */
  spread: number;
  /**
   * Lo que cuesta mantener un corto, en porcentaje POR DÍA. En
   * perpetuos es el financiamiento (del orden de 0,01 % cada 8 h,
   * o sea ~0,03 % diario); en acciones es el préstamo, que para un
   * papel líquido anda por 0,3 % ANUAL pero puede dispararse.
   */
  costoCortoDiario: number;
  /** Qué punto cuenta: el de zona extrema o solo el dorado. */
  senal: "extremos" | "oro";
}

export const SIEMPRE_ADENTRO_POR_DEFECTO: ConfigSiempreAdentro = {
  permitirCortos: true,
  comision: 0.05,
  spread: 0.02,
  costoCortoDiario: 0.03,
  senal: "extremos",
};

export interface OperacionSA {
  lado: 1 | -1;
  entrada: number;
  tiempoEntrada: number;
  salida: number;
  tiempoSalida: number;
  /** Rendimiento neto de la operación, en porcentaje. */
  pct: number;
  /** Días que estuvo abierta, para poder explicar el costo del corto. */
  dias: number;
}

export interface ResultadoSA {
  operaciones: OperacionSA[];
  /** Capital final si se compone cada operación, en porcentaje. */
  estrategiaPct: number;
  /** Lo mismo comprando al principio y no tocando nada. */
  comprarYEsperarPct: number;
  /** Peor caída desde un máximo, en porcentaje, para cada uno. */
  caidaEstrategiaPct: number;
  caidaCompraPct: number;
  /** Cuánto tiempo estuvo en cada lado, en porcentaje de las velas. */
  tiempoLargoPct: number;
  tiempoCortoPct: number;
  /**
   * Momento en que la cuenta quedó en cero, o null si sobrevivió.
   *
   * No es un adorno. Un corto abierto contra una subida sostenida puede
   * perder MÁS del 100 %: medido, uno de 104 días perdió 141,9 %. Sin
   * esto el capital quedaba negativo y el informe decía «rindió −113 %»,
   * que es un número sin significado: en la realidad te liquidan mucho
   * antes y no hay con qué seguir operando. Cuando pasa, la simulación
   * para acá y lo dice, porque «te barrió la cuenta tal día» es la
   * respuesta, no un detalle del cálculo.
   */
  arruinadoEn: number | null;
}

/** El costo de una entrada o una salida, en porcentaje. */
function costoDeUnLado(cfg: ConfigSiempreAdentro): number {
  return cfg.comision + cfg.spread / 2;
}

/** Peor caída desde un máximo previo, sobre una curva de capital. */
export function peorCaida(curva: number[]): number {
  let max = -Infinity;
  let peor = 0;
  for (const v of curva) {
    if (v > max) max = v;
    if (max > 0) peor = Math.max(peor, ((max - v) / max) * 100);
  }
  return peor;
}

/**
 * Corre la regla sobre una serie de velas.
 *
 * `velas` tiene que ser de UNA temporalidad (4H, 8H o diaria): las
 * señales se calculan sobre ella misma.
 */
export function correrSiempreAdentro(
  velas: Candle[],
  indicadores: IndicatorConfig,
  cfg: ConfigSiempreAdentro = SIEMPRE_ADENTRO_POR_DEFECTO,
): ResultadoSA {
  const vacio: ResultadoSA = {
    operaciones: [], estrategiaPct: 0, comprarYEsperarPct: 0,
    caidaEstrategiaPct: 0, caidaCompraPct: 0, tiempoLargoPct: 0, tiempoCortoPct: 0,
    arruinadoEn: null,
  };
  if (velas.length < 60) return vacio;

  const senales = senalesCipher(velas, indicadores);
  // Qué tipos cuentan como compra y como venta, según lo elegido.
  const esCompra = (t: string) =>
    cfg.senal === "oro" ? t === "oro" : t === "compra" || t === "oro";
  const esVenta = (t: string) => t === "venta";

  const porTiempo = new Map<number, "compra" | "venta">();
  for (const s of senales) {
    if (esCompra(s.tipo)) porTiempo.set(s.time, "compra");
    else if (esVenta(s.tipo)) porTiempo.set(s.time, "venta");
  }

  const ops: OperacionSA[] = [];
  const costo = costoDeUnLado(cfg);
  let viva: { lado: 1 | -1; entrada: number; tiempo: number } | null = null;
  let capital = 100;
  const curva: number[] = [];
  let velasLargo = 0;
  let velasCorto = 0;
  let arruinadoEn: number | null = null;

  /** Cierra lo abierto al precio dado y acumula el resultado. */
  const cerrar = (precio: number, tiempo: number) => {
    if (!viva) return;
    const dias = Math.max(0, (tiempo - viva.tiempo) / 86400);
    const bruto = viva.lado === 1
      ? ((precio - viva.entrada) / viva.entrada) * 100
      : ((viva.entrada - precio) / viva.entrada) * 100;
    // Dos lados de costo (entrada y salida) más el acarreo si fue corto.
    const acarreo = viva.lado === -1 ? cfg.costoCortoDiario * dias : 0;
    const pct = bruto - costo * 2 - acarreo;
    ops.push({
      lado: viva.lado, entrada: viva.entrada, tiempoEntrada: viva.tiempo,
      salida: precio, tiempoSalida: tiempo, pct, dias,
    });
    capital *= 1 + pct / 100;
    if (capital <= 0) {
      // Cuenta barrida: no hay con qué seguir. Se deja en cero y se anota
      // el día, en vez de arrastrar un capital negativo que no existe.
      capital = 0;
      arruinadoEn = tiempo;
    }
    viva = null;
  };

  for (let i = 0; i < velas.length; i++) {
    if (arruinadoEn !== null) break;
    const v = velas[i];
    if (viva) {
      if (viva.lado === 1) velasLargo++;
      else velasCorto++;
    }
    const s = porTiempo.get(v.time);
    if (s === "compra" && (!viva || viva.lado === -1)) {
      cerrar(v.close, v.time);
      viva = { lado: 1, entrada: v.close, tiempo: v.time };
    } else if (s === "venta" && (!viva || viva.lado === 1)) {
      cerrar(v.close, v.time);
      if (cfg.permitirCortos) viva = { lado: -1, entrada: v.close, tiempo: v.time };
      // En spot, tras el rojo se queda plano: no hay forma de ir corto.
    }
    // La curva se marca con lo realizado más lo que va ganando lo abierto.
    const flotante = viva
      ? (viva.lado === 1
          ? (v.close - viva.entrada) / viva.entrada
          : (viva.entrada - v.close) / viva.entrada)
      : 0;
    curva.push(capital * (1 + flotante));
  }
  // Lo que quede abierto se cierra al último precio: dejar una operación
  // sin resultado infla las estadísticas con una ganadora imaginaria.
  const ultima = velas[velas.length - 1];
  if (arruinadoEn === null) cerrar(ultima.close, ultima.time);

  const primera = velas[0];
  const compra = velas.map((v) => (v.close / primera.close) * 100);

  return {
    operaciones: ops,
    // Nunca por debajo de −100: perder más que todo no es una cosa que
    // pueda pasar, y leerlo como rendimiento invita a comparar peras con
    // nada.
    estrategiaPct: Math.max(-100, capital - 100),
    comprarYEsperarPct: (ultima.close / primera.close - 1) * 100,
    caidaEstrategiaPct: peorCaida(curva),
    caidaCompraPct: peorCaida(compra),
    tiempoLargoPct: (velasLargo / velas.length) * 100,
    tiempoCortoPct: (velasCorto / velas.length) * 100,
    arruinadoEn,
  };
}

/**
 * El resumen por operación, con su margen de error.
 *
 * Se devuelve el porcentaje medio por operación y el intervalo al 95 %.
 * Si el intervalo cruza el cero, no se puede afirmar que haya ventaja,
 * por bonito que sea el total.
 */
export function resumirSA(ops: OperacionSA[]): {
  n: number;
  mediaPct: number;
  margenPct: number;
  aciertos: number;
  concluyente: boolean;
} {
  const n = ops.length;
  if (n < 2) return { n, mediaPct: 0, margenPct: Infinity, aciertos: 0, concluyente: false };
  const media = ops.reduce((s, o) => s + o.pct, 0) / n;
  const desv = Math.sqrt(ops.reduce((s, o) => s + (o.pct - media) ** 2, 0) / (n - 1));
  // t de Student, no 1,96: con pocas operaciones el normal miente.
  const margen = (tDe(n - 1) * desv) / Math.sqrt(n);
  return {
    n,
    mediaPct: media,
    margenPct: margen,
    aciertos: ops.filter((o) => o.pct > 0).length / n,
    concluyente: Math.abs(media) > margen,
  };
}

/** t de Student al 95 %, dos colas. */
function tDe(gl: number): number {
  const tabla: Record<number, number> = {
    1: 12.71, 2: 4.303, 3: 3.182, 4: 2.776, 5: 2.571, 6: 2.447, 7: 2.365,
    8: 2.306, 9: 2.262, 10: 2.228, 12: 2.179, 15: 2.131, 20: 2.086,
    25: 2.06, 30: 2.042, 40: 2.021, 60: 2.0, 120: 1.98,
  };
  const claves = Object.keys(tabla).map(Number).sort((a, b) => a - b);
  for (const k of claves) if (gl <= k) return tabla[k];
  return 1.96;
}
