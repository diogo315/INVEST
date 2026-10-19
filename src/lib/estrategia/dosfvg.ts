/**
 * La estrategia de los dos FVG: 4H marca, 15M entra.
 *
 * Es la del tuit, y el guion entero son cuatro líneas:
 *
 *   1. Esperá a que se forme un FVG de 4H.
 *   2. Esperá a que el precio lo toque.
 *   3. Esperá a que se forme un FVG de 15M en la MISMA dirección.
 *   4. Entrá en ese FVG de 15M, objetivo 3RR.
 *
 * Es mucho más simple que la de tres tiempos: sin barrido, sin cambio de
 * carácter, sin temporalidad fina. Solo dos series y dos huecos. Eso la
 * hace medible de verdad en seis meses, porque dispara bastante más.
 *
 * LOS DOS HUECOS DEL TUIT, y cómo se taparon:
 *
 *   · NO DICE DÓNDE VA EL STOP. Sin stop no existe el 3RR. Por defecto va
 *     al borde lejano del FVG de 15M —si el hueco se rellena entero, la
 *     idea que lo justificaba se cayó— y se puede mover al mínimo del
 *     swing que lo creó, que es más ancho y aguanta más.
 *   · NO DICE EN QUÉ PARTE DEL FVG SE ENTRA. El borde cercano llena casi
 *     siempre pero deja el stop lejos; el lejano da mejor precio pero
 *     muchas veces no llega. Por defecto, la mitad (el "consequent
 *     encroachment" de siempre).
 *
 * Las dos decisiones cambian el resultado MUCHO, así que son parámetros
 * a la vista, no supuestos escondidos.
 *
 * Sin imports de la app salvo los tipos y las piezas de `smc.ts`:
 *   node --experimental-strip-types scripts/verificar-dosfvg.mjs
 */

import type { Candle } from "@/lib/binance/types";
import {
  desequilibrios,
  indiceCerrado,
  mitigado,
  swings,
  type Desequilibrio,
} from "@/lib/estrategia/smc";

export interface ConfigDosFvg {
  /**
   * Qué cuenta como "tocar" el FVG de 4H: rozar el borde, o rellenarlo
   * entero. Rozar da muchas más señales; rellenar, menos y más tardías.
   */
  toqueCompleto: boolean;
  /** Velas de 15M que se espera el FVG de 15M después del toque. */
  esperaFvg: number;
  /** Velas de 15M que se espera a que el precio vuelva al FVG de 15M. */
  esperaEntrada: number;
  /**
   * En qué parte del FVG de 15M se entra: 0 el borde que el precio toca
   * primero, 1 el del fondo, 0.5 la mitad.
   */
  entradaEn: number;
  /**
   * Dónde va el stop: al otro lado del hueco de 15M, o en el swing que
   * creó ese hueco.
   *
   * Por defecto va al SWING, y no es una preferencia estética. Con el
   * stop al borde del hueco, el control del paseo aleatorio marca
   * +0,21R por operación con una duración mediana de UNA vela: el 3R
   * cae dentro del recorrido de una sola vela de quince minutos, así
   * que lo que se está midiendo es el rango intravela y no la
   * estrategia. Con el stop en el swing la duración mediana sube a 7
   * velas y el control da −0,06R, que es lo correcto para un paseo sin
   * tendencia. `"hueco"` queda disponible porque hay quien lo opera
   * así, pero sus números no son comparables.
   */
  stop: "hueco" | "swing";
  /** Holgura más allá del stop, en porcentaje del precio. */
  holguraStop: number;
  /**
   * Stop mínimo, en porcentaje del precio. Debajo de eso, el montaje se
   * descarta.
   *
   * SIN ESTO LA ESTRATEGIA NO ES LA ESTRATEGIA. Un FVG de 15M puede
   * medir dos centésimas de por ciento; con el stop ahí pegado, el
   * objetivo de 3R entra en el rango de UNA sola vela y la operación
   * abre y cierra en la misma. Medido: la duración mediana era cero
   * velas. Eso no mide "entrar en el FVG y aguantar hasta 3R", mide el
   * recorrido de una vela de quince minutos. Y en vivo ni se podría
   * operar: el diferencial solo ya se come un stop así.
   */
  stopMinimoPct: number;
  /** Erres objetivo. El tuit dice 3. */
  rr: number;
  /**
   * A cuántas erres a favor el stop sube a la entrada. 0 lo apaga.
   *
   * Subir el stop NO crea ventaja: cambia la forma del resultado, no su
   * media. Cambia perdedoras enteras por salidas en cero, y a cambio
   * corta operaciones que habrían llegado al objetivo después de un
   * retroceso. Con costos es incluso algo peor que cero, porque salir en
   * la entrada igual paga comisión y diferencial. Sirve para ver cuánto
   * de la esperanza depende de aguantar el retroceso, que es información
   * útil, pero no es una forma de mejorar el número.
   */
  breakevenEn: number;
  /** Comisión por lado, en porcentaje. */
  comision: number;
  /** Diferencial, en porcentaje. */
  spread: number;
  /** Velas de 15M que puede durar la operación antes de cerrarse sola. */
  duracionMaxima: number;
  /** Operar también los FVG bajistas de 4H (cortos). */
  permitirCortos: boolean;
  /** Velas a cada lado para los pivotes, si el stop va al swing. */
  fractal: number;
}

export const DOSFVG_POR_DEFECTO: ConfigDosFvg = {
  toqueCompleto: false,
  esperaFvg: 96, // un día de 15M
  esperaEntrada: 96,
  entradaEn: 0.5,
  stop: "swing",
  holguraStop: 0.03,
  stopMinimoPct: 0.15,
  rr: 3,
  breakevenEn: 0,
  comision: 0.05,
  spread: 0.02,
  duracionMaxima: 480, // cinco días de 15M
  permitirCortos: true,
  fractal: 2,
};

export type MotivoDosFvg = "stop" | "objetivo" | "breakeven" | "tiempo" | "final";

export interface OperacionDosFvg {
  lado: "largo" | "corto";
  entrada: number;
  tiempoEntrada: number;
  stop: number;
  objetivo: number;
  salida: number;
  tiempoSalida: number;
  motivo: MotivoDosFvg;
  erres: number;
  /** El FVG de 4H que la originó. */
  zona4h: { piso: number; techo: number; time: number };
  /** El FVG de 15M donde se entró. */
  zona15: { piso: number; techo: number; time: number };
}

export interface ResultadoDosFvg {
  operaciones: OperacionDosFvg[];
  /** Toques de 4H que nunca dieron un FVG de 15M. */
  sinFvg15: number;
  /** FVG de 15M a los que el precio nunca volvió. */
  sinEntrada: number;
}

const SEG_4H = 14400;

/** Una operación viva. */
interface Viva {
  lado: 1 | -1;
  entrada: number;
  tiempoEntrada: number;
  /** El stop vigente: sube a la entrada si se activa el breakeven. */
  stop: number;
  /** El que se puso al abrir, que es el que se informa. */
  stopOriginal: number;
  enBreakeven: boolean;
  objetivo: number;
  riesgo: number;
  abiertaEn: number;
  zona4h: { piso: number; techo: number; time: number };
  zona15: { piso: number; techo: number; time: number };
}

/**
 * Un paso de gestión. Devuelve la operación cerrada o null si sigue viva.
 *
 * Igual que en la otra estrategia: si la vela tocó el stop, se cobra el
 * stop, aunque también hubiera tocado el objetivo. Con solo OHLC el orden
 * dentro de la vela es una incógnita, y suponer lo bueno infla el
 * resultado sin que se note.
 */
export function gestionarDosFvg(
  a: Viva,
  v: Candle,
  t: number,
  cfg: ConfigDosFvg,
  costo: number,
): OperacionDosFvg | null {
  const pegoStop = a.lado === 1 ? v.low <= a.stop : v.high >= a.stop;
  if (pegoStop) {
    return cerrar(a, a.stop, v.time, a.enBreakeven ? "breakeven" : "stop", cfg, costo);
  }

  // Breakeven ANTES del objetivo, a propósito.
  //
  // Si una vela llega al disparador, vuelve a la entrada y recién
  // después toca el objetivo, con solo OHLC ese orden es indistinguible
  // del otro. Se supone el malo: stop movido y operación cerrada en
  // cero. Revisar el objetivo primero sería quedarse con lo bueno de
  // los dos mundos, que es justo lo que infla un backtest sin que se
  // note.
  if (cfg.breakevenEn > 0 && !a.enBreakeven) {
    const disparo = a.entrada + a.lado * cfg.breakevenEn * a.riesgo;
    const llego = a.lado === 1 ? v.high >= disparo : v.low <= disparo;
    if (llego) {
      a.enBreakeven = true;
      a.stop = a.entrada;
      // LA MISMA VELA SE REVISA CONTRA EL STOP NUEVO.
      const volvio = a.lado === 1 ? v.low <= a.stop : v.high >= a.stop;
      if (volvio) return cerrar(a, a.stop, v.time, "breakeven", cfg, costo);
    }
  }

  const pegoObjetivo = a.lado === 1 ? v.high >= a.objetivo : v.low <= a.objetivo;
  if (pegoObjetivo) return cerrar(a, a.objetivo, v.time, "objetivo", cfg, costo);
  if (t - a.abiertaEn >= cfg.duracionMaxima) {
    return cerrar(a, v.close, v.time, "tiempo", cfg, costo);
  }
  return null;
}

function cerrar(
  a: Viva,
  salida: number,
  tiempoSalida: number,
  motivo: MotivoDosFvg,
  cfg: ConfigDosFvg,
  costo: number,
): OperacionDosFvg {
  const bruto = (a.lado * (salida - a.entrada)) / a.riesgo;
  return {
    lado: a.lado === 1 ? "largo" : "corto",
    entrada: a.entrada,
    tiempoEntrada: a.tiempoEntrada,
    stop: a.stopOriginal,
    objetivo: a.objetivo,
    salida,
    tiempoSalida,
    motivo,
    erres: bruto - (a.entrada * costo) / a.riesgo,
    zona4h: a.zona4h,
    zona15: a.zona15,
  };
}

type Fase =
  | { f: "buscando" }
  | { f: "tocado"; zona: Desequilibrio; alcista: boolean; desde: number }
  | {
      f: "esperandoEntrada";
      zona: Desequilibrio;
      alcista: boolean;
      desde: number;
      hueco: Desequilibrio;
      nivel: number;
      stop: number;
    };

/**
 * Corre la estrategia sobre las dos series.
 *
 * `m15` manda el reloj. La serie de 4H se consulta por tiempo y solo con
 * velas YA CERRADAS: parado en una vela de 15M de media mañana, la de 4H
 * en curso todavía no terminó y su cierre no se puede usar.
 */
export function correrDosFvg(
  h4: Candle[],
  m15: Candle[],
  cfg: ConfigDosFvg = DOSFVG_POR_DEFECTO,
): ResultadoDosFvg {
  const ops: OperacionDosFvg[] = [];
  let sinFvg15 = 0;
  let sinEntrada = 0;
  if (h4.length < 10 || m15.length < 50) return { operaciones: ops, sinFvg15, sinEntrada };

  const huecos4 = desequilibrios(h4);
  const huecos15 = desequilibrios(m15);
  // Índice por vela para no recorrer la lista entera en cada paso.
  const h15Por = new Map<number, Desequilibrio[]>();
  for (const d of huecos15) {
    const l = h15Por.get(d.i);
    if (l) l.push(d);
    else h15Por.set(d.i, [d]);
  }
  const sw15 = cfg.stop === "swing" ? swings(m15, cfg.fractal) : [];
  const costo = (cfg.comision * 2 + cfg.spread) / 100;

  let fase: Fase = { f: "buscando" };
  let viva: Viva | null = null;

  for (let t = 0; t < m15.length; t++) {
    const v = m15[t];
    const i4 = indiceCerrado(h4, v.time, SEG_4H);
    if (i4 < 3) continue;

    if (viva) {
      const cerrada = gestionarDosFvg(viva, v, t, cfg, costo);
      if (cerrada) {
        ops.push(cerrada);
        viva = null;
        fase = { f: "buscando" };
      }
      continue;
    }

    // ── 1 y 2. ¿el precio está tocando un FVG de 4H sin mitigar? ─────
    if (fase.f === "buscando") {
      const z = tocando(huecos4, h4, i4, v, cfg);
      if (z && (z.alcista || cfg.permitirCortos)) {
        fase = { f: "tocado", zona: z, alcista: z.alcista, desde: t };
      }
      continue;
    }

    // ── 3. un FVG de 15M en la misma dirección ───────────────────────
    if (fase.f === "tocado") {
      // Se copia a una const: `fase` es mutable, y TypeScript pierde el
      // estrechamiento dentro de la función de búsqueda.
      const zona: Desequilibrio = fase.zona;
      const alcista: boolean = fase.alcista;
      const desde: number = fase.desde;
      if (t - desde > cfg.esperaFvg) {
        sinFvg15++;
        fase = { f: "buscando" };
        continue;
      }
      const h: Desequilibrio | undefined = h15Por.get(t)?.find((d) => d.alcista === alcista);
      if (!h) continue;
      // El nivel de entrada, dentro del hueco. Para un largo el precio
      // baja a buscarlo: el borde que toca primero es el techo.
      const ancho = h.techo - h.piso;
      const nivel: number = alcista
        ? h.techo - ancho * cfg.entradaEn
        : h.piso + ancho * cfg.entradaEn;
      const stop = nivelStop(h, alcista, m15, sw15, t, cfg);
      // Un stop del lado equivocado no es una operación.
      if ((alcista && stop >= nivel) || (!alcista && stop <= nivel)) {
        fase = { f: "buscando" };
        continue;
      }
      // Ni un stop tan pegado que la operación se resuelva dentro de una
      // vela. Ver el comentario de `stopMinimoPct`.
      if ((Math.abs(nivel - stop) / nivel) * 100 < cfg.stopMinimoPct) {
        fase = { f: "buscando" };
        continue;
      }
      fase = { f: "esperandoEntrada", zona, alcista, desde: t, hueco: h, nivel, stop };
      continue;
    }

    // ── 4. el precio vuelve al FVG de 15M: se entra ──────────────────
    if (fase.f === "esperandoEntrada") {
      if (t - fase.desde > cfg.esperaEntrada) {
        sinEntrada++;
        fase = { f: "buscando" };
        continue;
      }
      // Si el precio se fue más allá del stop sin tocar la entrada, el
      // montaje ya no vale: el hueco se rellenó del lado malo.
      const reventado = fase.alcista ? v.low <= fase.stop : v.high >= fase.stop;
      const llego = fase.alcista ? v.low <= fase.nivel : v.high >= fase.nivel;
      if (reventado && !llego) {
        sinEntrada++;
        fase = { f: "buscando" };
        continue;
      }
      if (!llego) continue;

      const lado: 1 | -1 = fase.alcista ? 1 : -1;
      // Entra a precio límite, pagando el medio diferencial.
      const entrada = fase.nivel * (1 + (lado * cfg.spread) / 100 / 2);
      const riesgo = lado * (entrada - fase.stop);
      if (riesgo <= 0) {
        fase = { f: "buscando" };
        continue;
      }
      viva = {
        lado,
        entrada,
        tiempoEntrada: v.time,
        stop: fase.stop,
        stopOriginal: fase.stop,
        enBreakeven: false,
        objetivo: entrada + lado * riesgo * cfg.rr,
        riesgo,
        abiertaEn: t,
        zona4h: { piso: fase.zona.piso, techo: fase.zona.techo, time: fase.zona.time },
        zona15: { piso: fase.hueco.piso, techo: fase.hueco.techo, time: fase.hueco.time },
      };
      fase = { f: "buscando" };

      // LA MISMA VELA QUE LLENA LA ENTRADA SE REVISA YA.
      //
      // Esto no es un detalle. Una vela que se hunde a buscar el FVG
      // puede pasar de largo y llevarse el stop en el mismo movimiento.
      // Dejándolo para la vuelta siguiente, esa pérdida desaparecía y
      // el backtest se quedaba con las que se recuperaban. El control
      // del paseo aleatorio lo cantó: daba +0,74R por operación donde
      // no hay NADA que ganar.
      const deInmediato = gestionarDosFvg(viva, v, t, cfg, costo);
      if (deInmediato) {
        ops.push(deInmediato);
        viva = null;
      }
    }
  }

  if (viva) {
    const u = m15[m15.length - 1];
    ops.push(cerrar(viva, u.close, u.time, "final", cfg, costo));
  }
  return { operaciones: ops, sinFvg15, sinEntrada };
}

/** El FVG de 4H sin mitigar que la vela actual está tocando. */
function tocando(
  huecos: Desequilibrio[],
  h4: Candle[],
  i4: number,
  v: Candle,
  cfg: ConfigDosFvg,
): Desequilibrio | null {
  for (let x = huecos.length - 1; x >= 0; x--) {
    const d = huecos[x];
    if (d.i > i4) continue;
    // Ya recorrido en 4H antes de ahora: dejó de ser una zona.
    if (mitigado(d, h4, i4 - 1, true)) continue;
    const toca = cfg.toqueCompleto
      ? d.alcista
        ? v.low <= d.piso
        : v.high >= d.techo
      : d.alcista
        ? v.low <= d.techo && v.high >= d.piso
        : v.high >= d.piso && v.low <= d.techo;
    if (toca) return d;
  }
  return null;
}

/** Dónde va el stop, según el parámetro. */
function nivelStop(
  h: Desequilibrio,
  alcista: boolean,
  m15: Candle[],
  sw15: ReturnType<typeof swings>,
  t: number,
  cfg: ConfigDosFvg,
): number {
  const holgura = 1 + cfg.holguraStop / 100;
  if (cfg.stop === "hueco") {
    // Al otro lado del hueco: si se rellena entero, la idea se cayó.
    return alcista ? h.piso / holgura : h.techo * holgura;
  }
  // En el swing que creó el hueco: más ancho, aguanta más mecha.
  const tipo = alcista ? "bajo" : "alto";
  for (let x = sw15.length - 1; x >= 0; x--) {
    const s = sw15[x];
    if (s.tipo !== tipo || s.confirmadoEn > t || s.i > h.i) continue;
    return alcista ? s.precio / holgura : s.precio * holgura;
  }
  return alcista ? h.piso / holgura : h.techo * holgura;
}
