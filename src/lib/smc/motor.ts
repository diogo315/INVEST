/**
 * Smart Money Concepts, portado del indicador de LuxAlgo para Pine v5.
 *
 * Indicador original: "Smart Money Concepts (SMC)" © LuxAlgo, publicado
 * bajo Attribution-NonCommercial-ShareAlike 4.0 International
 * (CC BY-NC-SA 4.0) — https://creativecommons.org/licenses/by-nc-sa/4.0/
 * La parte de "Entradas BOS + retesteo" es la modificación de Diego sobre
 * ese indicador. Esta traducción a TypeScript es obra derivada y hereda la
 * misma licencia: se mantiene la atribución y el uso no es comercial.
 *
 * Qué es esto: el MOTOR, sin React ni gráfico. Recibe velas y devuelve
 * dónde pasó cada cosa; dibujarlo es problema de otra capa. Separado así
 * se puede probar solo, que es la única forma de saber si un port de 900
 * líneas de Pine quedó fiel:
 *   node --experimental-strip-types scripts/verificar-smc.mjs
 *
 * SOBRE LA FIDELIDAD AL ORIGINAL
 *
 * Pine recorre las velas de a una y guarda estado entre ellas (`var`).
 * Acá se hace lo mismo: un solo recorrido hacia adelante, sin mirar nunca
 * una vela posterior a la que se está procesando. Esa disciplina no es
 * estética: es lo que permite que el backtest no haga trampa.
 *
 * Donde el original tiene una rareza, se respeta y se dice en un
 * comentario. Donde tiene un error que cambiaría los números, se corrige
 * y TAMBIÉN se dice. Hay exactamente una corrección así, en la mitigación
 * de bloques; está marcada abajo.
 */

import type { Candle } from "@/lib/binance/types";
import { rangoVerdadero, rma } from "@/lib/indicators/nuevos";

export const ALCISTA = 1;
export const BAJISTA = -1;
export type Sesgo = 1 | -1 | 0;

// ─────────────────────────────── ajustes ──────────────────────────────

export type FiltroBloques = "atr" | "rango";
export type MitigacionBloques = "cierre" | "maxmin";
export type EstructuraSenal = "interna" | "swing";

export interface ConfigSMC {
  /** Velas a cada lado para confirmar un pivote de swing (Pine: 50). */
  largoSwing: number;
  /** Lo mismo para la estructura interna. En el original es fijo en 5. */
  largoInterno: number;
  /** Exige que la vela del cruce tenga mecha del lado correcto. */
  filtroConfluencia: boolean;
  filtroBloques: FiltroBloques;
  mitigacionBloques: MitigacionBloques;
  maxBloquesInternos: number;
  maxBloquesSwing: number;
  /** Velas de confirmación del pivote para EQH/EQL (Pine: 3). */
  barrasIguales: number;
  /** Cuán cerca tienen que estar dos máximos para ser "iguales", en ATR. */
  umbralIguales: number;
  /** FVG: exigir que el impulso supere el promedio histórico. */
  umbralFvgAuto: boolean;
  /** Señales BOS + retesteo. */
  senales: ConfigSenales;
}

export interface ConfigSenales {
  activas: boolean;
  estructura: EstructuraSenal;
  /** Velas que puede esperar un retesteo antes de darse por perdido. */
  expiracion: number;
  /** Cuánto se acepta que el retesteo no llegue justo al nivel. */
  toleranciaTicks: number;
  /** Cuánto se aleja el stop del extremo que lo define. */
  margenTicks: number;
  /** Objetivo cuando no hay ningún obstáculo adelante, en múltiplos de R. */
  objetivoR: number;
  /** Debajo de esta relación beneficio/riesgo, la entrada se descarta. */
  relacionMinima: number;
  /** El paso mínimo de precio del mercado (el `mintick` de Pine). */
  tick: number;
  /**
   * Si los bloques de SWING también acortan el objetivo.
   *
   * DESVÍO DEL ORIGINAL, a propósito. En Pine los bloques solo existen
   * si su casilla de "mostrar" está puesta, así que encender un dibujo
   * cambia las señales sin avisar: un backtest dejaría de ser
   * reproducible según cómo quedó una casilla. Acá el motor calcula
   * siempre las dos familias y es ESTE ajuste —y no lo que se ve— el
   * que decide cuáles estorban al objetivo. Viene en false, que es el
   * comportamiento del original con sus valores por defecto (los
   * bloques de swing vienen apagados).
   */
  usarBloquesSwing: boolean;
}

export const CONFIG_SMC: ConfigSMC = {
  largoSwing: 50,
  largoInterno: 5,
  filtroConfluencia: false,
  filtroBloques: "atr",
  mitigacionBloques: "maxmin",
  maxBloquesInternos: 5,
  maxBloquesSwing: 5,
  barrasIguales: 3,
  umbralIguales: 0.1,
  umbralFvgAuto: true,
  senales: {
    activas: true,
    estructura: "interna",
    expiracion: 12,
    toleranciaTicks: 3,
    margenTicks: 3,
    objetivoR: 2,
    relacionMinima: 1.2,
    tick: 0.01,
    usarBloquesSwing: false,
  },
};

// ─────────────────────────────── salidas ──────────────────────────────

export type TipoEvento = "BOS" | "CHOCH";

export interface EventoEstructura {
  tipo: TipoEvento;
  sesgo: 1 | -1;
  /** true si viene de la estructura interna; false, de la de swing. */
  interna: boolean;
  /** El nivel que se rompió. */
  nivel: number;
  /** Vela donde se formó el pivote roto (de dónde arranca la línea). */
  desdeIndice: number;
  desdeTime: number;
  /** Vela del cruce (dónde termina la línea). */
  indice: number;
  time: number;
}

export interface BloqueOrdenes {
  /** El sesgo del bloque: ALCISTA es demanda; BAJISTA, oferta. */
  sesgo: 1 | -1;
  interno: boolean;
  alto: number;
  bajo: number;
  /** Vela de la que sale el bloque. */
  indice: number;
  time: number;
  /**
   * Vela del BOS que lo creó, o sea cuándo se SUPO que existía.
   *
   * No es lo mismo que `indice`: el bloque se ancla a una vela anterior,
   * la última en la que mandaba el otro lado. Dibujarlo antes de
   * `creadoEn` sería mostrar algo que en ese momento nadie sabía.
   */
  creadoEn: number;
  /** Vela en la que el precio lo atravesó, o null si sigue vivo. */
  mitigadoEn: number | null;
  mitigadoTime: number | null;
}

export interface ParIgual {
  /** EQH (máximos iguales) o EQL (mínimos iguales). */
  alto: boolean;
  nivelA: number;
  nivelB: number;
  desdeIndice: number;
  desdeTime: number;
  /** Vela del segundo pivote: dónde se dibuja. */
  indice: number;
  time: number;
  /**
   * Vela en la que se SUPO. Es posterior a `indice` porque un pivote
   * tarda `barrasIguales` velas en confirmarse. Separarlas es lo que
   * permite comprobar que nada se adelanta a su confirmación.
   */
  confirmadoEn: number;
}

export interface BrechaFVG {
  sesgo: 1 | -1;
  alto: number;
  bajo: number;
  indice: number;
  time: number;
  /** Vela que la rellenó, o null si sigue abierta. */
  rellenadaEn: number | null;
}

export interface ExtremosSMC {
  top: number;
  bottom: number;
  topTime: number;
  bottomTime: number;
  topIndice: number;
  bottomIndice: number;
  /** El máximo es "fuerte" cuando la tendencia de swing es bajista. */
  topFuerte: boolean;
  bottomFuerte: boolean;
  /**
   * Vela del último pivote de swing: desde ahí arrancan las zonas.
   *
   * No es `topTime` ni `bottomTime` sino el más reciente de los dos: las
   * zonas premium y descuento miden el tramo que va desde que se marcó
   * el último extremo, no desde el más viejo de ellos.
   */
  pivoteTime: number;
}

export interface SenalBOS {
  sesgo: 1 | -1;
  /** Vela del BOS que armó la configuración. */
  bosIndice: number;
  /** Vela del retesteo: la entrada se toma a su cierre. */
  indice: number;
  time: number;
  entrada: number;
  stop: number;
  objetivo: number;
  /** Beneficio/riesgo con la que se aceptó. */
  relacion: number;
  /** El nivel retesteado (el que rompió el BOS). */
  nivel: number;
  /** Cómo terminó, si terminó dentro de las velas disponibles. */
  salida: SalidaSenal | null;
}

export interface SalidaSenal {
  /** "ambiguo" cuando la misma vela tocó el stop y el objetivo. */
  motivo: "stop" | "objetivo" | "ambiguo";
  precio: number;
  indice: number;
  time: number;
}

export interface EsperaSenal {
  sesgo: 1 | -1;
  nivel: number;
  invalida: number;
  indice: number;
  time: number;
}

export interface ResultadoSMC {
  estructura: EventoEstructura[];
  bloques: BloqueOrdenes[];
  iguales: ParIgual[];
  fvg: BrechaFVG[];
  senales: SenalBOS[];
  /** Los BOS que quedaron esperando retesteo (para ver qué se perdió). */
  esperas: EsperaSenal[];
  extremos: ExtremosSMC | null;
  /** Sesgo de cada tendencia al cierre de cada vela, para pintar velas. */
  tendenciaInterna: Sesgo[];
  tendenciaSwing: Sesgo[];
}

// ───────────────────────── estado interno ─────────────────────────────

interface Pivote {
  nivel: number;
  anterior: number;
  cruzado: boolean;
  indice: number;
  time: number;
  /** El nivel y el cierre al CERRAR la vela anterior, para el cruce. */
  nivelPrevio: number;
  cierrePrevio: number;
}

function pivoteVacio(): Pivote {
  return {
    nivel: NaN,
    anterior: NaN,
    cruzado: false,
    indice: 0,
    time: 0,
    nivelPrevio: NaN,
    cierrePrevio: NaN,
  };
}

/**
 * Detector de piernas, igual que `leg(size)` en Pine.
 *
 * La vela de hace `size` barras es un pivote si supera a TODAS las
 * `size` siguientes (la actual incluida). O sea que un pivote no se sabe
 * hasta `size` velas después de haber ocurrido. Ese retardo no es un
 * defecto a corregir: es lo que hace que el indicador no se redibuje, y
 * quitarlo sería dejar que el backtest vea el futuro.
 *
 * Arranca en 0 (BAJISTA en el original), así que la primera pierna
 * bajista no dispara cambio. Es el comportamiento de Pine y se respeta:
 * cambiarlo movería el primer pivote de toda la serie.
 */
class Piernas {
  private pierna = 0;
  private previa = 0;

  /** Devuelve +1 si arranca pierna alcista, -1 si bajista, 0 si nada. */
  paso(c: Candle[], i: number, largo: number): 1 | -1 | 0 {
    this.previa = this.pierna;
    if (i >= largo) {
      let maxAlto = -Infinity;
      let minBajo = Infinity;
      for (let k = i - largo + 1; k <= i; k++) {
        if (c[k].high > maxAlto) maxAlto = c[k].high;
        if (c[k].low < minBajo) minBajo = c[k].low;
      }
      if (c[i - largo].high > maxAlto) this.pierna = 0;
      else if (c[i - largo].low < minBajo) this.pierna = 1;
    }
    const cambio = this.pierna - this.previa;
    return cambio === 1 ? 1 : cambio === -1 ? -1 : 0;
  }
}

// ───────────────────────────── el motor ───────────────────────────────

/**
 * Recorre las velas una sola vez y devuelve todo lo que el indicador sabe.
 *
 * El orden dentro de cada vela importa y es el del original: primero los
 * extremos, después los pivotes (swing, interno, iguales), después los
 * cruces que producen BOS/CHoCH, después la mitigación de bloques, y al
 * final las señales. Cambiarlo movería señales de vela.
 */
export function calcularSMC(
  velas: Candle[],
  cfg: ConfigSMC = CONFIG_SMC,
): ResultadoSMC {
  const n = velas.length;
  const vacio: ResultadoSMC = {
    estructura: [],
    bloques: [],
    iguales: [],
    fvg: [],
    senales: [],
    esperas: [],
    extremos: null,
    tendenciaInterna: [],
    tendenciaSwing: [],
  };
  if (n === 0) return vacio;

  // ATR(200) de Wilder, igual que `ta.atr(200)`. Es null hasta la vela
  // 199; en Pine eso es `na` y toda comparación contra `na` da falso, así
  // que acá un null tiene que comportarse igual y no colarse como cero.
  const atr200 = rma(rangoVerdadero(velas), 200);

  // Rango medio acumulado, la otra opción del filtro de bloques.
  const rangoMedio: number[] = new Array(n);
  {
    const tr = rangoVerdadero(velas);
    let acc = 0;
    for (let i = 0; i < n; i++) {
      acc += tr[i];
      rangoMedio[i] = acc / (i + 1);
    }
  }

  // Máximos y mínimos "parseados": en una vela de volatilidad alta el
  // original los INVIERTE. No es un error de tipeo suyo —está en el
  // código publicado— y es lo que hace que un bloque de órdenes no se
  // ancle a la mecha de una vela de pánico.
  const altoP: number[] = new Array(n);
  const bajoP: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const vol = cfg.filtroBloques === "atr" ? atr200[i] : rangoMedio[i];
    const alta = vol !== null && velas[i].high - velas[i].low >= 2 * vol;
    altoP[i] = alta ? velas[i].low : velas[i].high;
    bajoP[i] = alta ? velas[i].high : velas[i].low;
  }

  const swingAlto = pivoteVacio();
  const swingBajo = pivoteVacio();
  const internoAlto = pivoteVacio();
  const internoBajo = pivoteVacio();
  const igualAlto = pivoteVacio();
  const igualBajo = pivoteVacio();

  const piernasSwing = new Piernas();
  const piernasInternas = new Piernas();
  const piernasIguales = new Piernas();

  let tendSwing: Sesgo = 0;
  let tendInterna: Sesgo = 0;

  const res: ResultadoSMC = {
    ...vacio,
    tendenciaInterna: new Array(n).fill(0),
    tendenciaSwing: new Array(n).fill(0),
  };

  // Extremos que se arrastran: el máximo y el mínimo desde el último
  // pivote de swing.
  let top = velas[0].high;
  let bottom = velas[0].low;
  let topTime = velas[0].time;
  let bottomTime = velas[0].time;
  let topIndice = 0;
  let bottomIndice = 0;

  const bloquesInternos: BloqueOrdenes[] = [];
  const bloquesSwing: BloqueOrdenes[] = [];

  // Estado de las señales.
  let pendiente: 0 | 1 | -1 = 0;
  let bosIndice = -1;
  let nivelRetest = NaN;
  let nivelInvalida = NaN;
  let abierta: SenalBOS | null = null;

  // Para el umbral automático del FVG: promedio del impulso histórico.
  let sumaImpulso = 0;
  // Las brechas todavía abiertas, aparte: recorrer TODAS las de la serie
  // en cada vela es la otra forma de volver esto cuadrático.
  const fvgAbiertas: BrechaFVG[] = [];

  for (let i = 0; i < n; i++) {
    const k = velas[i];
    const atr = atr200[i];

    // ── 1. extremos arrastrados ──────────────────────────────────────
    if (k.high >= top) {
      top = k.high;
      topTime = k.time;
      topIndice = i;
    }
    if (k.low <= bottom) {
      bottom = k.low;
      bottomTime = k.time;
      bottomIndice = i;
    }

    // ── 2. pivotes ───────────────────────────────────────────────────
    // El pivote se confirma en la vela i pero PERTENECE a la vela
    // i - largo. Por eso se guardan su índice y su hora, no los de ahora.
    const nuevoSwing = piernasSwing.paso(velas, i, cfg.largoSwing);
    if (nuevoSwing === 1) {
      const j = i - cfg.largoSwing;
      fijarPivote(swingBajo, velas[j].low, j, velas[j].time);
      bottom = swingBajo.nivel;
      bottomTime = swingBajo.time;
      bottomIndice = j;
    } else if (nuevoSwing === -1) {
      const j = i - cfg.largoSwing;
      fijarPivote(swingAlto, velas[j].high, j, velas[j].time);
      top = swingAlto.nivel;
      topTime = swingAlto.time;
      topIndice = j;
    }

    const nuevoInterno = piernasInternas.paso(velas, i, cfg.largoInterno);
    if (nuevoInterno === 1) {
      const j = i - cfg.largoInterno;
      fijarPivote(internoBajo, velas[j].low, j, velas[j].time);
    } else if (nuevoInterno === -1) {
      const j = i - cfg.largoInterno;
      fijarPivote(internoAlto, velas[j].high, j, velas[j].time);
    }

    // ── 3. máximos y mínimos iguales ─────────────────────────────────
    const nuevoIgual = piernasIguales.paso(velas, i, cfg.barrasIguales);
    if (nuevoIgual !== 0) {
      const j = i - cfg.barrasIguales;
      const alto = nuevoIgual === -1;
      const p = alto ? igualAlto : igualBajo;
      const nivel = alto ? velas[j].high : velas[j].low;
      // Sin ATR todavía no hay umbral, y en Pine comparar contra `na` da
      // falso: no se marca nada en vez de marcar todo.
      if (
        atr !== null &&
        Number.isFinite(p.nivel) &&
        Math.abs(p.nivel - nivel) < cfg.umbralIguales * atr
      ) {
        res.iguales.push({
          alto,
          nivelA: p.nivel,
          nivelB: nivel,
          desdeIndice: p.indice,
          desdeTime: p.time,
          indice: j,
          time: velas[j].time,
          confirmadoEn: i,
        });
      }
      fijarPivote(p, nivel, j, velas[j].time);
    }

    // ── 4. BOS y CHoCH ───────────────────────────────────────────────
    // Primero la interna y después la de swing, como en el original.
    const alcistaVela =
      !cfg.filtroConfluencia ||
      k.high - Math.max(k.close, k.open) > Math.min(k.close, k.open - k.low);
    const bajistaVela =
      !cfg.filtroConfluencia ||
      k.high - Math.max(k.close, k.open) < Math.min(k.close, k.open - k.low);

    // Los eventos de ESTA vela se juntan acá mientras se generan. Antes
    // se filtraba `res.estructura` entera en cada vela para encontrarlos,
    // que es O(n²): a 10.000 velas una pasada tardaba 44 ms y el
    // reproductor del backtest se arrastraba. Medido.
    const deEstaVela: EventoEstructura[] = [];

    const eventos: Array<{
      interna: boolean;
      alto: Pivote;
      bajo: Pivote;
    }> = [
      { interna: true, alto: internoAlto, bajo: internoBajo },
      { interna: false, alto: swingAlto, bajo: swingBajo },
    ];

    for (const e of eventos) {
      const extraAlcista = e.interna
        ? e.alto.nivel !== swingAlto.nivel && alcistaVela
        : true;
      if (cruzoHaciaArriba(k.close, e.alto) && !e.alto.cruzado && extraAlcista) {
        const tendencia = e.interna ? tendInterna : tendSwing;
        const tipo: TipoEvento = tendencia === BAJISTA ? "CHOCH" : "BOS";
        const ev: EventoEstructura = {
          tipo,
          sesgo: ALCISTA,
          interna: e.interna,
          nivel: e.alto.nivel,
          desdeIndice: e.alto.indice,
          desdeTime: e.alto.time,
          indice: i,
          time: k.time,
        };
        res.estructura.push(ev);
        deEstaVela.push(ev);
        e.alto.cruzado = true;
        if (e.interna) tendInterna = ALCISTA;
        else tendSwing = ALCISTA;
        guardarBloque(
          e.interna ? bloquesInternos : bloquesSwing,
          e.alto,
          i,
          ALCISTA,
          e.interna,
          altoP,
          bajoP,
          velas,
        );
      }

      const extraBajista = e.interna
        ? e.bajo.nivel !== swingBajo.nivel && bajistaVela
        : true;
      if (cruzoHaciaAbajo(k.close, e.bajo) && !e.bajo.cruzado && extraBajista) {
        const tendencia = e.interna ? tendInterna : tendSwing;
        const tipo: TipoEvento = tendencia === ALCISTA ? "CHOCH" : "BOS";
        const ev: EventoEstructura = {
          tipo,
          sesgo: BAJISTA,
          interna: e.interna,
          nivel: e.bajo.nivel,
          desdeIndice: e.bajo.indice,
          desdeTime: e.bajo.time,
          indice: i,
          time: k.time,
        };
        res.estructura.push(ev);
        deEstaVela.push(ev);
        e.bajo.cruzado = true;
        if (e.interna) tendInterna = BAJISTA;
        else tendSwing = BAJISTA;
        guardarBloque(
          e.interna ? bloquesInternos : bloquesSwing,
          e.bajo,
          i,
          BAJISTA,
          e.interna,
          altoP,
          bajoP,
          velas,
        );
      }
    }

    // ── 5. mitigación de bloques ─────────────────────────────────────
    // DESVÍO DEL ORIGINAL, a propósito: Pine recorre la lista borrando
    // mientras itera, así que si dos bloques se atraviesan en la misma
    // vela se salta el segundo y lo borra una vela más tarde. Acá se
    // cierran todos los que correspondan en la vela en que pasó. La
    // diferencia es de una vela en un caso poco frecuente, pero en un
    // backtest una fecha equivocada es una fecha equivocada.
    const fuenteBajista = cfg.mitigacionBloques === "cierre" ? k.close : k.high;
    const fuenteAlcista = cfg.mitigacionBloques === "cierre" ? k.close : k.low;
    for (const lista of [bloquesInternos, bloquesSwing]) {
      for (let b = lista.length - 1; b >= 0; b--) {
        const bl = lista[b];
        const roto =
          bl.sesgo === BAJISTA
            ? fuenteBajista > bl.alto
            : fuenteAlcista < bl.bajo;
        if (roto) {
          bl.mitigadoEn = i;
          bl.mitigadoTime = k.time;
          lista.splice(b, 1);
          res.bloques.push(bl);
        }
      }
    }

    // ── 6. brechas de valor justo (FVG) ──────────────────────────────
    // Se rellena cuando el precio vuelve a entrar en la brecha.
    for (let f = fvgAbiertas.length - 1; f >= 0; f--) {
      const g = fvgAbiertas[f];
      if ((g.sesgo === ALCISTA && k.low < g.bajo) ||
          (g.sesgo === BAJISTA && k.high > g.alto)) {
        g.rellenadaEn = i;
        fvgAbiertas.splice(f, 1);
      }
    }
    if (i >= 2) {
      const prev = velas[i - 1];
      const dos = velas[i - 2];
      // La fórmula del original, tal cual: divide por (open * 100).
      const impulso = prev.open !== 0
        ? (prev.close - prev.open) / (prev.open * 100)
        : 0;
      sumaImpulso += Math.abs(impulso);
      const umbral = cfg.umbralFvgAuto ? (sumaImpulso / (i + 1)) * 2 : 0;
      if (k.low > dos.high && prev.close > dos.high && impulso > umbral) {
        const g: BrechaFVG = {
          sesgo: ALCISTA,
          alto: k.low,
          bajo: dos.high,
          indice: i,
          time: k.time,
          rellenadaEn: null,
        };
        res.fvg.push(g);
        fvgAbiertas.push(g);
      } else if (k.high < dos.low && prev.close < dos.low && -impulso > umbral) {
        const g: BrechaFVG = {
          sesgo: BAJISTA,
          alto: dos.low,
          bajo: k.high,
          indice: i,
          time: k.time,
          rellenadaEn: null,
        };
        res.fvg.push(g);
        fvgAbiertas.push(g);
      }
    }

    // ── 7. señales BOS + retesteo ────────────────────────────────────
    if (cfg.senales.activas) {
      const s = cfg.senales;
      const interna = s.estructura === "interna";
      const mios = deEstaVela.filter((x) => x.interna === interna);
      const bosArriba = mios.some((x) => x.tipo === "BOS" && x.sesgo === ALCISTA);
      const bosAbajo = mios.some((x) => x.tipo === "BOS" && x.sesgo === BAJISTA);
      const chochArriba = mios.some((x) => x.tipo === "CHOCH" && x.sesgo === ALCISTA);
      const chochAbajo = mios.some((x) => x.tipo === "CHOCH" && x.sesgo === BAJISTA);

      // Seguimiento de la operación abierta. Empieza en la vela
      // SIGUIENTE a la entrada: la vela de entrada ya se consumió para
      // decidir, y usarla también para resolver sería cobrar dos veces.
      //
      // Lo que de verdad garantiza eso es EL ORDEN: este bloque corre
      // antes que el que abre la operación, así que en la vela de la
      // entrada `abierta` todavía es null. La condición `i >` es un
      // cinturón además del tirante —mutarla sola no cambia nada— y se
      // deja para que mover este bloque de lugar falle en voz alta en
      // vez de empezar a resolver operaciones con su propia vela.
      let cerroAhora = false;
      if (abierta && i > abierta.indice) {
        const tocoStop =
          abierta.sesgo === ALCISTA ? k.low <= abierta.stop : k.high >= abierta.stop;
        const tocoObjetivo =
          abierta.sesgo === ALCISTA ? k.high >= abierta.objetivo : k.low <= abierta.objetivo;
        if (tocoStop || tocoObjetivo) {
          // Si la misma vela toca los dos, no se sabe cuál fue primero y
          // no se inventa: queda marcado como ambiguo.
          const motivo = tocoStop && tocoObjetivo ? "ambiguo" : tocoStop ? "stop" : "objetivo";
          abierta.salida = {
            motivo,
            precio: motivo === "objetivo" ? abierta.objetivo : abierta.stop,
            indice: i,
            time: k.time,
          };
          abierta = null;
          cerroAhora = true;
        }
      }

      // Cancelación de una espera.
      if (pendiente !== 0) {
        const vencida = i - bosIndice > s.expiracion;
        const invalidada =
          pendiente === 1
            ? k.close < nivelInvalida || chochAbajo || bosAbajo
            : k.close > nivelInvalida || chochArriba || bosArriba;
        if (vencida || invalidada) pendiente = 0;
      }

      if (!abierta && !cerroAhora) {
        // Se arma la espera al cierre del BOS. Si saltan los dos a la
        // vez no se arma nada: no hay forma de elegir.
        if (bosArriba !== bosAbajo) {
          pendiente = bosArriba ? 1 : -1;
          bosIndice = i;
          const alto = interna ? internoAlto : swingAlto;
          const bajo = interna ? internoBajo : swingBajo;
          nivelRetest = bosArriba ? alto.nivel : bajo.nivel;
          nivelInvalida = bosArriba ? bajo.nivel : alto.nivel;
          res.esperas.push({
            sesgo: bosArriba ? ALCISTA : BAJISTA,
            nivel: nivelRetest,
            invalida: nivelInvalida,
            indice: i,
            time: k.time,
          });
        }

        // La entrada nunca cae en la misma vela del BOS.
        if (pendiente !== 0 && i > bosIndice && Number.isFinite(nivelInvalida)) {
          const tol = s.toleranciaTicks * s.tick;
          const retesteo =
            pendiente === 1
              ? k.low <= nivelRetest + tol &&
                k.high >= nivelRetest - tol &&
                k.close > nivelRetest &&
                k.close > k.open
              : k.high >= nivelRetest - tol &&
                k.low <= nivelRetest + tol &&
                k.close < nivelRetest &&
                k.close < k.open;

          if (retesteo) {
            const stop =
              pendiente === 1
                ? Math.min(nivelInvalida, k.low) - s.margenTicks * s.tick
                : Math.max(nivelInvalida, k.high) + s.margenTicks * s.tick;
            const riesgo = pendiente * (k.close - stop);
            const objetivo = primerObstaculo(
              pendiente,
              k.close,
              k.close + pendiente * riesgo * s.objetivoR,
              interna ? internoAlto : swingAlto,
              interna ? internoBajo : swingBajo,
              bloquesInternos,
              s.usarBloquesSwing ? bloquesSwing : [],
            );
            const relacion =
              riesgo > s.tick ? (pendiente * (objetivo - k.close)) / riesgo : 0;

            if (riesgo > s.tick && relacion >= s.relacionMinima) {
              abierta = {
                sesgo: pendiente,
                bosIndice,
                indice: i,
                time: k.time,
                entrada: k.close,
                stop,
                objetivo,
                relacion,
                nivel: nivelRetest,
                salida: null,
              };
              res.senales.push(abierta);
              pendiente = 0;
            }
          }
        }
      }
    }

    res.tendenciaInterna[i] = tendInterna;
    res.tendenciaSwing[i] = tendSwing;
  }

  // Los bloques que quedaron vivos al final también se devuelven: son los
  // únicos que se dibujan en el gráfico.
  res.bloques.push(...bloquesInternos, ...bloquesSwing);
  res.bloques.sort((a, b) => a.indice - b.indice);

  res.extremos = {
    top,
    bottom,
    topTime,
    bottomTime,
    topIndice,
    bottomIndice,
    topFuerte: tendSwing === BAJISTA,
    bottomFuerte: tendSwing === ALCISTA,
    pivoteTime: Math.max(topTime, bottomTime),
  };

  return res;
}

// ───────────────────────────── auxiliares ─────────────────────────────

function fijarPivote(p: Pivote, nivel: number, indice: number, time: number) {
  p.anterior = p.nivel;
  p.nivel = nivel;
  p.cruzado = false;
  p.indice = indice;
  p.time = time;
  // `nivelPrevio` NO se toca acá a propósito: tiene que seguir siendo el
  // valor que el nivel tenía al cerrar la vela anterior, que es contra
  // lo que Pine compara. Pisarlo con el nivel nuevo haría que cambiar de
  // pivote y cruzarlo en la misma vela diera un BOS que en TradingView
  // no existe.
}

/**
 * El equivalente de `ta.crossover(close, pivote.nivel)`.
 *
 * Pine compara contra el valor que el nivel tenía en la vela ANTERIOR,
 * no contra el de ahora, y `nivelPrevio` reproduce eso.
 *
 * Dicho sea con todas las letras: se puede demostrar que esa distinción
 * NUNCA cambia el resultado, y probándolo se ve que el código está bien
 * por una razón y no por casualidad. `nivel` y `nivelPrevio` solo
 * difieren en la vela en que el pivote se acaba de mover. Y un pivote
 * alto en L solo se registra cuando las `largo` velas que lo siguen
 * —la actual incluida— tienen su máximo POR DEBAJO de L; entonces en
 * esa vela el cierre es menor que L y `cierre > nivel` es imposible. El
 * caso bajista es el espejo. O sea que la rama donde las dos versiones
 * se separan no se puede alcanzar.
 *
 * Se mantiene igual porque hace evidente que esto ES `ta.crossover`, en
 * vez de dejar la equivalencia como algo que hay que demostrar cada vez
 * que alguien lee el archivo.
 */
function cruzoHaciaArriba(cierre: number, p: Pivote): boolean {
  const paso =
    Number.isFinite(p.nivel) &&
    Number.isFinite(p.nivelPrevio) &&
    cierre > p.nivel &&
    p.cierrePrevio <= p.nivelPrevio;
  p.cierrePrevio = cierre;
  p.nivelPrevio = p.nivel;
  return paso;
}

function cruzoHaciaAbajo(cierre: number, p: Pivote): boolean {
  const paso =
    Number.isFinite(p.nivel) &&
    Number.isFinite(p.nivelPrevio) &&
    cierre < p.nivel &&
    p.cierrePrevio >= p.nivelPrevio;
  p.cierrePrevio = cierre;
  p.nivelPrevio = p.nivel;
  return paso;
}

/**
 * De dónde sale el bloque de órdenes.
 *
 * Entre el pivote roto y la vela del cruce se busca el extremo contrario
 * al movimiento: la vela más baja para un BOS alcista, la más alta para
 * uno bajista. Es la última vela en la que mandaba el otro lado.
 */
function guardarBloque(
  lista: BloqueOrdenes[],
  p: Pivote,
  i: number,
  sesgo: 1 | -1,
  interno: boolean,
  altoP: number[],
  bajoP: number[],
  velas: Candle[],
) {
  const desde = p.indice;
  if (desde >= i) return;
  let mejor = desde;
  if (sesgo === BAJISTA) {
    for (let k = desde; k < i; k++) if (altoP[k] > altoP[mejor]) mejor = k;
  } else {
    for (let k = desde; k < i; k++) if (bajoP[k] < bajoP[mejor]) mejor = k;
  }
  lista.unshift({
    sesgo,
    interno,
    alto: altoP[mejor],
    bajo: bajoP[mejor],
    indice: mejor,
    time: velas[mejor].time,
    creadoEn: i,
    mitigadoEn: null,
    mitigadoTime: null,
  });
  if (lista.length > 100) lista.pop();
}

/**
 * Hasta dónde dejar correr el objetivo.
 *
 * Arranca en el objetivo por relación (2R por defecto) y lo acorta hasta
 * el primer estorbo que haya en el camino: el pivote de swing del lado
 * al que va el precio, o el borde de un bloque de órdenes contrario que
 * siga vivo. Poner el objetivo detrás de una zona de oferta es pedirle
 * al precio que la atraviese.
 */
function primerObstaculo(
  direccion: 1 | -1,
  precio: number,
  porDefecto: number,
  swingAlto: Pivote,
  swingBajo: Pivote,
  bloquesInternos: BloqueOrdenes[],
  bloquesSwing: BloqueOrdenes[],
): number {
  let out = porDefecto;
  const nivelPivote = direccion === 1 ? swingAlto.nivel : swingBajo.nivel;
  if (
    Number.isFinite(nivelPivote) &&
    direccion * (nivelPivote - precio) > 0 &&
    Math.abs(nivelPivote - precio) < Math.abs(out - precio)
  ) {
    out = nivelPivote;
  }
  for (const lista of [bloquesInternos, bloquesSwing]) {
    for (const b of lista) {
      const borde = direccion === 1 ? b.bajo : b.alto;
      if (
        b.sesgo === -direccion &&
        direccion * (borde - precio) > 0 &&
        Math.abs(borde - precio) < Math.abs(out - precio)
      ) {
        out = borde;
      }
    }
  }
  return out;
}

// ─────────────────── zonas premium / descuento ────────────────────────

export interface ZonasSMC {
  premium: { alto: number; bajo: number };
  equilibrio: { alto: number; bajo: number };
  descuento: { alto: number; bajo: number };
  medio: number;
}

/** Las tres zonas entre el máximo y el mínimo arrastrados. */
export function zonasDe(e: ExtremosSMC): ZonasSMC {
  return {
    premium: { alto: e.top, bajo: 0.95 * e.top + 0.05 * e.bottom },
    equilibrio: {
      alto: 0.525 * e.top + 0.475 * e.bottom,
      bajo: 0.525 * e.bottom + 0.475 * e.top,
    },
    descuento: { alto: 0.95 * e.bottom + 0.05 * e.top, bajo: e.bottom },
    medio: (e.top + e.bottom) / 2,
  };
}

// ───────────────── niveles diario / semanal / mensual ─────────────────

export type PeriodoNivel = "D" | "W" | "M";

export interface NivelMTF {
  periodo: PeriodoNivel;
  alto: number;
  bajo: number;
  /** Vela en la que se hizo cada extremo, para arrancar la línea ahí. */
  altoTime: number;
  bajoTime: number;
}

/**
 * Máximo y mínimo del período ANTERIOR (día, semana o mes).
 *
 * El original los pide con `lookahead_on` pero desplazados una barra, que
 * es el modo seguro: lo que se muestra es el período ya cerrado. Acá se
 * hace lo mismo recorriendo las velas que ya se tienen, sin pedir nada
 * de afuera, así que no hay forma de que se cuele una vela del futuro.
 *
 * Devuelve null si todavía no hay un período anterior completo. Dibujar
 * el período en curso como si estuviera cerrado sería mentir sobre un
 * nivel que todavía se puede mover.
 */
export function nivelAnterior(
  velas: Candle[],
  periodo: PeriodoNivel,
  hasta = velas.length - 1,
): NivelMTF | null {
  if (hasta < 0 || hasta >= velas.length) return null;
  const claveActual = clavePeriodo(velas[hasta].time, periodo);
  let fin = -1;
  for (let i = hasta; i >= 0; i--) {
    if (clavePeriodo(velas[i].time, periodo) !== claveActual) {
      fin = i;
      break;
    }
  }
  if (fin < 0) return null;
  const clavePrevia = clavePeriodo(velas[fin].time, periodo);
  let alto = -Infinity;
  let bajo = Infinity;
  let altoTime = velas[fin].time;
  let bajoTime = velas[fin].time;
  for (let i = fin; i >= 0; i--) {
    if (clavePeriodo(velas[i].time, periodo) !== clavePrevia) break;
    if (velas[i].high > alto) {
      alto = velas[i].high;
      altoTime = velas[i].time;
    }
    if (velas[i].low < bajo) {
      bajo = velas[i].low;
      bajoTime = velas[i].time;
    }
  }
  if (!Number.isFinite(alto) || !Number.isFinite(bajo)) return null;
  return { periodo, alto, bajo, altoTime, bajoTime };
}

/** Identifica el día, la semana o el mes de un instante, en UTC. */
export function clavePeriodo(time: number, periodo: PeriodoNivel): string {
  const d = new Date(time * 1000);
  if (periodo === "D") {
    return `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;
  }
  if (periodo === "M") return `${d.getUTCFullYear()}-${d.getUTCMonth()}`;
  // Semana ISO: se corre al lunes anterior y se nombra por ese día.
  const lunes = new Date(d);
  const dia = (d.getUTCDay() + 6) % 7;
  lunes.setUTCDate(d.getUTCDate() - dia);
  return `${lunes.getUTCFullYear()}-${lunes.getUTCMonth()}-${lunes.getUTCDate()}`;
}
