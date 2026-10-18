/**
 * La estrategia de la foto, de punta a punta.
 *
 * El guion es el de la imagen que pasó Diego:
 *
 *  1. 4H — el precio vuelve a un DESEQUILIBRIO alcista sin mitigar. Es
 *     la zona de interés; opcionalmente se exige que antes haya barrido
 *     un máximo previo de 4H (la liquidez de sesión).
 *  2. 15M — dentro de esa zona, el precio rompe el último máximo
 *     confirmado de 15M: el CHoCH. Eso da el sesgo comprador y deja un
 *     POI, el origen del impulso que rompió.
 *  3. Entrada (5M o 1M) — el precio vuelve a ese POI y ahí dentro rompe
 *     su último máximo: se entra al cierre de esa vela.
 *  4. Salida — stop debajo del mínimo hecho dentro del POI; parciales en
 *     el máximo previo de 15M y stop a breakeven; el resto a N erres.
 *
 * LO QUE HAY QUE CUIDAR. Las tres temporalidades se leen con
 * `indiceCerrado`, así que parado en una vela de 5M solo se ve la vela
 * de 4H que YA cerró. Y el recorrido es una pasada hacia adelante, vela
 * por vela, sin mirar ni una sola a la derecha. `verificar-smc.mjs`
 * corta la serie en veinte sitios y exige que las operaciones anteriores
 * no cambien.
 *
 * NO PRETENDE ser "la estrategia": es UNA codificación de ella. Las
 * partes discrecionales están como parámetros, a la vista.
 */

import type { Candle } from "@/lib/binance/types";
import {
  desequilibrios,
  indiceCerrado,
  mitigado,
  poiDelImpulso,
  swings,
  ultimoSwing,
  type Desequilibrio,
  type Swing,
} from "@/lib/estrategia/smc";

export interface ConfigEstrategia {
  /** Velas a cada lado para confirmar un pivote. Más alto = menos señales. */
  fractal: number;
  /** Exigir que el precio haya barrido un máximo de 4H antes de la zona. */
  exigirBarrido: boolean;
  /** Cómo se marca el POI de 15M. Es la parte más discrecional. */
  poi: "vela" | "hueco";
  /** Erres objetivo del tramo que queda después de las parciales. */
  rrObjetivo: number;
  /** Fracción que se cierra en el máximo previo de 15M, de 0 a 1. */
  parcial: number;
  /** Comisión por lado, en porcentaje (0.05 = 0,05 %). */
  comision: number;
  /** Diferencial de compra-venta, en porcentaje. Se paga entero al entrar. */
  spread: number;
  /** Holgura del stop bajo el mínimo, en porcentaje del precio. */
  holguraStop: number;
  /** Velas de la TF de entrada que puede esperar un montaje antes de caducar. */
  esperaMaxima: number;
  /** Porcentaje del capital arriesgado por operación. */
  riesgoPct: number;
}

export const CONFIG_POR_DEFECTO: ConfigEstrategia = {
  fractal: 2,
  exigirBarrido: true,
  poi: "vela",
  rrObjetivo: 5,
  parcial: 0.5,
  // Binance futuros taker, ida y vuelta: 0,05 % por lado.
  comision: 0.05,
  spread: 0.02,
  holguraStop: 0.03,
  esperaMaxima: 240,
  riesgoPct: 1,
};

export type MotivoSalida = "stop" | "objetivo" | "breakeven" | "final";

export interface OperacionEstrategia {
  entrada: number;
  tiempoEntrada: number;
  stop: number;
  /** Máximo previo de 15M: donde se toman las parciales. */
  objetivo1: number;
  /** Donde va el resto, a `rrObjetivo` erres. */
  objetivo2: number;
  salida: number;
  tiempoSalida: number;
  motivo: MotivoSalida;
  /** Resultado en erres, ya con parciales, comisión y diferencial. */
  erres: number;
  /** Resultado en porcentaje del capital, con el riesgo configurado. */
  pct: number;
  /** Si llegó a tocar el objetivo 1 (las parciales). */
  tocoParcial: boolean;
  /** Zona de 4H que originó el montaje, para poder mirarla después. */
  zona4h: { piso: number; techo: number; time: number };
}

export interface ResultadoEstrategia {
  operaciones: OperacionEstrategia[];
  /** Montajes que caducaron sin llegar a entrada. */
  caducados: number;
  /** Montajes invalidados porque el precio perdió la zona de 4H. */
  invalidados: number;
}

/** Una operación viva, con lo que hace falta para gestionarla. */
export interface Abierta {
  entrada: number;
  tiempoEntrada: number;
  stop: number;
  stopOriginal: number;
  objetivo1: number;
  objetivo2: number;
  riesgo: number;
  zona4h: { piso: number; techo: number; time: number };
  tocoParcial: boolean;
  cerradoParcial: number;
  acumulado: number;
}

type Estado =
  | { fase: "buscando" }
  | { fase: "enZona"; zona: Desequilibrio; desde: number }
  | {
      fase: "esperandoPoi";
      zona: Desequilibrio;
      desde: number;
      poi: { piso: number; techo: number };
      objetivo1: number;
    }
  | {
      fase: "enPoi";
      zona: Desequilibrio;
      desde: number;
      poi: { piso: number; techo: number };
      objetivo1: number;
      minimo: number;
    };

/**
 * Corre la estrategia sobre tres series ya bajadas.
 *
 * `entrada` manda el reloj: es la serie fina (5M o 1M) y se recorre vela
 * a vela. Las otras dos se consultan por tiempo.
 */
export function correrEstrategia(
  h4: Candle[],
  m15: Candle[],
  entrada: Candle[],
  segEntrada: number,
  cfg: ConfigEstrategia = CONFIG_POR_DEFECTO,
): ResultadoEstrategia {
  const ops: OperacionEstrategia[] = [];
  let caducados = 0;
  let invalidados = 0;
  if (h4.length < 10 || m15.length < 10 || entrada.length < 10) {
    return { operaciones: ops, caducados, invalidados };
  }

  const SEG_4H = 14400;
  const SEG_15M = 900;

  // Derivados causales: un swing se sabe en `confirmadoEn` y un hueco en
  // su propia vela, así que calcularlos de una vez sobre la serie entera
  // NO adelanta nada. Está comprobado cortando la serie.
  const sw4 = swings(h4, cfg.fractal);
  const sw15 = swings(m15, cfg.fractal);
  const swE = swings(entrada, cfg.fractal);
  const huecos4 = desequilibrios(h4).filter((d) => d.alcista);

  let estado: Estado = { fase: "buscando" };
  /** Operación abierta, si hay. */
  let abierta: Abierta | null = null;

  const costo = (cfg.comision * 2 + cfg.spread) / 100;

  for (let t = 0; t < entrada.length; t++) {
    const v = entrada[t];
    const i4 = indiceCerrado(h4, v.time, SEG_4H);
    const i15 = indiceCerrado(m15, v.time, SEG_15M);
    if (i4 < cfg.fractal * 2 || i15 < cfg.fractal * 2) continue;

    // ── gestión de lo abierto ────────────────────────────────────────
    if (abierta) {
      const cerrada = gestionar(abierta, v, cfg, costo);
      if (cerrada) {
        ops.push(cerrada);
        abierta = null;
        estado = { fase: "buscando" };
      }
      continue;
    }

    // ── 1. ¿el precio está dentro de un desequilibrio de 4H? ─────────
    if (estado.fase === "buscando") {
      const zona = zonaViva(huecos4, h4, i4, v.low, v.high);
      if (!zona) continue;
      if (cfg.exigirBarrido && !huboBarrido(sw4, h4, zona, i4)) continue;
      estado = { fase: "enZona", zona, desde: t };
      continue;
    }

    // Fuera de la zona por abajo: el montaje se cae.
    if (v.close < estado.zona.piso) {
      invalidados++;
      estado = { fase: "buscando" };
      continue;
    }
    if (t - estado.desde > cfg.esperaMaxima) {
      caducados++;
      estado = { fase: "buscando" };
      continue;
    }

    // ── 2. CHoCH de 15M dentro de la zona ────────────────────────────
    if (estado.fase === "enZona") {
      const alto = ultimoSwing(sw15, "alto", i15);
      const bajo = ultimoSwing(sw15, "bajo", i15);
      if (!alto || !bajo || bajo.i < alto.i) continue;
      // Rompe hacia arriba el último máximo confirmado, viniendo de un
      // mínimo posterior: eso es el cambio de carácter.
      if (v.close <= alto.precio) continue;
      const poi = poiDelImpulso(m15, i15, bajo.i, cfg.poi);
      if (!poi) continue;
      // Las parciales van al máximo previo de 15M que siga SIN romper.
      const obj1 = altoSinRomper(sw15, m15, i15, v.close);
      if (obj1 === null) continue;
      estado = {
        fase: "esperandoPoi",
        zona: estado.zona,
        desde: estado.desde,
        poi: { piso: poi.piso, techo: poi.techo },
        objetivo1: obj1,
      };
      continue;
    }

    // ── 3. el precio vuelve al POI ───────────────────────────────────
    if (estado.fase === "esperandoPoi") {
      if (v.low <= estado.poi.techo) {
        estado = {
          fase: "enPoi",
          zona: estado.zona,
          desde: estado.desde,
          poi: estado.poi,
          objetivo1: estado.objetivo1,
          minimo: v.low,
        };
      }
      continue;
    }

    // ── 4. CHoCH en la TF de entrada, dentro del POI ─────────────────
    if (estado.fase === "enPoi") {
      if (v.low < estado.minimo) estado.minimo = v.low;
      const altoE = ultimoSwing(swE, "alto", t);
      if (!altoE || v.close <= altoE.precio) continue;
      // El máximo roto tiene que ser POSTERIOR al momento en que el
      // precio entró al POI: si no, se estaría rompiendo un máximo viejo.
      if (altoE.i < estado.desde) continue;

      const precioEntrada = v.close * (1 + cfg.spread / 100 / 2);
      const stop = estado.minimo * (1 - cfg.holguraStop / 100);
      const riesgo = precioEntrada - stop;
      if (riesgo <= 0) {
        estado = { fase: "buscando" };
        continue;
      }
      const obj2 = precioEntrada + riesgo * cfg.rrObjetivo;
      abierta = {
        entrada: precioEntrada,
        tiempoEntrada: v.time,
        stop,
        stopOriginal: stop,
        // Si el máximo previo de 15M ya quedó por debajo de la entrada,
        // no sirve como objetivo: se usa la mitad del recorrido a N erres.
        objetivo1:
          estado.objetivo1 > precioEntrada
            ? estado.objetivo1
            : precioEntrada + riesgo * (cfg.rrObjetivo / 2),
        objetivo2: obj2,
        riesgo,
        zona4h: { piso: estado.zona.piso, techo: estado.zona.techo, time: estado.zona.time },
        tocoParcial: false,
        cerradoParcial: 0,
        acumulado: 0,
      };
      estado = { fase: "buscando" };
    }
  }

  // Lo que quedó abierto al final se cierra al último precio, para no
  // dejar una operación sin resultado inflando las estadísticas.
  if (abierta) {
    const ultima = entrada[entrada.length - 1];
    const resto = 1 - abierta.cerradoParcial;
    const erresF = (ultima.close - abierta.entrada) / abierta.riesgo;
    const erres = abierta.acumulado + erresF * resto - costoEnErres(costo, abierta);
    ops.push(cerrar(abierta, ultima.close, ultima.time, "final", erres, CONFIG_POR_DEFECTO));
  }

  return { operaciones: ops, caducados, invalidados };
}

/**
 * Un paso de gestión de la operación abierta. Devuelve la operación
 * cerrada, o null si sigue viva (mutando el stop y las parciales).
 *
 * Está aparte porque acá vive el supuesto más peligroso de cualquier
 * backtest: QUÉ PASA PRIMERO DENTRO DE UNA VELA. Con solo OHLC no se
 * sabe si el precio tocó antes el stop o el objetivo. Suponer lo bueno
 * primero convierte en ganadoras operaciones que en vivo habrían saltado
 * por el stop, y eso sube el resultado sin que nadie lo note.
 *
 * Acá se supone SIEMPRE lo malo: si la vela tocó el stop, se cobra el
 * stop, aunque también hubiera tocado el objetivo. El backtest queda
 * entonces como cota inferior, que es el lado correcto para decidir.
 */
export function gestionar(
  a: Abierta,
  v: Candle,
  cfg: ConfigEstrategia,
  costo: number,
): OperacionEstrategia | null {
  if (v.low <= a.stop) {
    const resto = 1 - a.cerradoParcial;
    const erresStop = (a.stop - a.entrada) / a.riesgo;
    const erres = a.acumulado + erresStop * resto - costoEnErres(costo, a);
    return cerrar(a, a.stop, v.time, a.tocoParcial ? "breakeven" : "stop", erres, cfg);
  }
  if (!a.tocoParcial && v.high >= a.objetivo1) {
    const erresP = (a.objetivo1 - a.entrada) / a.riesgo;
    a.acumulado += erresP * cfg.parcial;
    a.cerradoParcial = cfg.parcial;
    a.tocoParcial = true;
    // Stop a breakeven, como dice la foto: "TP1 (BE)".
    a.stop = a.entrada;
    // Y LA MISMA VELA SE REVISA CONTRA EL STOP NUEVO.
    //
    // Sin esto, la vela que cobra la parcial le regala a la operación
    // una opción gratis: dentro de esa vela el precio puede haber
    // vuelto a la entrada —que ya es el stop— y aun así la operación
    // seguía viva para cobrar el 3R después. Como no se sabe en qué
    // orden pasaron las cosas dentro de la vela, hay que suponer lo
    // peor, igual que en todo el resto del motor. El control del paseo
    // aleatorio lo cantó: con los máximos y mínimos bien construidos
    // daba +0,13R por operación donde no hay nada que ganar.
    if (v.low <= a.stop) {
      // El stop ES la entrada, así que el resto de la posición sale en
      // cero erres y solo queda lo cobrado en la parcial, menos costos.
      return cerrar(a, a.stop, v.time, "breakeven", a.acumulado - costoEnErres(costo, a), cfg);
    }
  }
  if (a.tocoParcial && v.high >= a.objetivo2) {
    const resto = 1 - a.cerradoParcial;
    const erresO = (a.objetivo2 - a.entrada) / a.riesgo;
    const erres = a.acumulado + erresO * resto - costoEnErres(costo, a);
    return cerrar(a, a.objetivo2, v.time, "objetivo", erres, cfg);
  }
  return null;
}

/** El costo de ida y vuelta, expresado en erres de esta operación. */
function costoEnErres(costo: number, a: { entrada: number; riesgo: number }): number {
  return (a.entrada * costo) / a.riesgo;
}

function cerrar(
  a: Abierta,
  salida: number,
  tiempoSalida: number,
  motivo: MotivoSalida,
  erres: number,
  cfg: ConfigEstrategia,
): OperacionEstrategia {
  return {
    entrada: a.entrada,
    tiempoEntrada: a.tiempoEntrada,
    stop: a.stopOriginal,
    objetivo1: a.objetivo1,
    objetivo2: a.objetivo2,
    salida,
    tiempoSalida,
    motivo,
    erres,
    pct: erres * cfg.riesgoPct,
    tocoParcial: a.tocoParcial,
    zona4h: a.zona4h,
  };
}

/** El desequilibrio alcista de 4H, sin mitigar, al que el precio acaba de llegar. */
function zonaViva(
  huecos: Desequilibrio[],
  h4: Candle[],
  i4: number,
  low: number,
  high: number,
): Desequilibrio | null {
  // Del más reciente hacia atrás: el que el precio está tocando ahora.
  for (let x = huecos.length - 1; x >= 0; x--) {
    const d = huecos[x];
    if (d.i > i4) continue;
    if (high < d.piso || low > d.techo) continue;
    // Si ya lo habían rellenado del todo antes, dejó de servir.
    if (mitigado(d, h4, i4 - 1, true)) continue;
    return d;
  }
  return null;
}

/**
 * ¿Barrió el impulso que creó la zona un máximo ANTERIOR?
 *
 * El orden importa y la primera versión lo tenía al revés. En la foto el
 * "PREVIOUS HIGH" ya estaba ahí ANTES; el impulso que deja los
 * desequilibrios es el que lo pasa por arriba y toma esa liquidez. Un
 * máximo que nace después de la zona no es lo que se barre.
 *
 * Así que se busca un máximo de 4H que ya se supiera cuando se formó la
 * zona, y se exige que alguna vela desde entonces lo haya superado.
 */
function huboBarrido(
  sw4: Swing[],
  h4: Candle[],
  zona: Desequilibrio,
  i4: number,
): boolean {
  for (let x = sw4.length - 1; x >= 0; x--) {
    const s = sw4[x];
    if (s.tipo !== "alto") continue;
    // Tenía que ser un máximo ya conocido cuando se formó la zona.
    if (s.confirmadoEn > zona.i) continue;
    for (let i = zona.i; i <= i4; i++) {
      if (h4[i].high > s.precio) return true;
    }
    // Solo se mira el máximo previo más cercano: si ese no se barrió,
    // los de más atrás están todavía más lejos.
    return false;
  }
  return false;
}

/** El máximo de 15M más cercano por encima del precio que siga sin romperse. */
function altoSinRomper(
  sw15: Swing[],
  m15: Candle[],
  i15: number,
  precio: number,
): number | null {
  let mejor: number | null = null;
  for (const s of sw15) {
    if (s.tipo !== "alto" || s.confirmadoEn > i15) continue;
    if (s.precio <= precio) continue;
    let roto = false;
    for (let i = s.i + 1; i <= i15; i++) {
      if (m15[i].high > s.precio) {
        roto = true;
        break;
      }
    }
    if (roto) continue;
    if (mejor === null || s.precio < mejor) mejor = s.precio;
  }
  return mejor;
}
