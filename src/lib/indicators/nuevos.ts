/**
 * Indicadores agregados en octubre de 2026, los que Diego vio en su captura
 * de TradingView Premium.
 *
 * Están en su propio archivo (y sin más import que el tipo `Candle`, que al
 * ser de tipo desaparece al compilar) para poder probarlos solos:
 *   node --experimental-strip-types scripts/verificar-indicadores.mjs
 *
 * Convenciones iguales a `index.ts`: todo devuelve `{ time, value }` con el
 * tiempo de la vela, y las series arrancan recién cuando hay datos
 * suficientes — nunca se rellena con ceros, porque un cero falso en el
 * gráfico se lee como una señal.
 *
 * Contrastados contra `pandas_ta` sobre 300 velas: ATR, Awesome Oscillator,
 * OBV, Aroon y Keltner dan lo mismo hasta el último decimal. El SAR y el
 * Supertrend están portados del código de referencia de Pine (`pine_sar` y
 * `pine_supertrend`) porque la convención de arranque de TradingView no es
 * la de esa librería; con eso, todas las vueltas del SAR a partir de la
 * vela 123 y todas las del Supertrend a partir de la 36 caen en la misma
 * vela que la referencia — las de antes son el arranque, que difiere por
 * definición. La DEMA converge a la referencia (1e-15 al final); las
 * primeras velas difieren porque acá la EMA se siembra con la SMA, igual
 * que en `index.ts`.
 */

import type { Candle } from "@/lib/binance/types";

export interface Punto {
  time: number;
  value: number;
}

const hl2 = (k: Candle) => (k.high + k.low) / 2;

/** Paso típico entre velas, para extrapolar los desplazamientos. */
function pasoTipico(c: Candle[]): number {
  if (c.length < 2) return 60;
  const difs: number[] = [];
  for (let i = 1; i < Math.min(c.length, 20); i++) difs.push(c[i].time - c[i - 1].time);
  difs.sort((a, b) => a - b);
  return difs[Math.floor(difs.length / 2)] || 60;
}

/**
 * Corre una serie `n` velas hacia el FUTURO, como el `offset` de Pine. Las
 * últimas `n` quedan más allá de la última vela: ahí se extrapolan los
 * tiempos con el paso típico, que es lo que hace TradingView al dibujar el
 * Alligator adelantado.
 */
export function desplazar(pts: Punto[], n: number, paso: number): Punto[] {
  if (n <= 0) return pts;
  const out: Punto[] = [];
  for (let i = 0; i < pts.length; i++) {
    const destino = i + n;
    const time =
      destino < pts.length
        ? pts[destino].time
        : pts[pts.length - 1].time + (destino - pts.length + 1) * paso;
    out.push({ time, value: pts[i].value });
  }
  return out;
}

/** Media suavizada de Wilder (la RMA de Pine), sembrada con la SMA. */
export function rma(valores: number[], periodo: number): Array<number | null> {
  const out: Array<number | null> = new Array(valores.length).fill(null);
  if (periodo < 1 || valores.length < periodo) return out;
  let suma = 0;
  for (let i = 0; i < periodo; i++) suma += valores[i];
  let prev = suma / periodo;
  out[periodo - 1] = prev;
  for (let i = periodo; i < valores.length; i++) {
    prev = (prev * (periodo - 1) + valores[i]) / periodo;
    out[i] = prev;
  }
  return out;
}

/** EMA clásica sembrada con la SMA de los primeros `periodo` valores. */
export function emaSerie(valores: number[], periodo: number): Array<number | null> {
  const out: Array<number | null> = new Array(valores.length).fill(null);
  if (periodo < 1 || valores.length < periodo) return out;
  const k = 2 / (periodo + 1);
  let suma = 0;
  for (let i = 0; i < periodo; i++) suma += valores[i];
  let prev = suma / periodo;
  out[periodo - 1] = prev;
  for (let i = periodo; i < valores.length; i++) {
    prev = valores[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

/** SMA sobre una lista de números. */
export function smaSerie(valores: number[], periodo: number): Array<number | null> {
  const out: Array<number | null> = new Array(valores.length).fill(null);
  if (periodo < 1) return out;
  let suma = 0;
  for (let i = 0; i < valores.length; i++) {
    suma += valores[i];
    if (i >= periodo) suma -= valores[i - periodo];
    if (i >= periodo - 1) out[i] = suma / periodo;
  }
  return out;
}

/** WMA: ponderada lineal, la vela más nueva pesa `periodo`. */
export function wmaSerie(valores: number[], periodo: number): Array<number | null> {
  const out: Array<number | null> = new Array(valores.length).fill(null);
  if (periodo < 1) return out;
  const pesos = (periodo * (periodo + 1)) / 2;
  for (let i = periodo - 1; i < valores.length; i++) {
    let suma = 0;
    for (let j = 0; j < periodo; j++) suma += valores[i - periodo + 1 + j] * (j + 1);
    out[i] = suma / pesos;
  }
  return out;
}

/** Tipos de suavizado que ofrecen el ATR y el OBV de TradingView. */
export type TipoSuavizado = "RMA" | "SMA" | "EMA" | "WMA";

export function suavizar(
  valores: number[],
  periodo: number,
  tipo: TipoSuavizado,
): Array<number | null> {
  if (tipo === "SMA") return smaSerie(valores, periodo);
  if (tipo === "EMA") return emaSerie(valores, periodo);
  if (tipo === "WMA") return wmaSerie(valores, periodo);
  return rma(valores, periodo);
}

/** Suaviza una serie ya calculada (la usa el OBV con su media opcional). */
export function suavizarPuntos(
  pts: Punto[],
  periodo: number,
  tipo: TipoSuavizado,
): Punto[] {
  const serie = suavizar(pts.map((p) => p.value), periodo, tipo);
  const out: Punto[] = [];
  for (let i = 0; i < pts.length; i++) {
    const v = serie[i];
    if (v !== null && Number.isFinite(v)) out.push({ time: pts[i].time, value: v });
  }
  return out;
}

function aPuntos(c: Candle[], serie: Array<number | null>): Punto[] {
  const out: Punto[] = [];
  for (let i = 0; i < c.length; i++) {
    const v = serie[i];
    if (v !== null && Number.isFinite(v)) out.push({ time: c[i].time, value: v });
  }
  return out;
}

// ─────────────────────────── rango verdadero ───────────────────────────

/** True Range: el mayor de (máx−mín), |máx−cierre previo| y |mín−cierre previo|. */
export function rangoVerdadero(c: Candle[]): number[] {
  return c.map((k, i) => {
    if (i === 0) return k.high - k.low;
    const prev = c[i - 1].close;
    return Math.max(k.high - k.low, Math.abs(k.high - prev), Math.abs(k.low - prev));
  });
}

/**
 * ATR: por defecto el de Wilder (RMA del rango verdadero), pero acepta los
 * otros suavizados que ofrece el indicador de TradingView.
 */
export function atr(c: Candle[], periodo = 14, tipo: TipoSuavizado = "RMA"): Punto[] {
  return aPuntos(c, suavizar(rangoVerdadero(c), periodo, tipo));
}

// ───────────────────────────── superposiciones ─────────────────────────

export interface LineasAlligator {
  mandibula: Punto[];
  dientes: Punto[];
  labios: Punto[];
}

/**
 * Alligator de Bill Williams: tres medias suavizadas del precio medio,
 * cada una **adelantada** unas velas. Por defecto 13/8, 8/5 y 5/3.
 */
export function alligator(
  c: Candle[],
  mandibulaLen = 13,
  mandibulaDesp = 8,
  dientesLen = 8,
  dientesDesp = 5,
  labiosLen = 5,
  labiosDesp = 3,
): LineasAlligator {
  const medios = c.map(hl2);
  const paso = pasoTipico(c);
  return {
    mandibula: desplazar(aPuntos(c, rma(medios, mandibulaLen)), mandibulaDesp, paso),
    dientes: desplazar(aPuntos(c, rma(medios, dientesLen)), dientesDesp, paso),
    labios: desplazar(aPuntos(c, rma(medios, labiosLen)), labiosDesp, paso),
  };
}

/**
 * DEMA — doble media exponencial: 2·EMA − EMA(EMA). Le saca el retraso a la
 * EMA: sobre una recta, la DEMA cae exactamente sobre la recta.
 */
export function dema(c: Candle[], periodo = 20): Punto[] {
  const cierres = c.map((k) => k.close);
  const e1 = emaSerie(cierres, periodo);
  // La segunda EMA se calcula solo sobre el tramo donde la primera existe.
  const definidos = e1.filter((v): v is number => v !== null);
  const e2 = emaSerie(definidos, periodo);
  const desde = e1.findIndex((v) => v !== null);
  const out: Punto[] = [];
  for (let j = 0; j < definidos.length; j++) {
    const segundo = e2[j];
    if (segundo === null) continue;
    out.push({ time: c[desde + j].time, value: 2 * definidos[j] - segundo });
  }
  return out;
}

export interface CanalKeltner {
  media: Punto[];
  superior: Punto[];
  inferior: Punto[];
}

/**
 * Canales de Keltner: una media (exponencial por defecto, como TradingView)
 * con bandas a `mult` veces el ATR. A diferencia de Bollinger, el ancho lo
 * da el rango verdadero y no la desviación estándar.
 */
export function keltner(
  c: Candle[],
  periodo = 20,
  mult = 2,
  periodoAtr = 10,
  exponencial = true,
): CanalKeltner {
  const cierres = c.map((k) => k.close);
  const base = exponencial ? emaSerie(cierres, periodo) : smaSerie(cierres, periodo);
  const rangos = rma(rangoVerdadero(c), periodoAtr);
  const media: Punto[] = [];
  const superior: Punto[] = [];
  const inferior: Punto[] = [];
  for (let i = 0; i < c.length; i++) {
    const m = base[i];
    const a = rangos[i];
    if (m === null || a === null) continue;
    media.push({ time: c[i].time, value: m });
    superior.push({ time: c[i].time, value: m + mult * a });
    inferior.push({ time: c[i].time, value: m - mult * a });
  }
  return { media, superior, inferior };
}

export interface PuntoSAR extends Punto {
  /** true si la tendencia es alcista (el SAR va por debajo del precio). */
  alcista: boolean;
}

/**
 * Parabolic SAR de Wilder, portado paso a paso del `pine_sar` de referencia
 * de TradingView para que dé los mismos puntos que allá. `inicio` es el
 * factor de aceleración con el que arranca cada tendencia, `incremento`
 * cuánto sube por cada extremo nuevo y `maximo` su techo.
 *
 * El orden importa y es el que impone Pine: primero se mueve el SAR hacia el
 * extremo, después se mira si el precio lo cruzó (y ahí se da vuelta), recién
 * entonces se actualizan extremo y aceleración —y solo si la vela no es la
 * primera de la tendencia—, y al final se lo acota contra las dos velas
 * anteriores. Cambiar ese orden corre las vueltas una vela.
 */
export function parabolicSar(
  c: Candle[],
  inicio = 0.02,
  incremento = 0.02,
  maximo = 0.2,
): PuntoSAR[] {
  if (c.length < 2) return [];
  const out: PuntoSAR[] = [];

  // Arranque en la segunda vela, igual que Pine (`bar_index == 1`).
  let alcista = c[1].close > c[0].close;
  let sar = alcista ? c[0].low : c[0].high;
  let extremo = alcista ? c[1].high : c[1].low;
  let af = inicio;

  for (let i = 1; i < c.length; i++) {
    const k = c[i];
    let primeraDeTendencia = i === 1;

    sar = sar + af * (extremo - sar);

    if (alcista) {
      if (sar > k.low) {
        // Se da vuelta hacia abajo.
        primeraDeTendencia = true;
        alcista = false;
        sar = Math.max(k.high, extremo);
        extremo = k.low;
        af = inicio;
      }
    } else if (sar < k.high) {
      primeraDeTendencia = true;
      alcista = true;
      sar = Math.min(k.low, extremo);
      extremo = k.high;
      af = inicio;
    }

    if (!primeraDeTendencia) {
      if (alcista) {
        if (k.high > extremo) {
          extremo = k.high;
          af = Math.min(af + incremento, maximo);
        }
      } else if (k.low < extremo) {
        extremo = k.low;
        af = Math.min(af + incremento, maximo);
      }
    }

    // El SAR no puede meterse dentro de las dos velas anteriores.
    if (alcista) {
      sar = Math.min(sar, c[i - 1].low);
      if (i > 1) sar = Math.min(sar, c[i - 2].low);
    } else {
      sar = Math.max(sar, c[i - 1].high);
      if (i > 1) sar = Math.max(sar, c[i - 2].high);
    }

    out.push({ time: k.time, value: sar, alcista });
  }
  return out;
}

export interface PuntoSupertrend extends Punto {
  /** true mientras la tendencia sea alcista (la línea va por debajo). */
  alcista: boolean;
}

/**
 * Supertrend: una banda a `factor` veces el ATR del precio medio, que solo
 * puede apretarse a favor de la tendencia. Mientras el cierre no la cruce,
 * la línea acompaña; cuando la cruza, cambia de lado.
 *
 * Como en el `pine_supertrend` de TradingView, la primera vela arranca del
 * lado de la banda de arriba (bajista) y la línea se da vuelta recién cuando
 * el cierre rompe la banda, que queda trabada mientras no la rompan.
 */
export function supertrend(
  c: Candle[],
  periodoAtr = 10,
  factor = 3,
): PuntoSupertrend[] {
  const atrs = rma(rangoVerdadero(c), periodoAtr);
  const out: PuntoSupertrend[] = [];
  let superiorPrev: number | null = null;
  let inferiorPrev: number | null = null;
  // Pine arranca con dirección "1", que es la banda de arriba.
  let alcista = false;

  for (let i = 0; i < c.length; i++) {
    const a = atrs[i];
    if (a === null) continue;
    const medio = hl2(c[i]);
    let superior = medio + factor * a;
    let inferior = medio - factor * a;
    const cierrePrev = i > 0 ? c[i - 1].close : c[i].close;

    // Las bandas solo se mueven en contra del precio si antes lo cruzaron.
    if (superiorPrev !== null && !(superior < superiorPrev || cierrePrev > superiorPrev)) {
      superior = superiorPrev;
    }
    if (inferiorPrev !== null && !(inferior > inferiorPrev || cierrePrev < inferiorPrev)) {
      inferior = inferiorPrev;
    }

    if (superiorPrev === null) {
      // primera vela: queda la dirección de arranque
    } else if (alcista && c[i].close < inferior) {
      alcista = false;
    } else if (!alcista && c[i].close > superior) {
      alcista = true;
    }

    out.push({ time: c[i].time, value: alcista ? inferior : superior, alcista });
    superiorPrev = superior;
    inferiorPrev = inferior;
  }
  return out;
}

// ───────────────────────────── osciladores ─────────────────────────────

export interface BarraAO extends Punto {
  /** true cuando la barra es más alta que la anterior (verde en TradingView). */
  sube: boolean;
}

/**
 * Awesome Oscillator de Bill Williams: SMA 5 menos SMA 34 del precio medio.
 * El color no depende del signo sino de si la barra subió respecto de la
 * anterior, que es como lo pinta TradingView.
 */
export function awesomeOscillator(c: Candle[], corta = 5, larga = 34): BarraAO[] {
  const medios = c.map(hl2);
  const r = smaSerie(medios, corta);
  const l = smaSerie(medios, larga);
  const out: BarraAO[] = [];
  let anterior: number | null = null;
  for (let i = 0; i < c.length; i++) {
    if (r[i] === null || l[i] === null) continue;
    const v = (r[i] as number) - (l[i] as number);
    out.push({ time: c[i].time, value: v, sube: anterior === null ? true : v >= anterior });
    anterior = v;
  }
  return out;
}

export interface LineasAroon {
  arriba: Punto[];
  abajo: Punto[];
}

/**
 * Aroon: hace cuántas velas se marcó el máximo y el mínimo, en porcentaje.
 * 100 significa "el extremo es de esta misma vela"; 0, "hace `periodo`
 * velas". Se mira sobre `periodo + 1` velas, como en Pine.
 */
export function aroon(c: Candle[], periodo = 14): LineasAroon {
  const arriba: Punto[] = [];
  const abajo: Punto[] = [];
  for (let i = periodo; i < c.length; i++) {
    let idxMax = i;
    let idxMin = i;
    for (let j = i - periodo; j <= i; j++) {
      if (c[j].high >= c[idxMax].high) idxMax = j;
      if (c[j].low <= c[idxMin].low) idxMin = j;
    }
    arriba.push({ time: c[i].time, value: ((periodo - (i - idxMax)) / periodo) * 100 });
    abajo.push({ time: c[i].time, value: ((periodo - (i - idxMin)) / periodo) * 100 });
  }
  return { arriba, abajo };
}

/**
 * ADR — rango promedio: la media simple de (máximo − mínimo) de las últimas
 * `periodo` velas. En diario es el "average daily range" de toda la vida;
 * sirve para dimensionar objetivos y stops.
 */
export function adr(c: Candle[], periodo = 14): Punto[] {
  return aPuntos(c, smaSerie(c.map((k) => k.high - k.low), periodo));
}

/**
 * OBV — volumen en balance: suma el volumen cuando la vela cierra arriba de
 * la anterior y lo resta cuando cierra abajo. Importa la forma de la curva,
 * no su valor absoluto.
 */
export function obv(c: Candle[]): Punto[] {
  const out: Punto[] = [];
  let acumulado = 0;
  for (let i = 0; i < c.length; i++) {
    if (i > 0) {
      if (c[i].close > c[i - 1].close) acumulado += c[i].volume;
      else if (c[i].close < c[i - 1].close) acumulado -= c[i].volume;
    }
    out.push({ time: c[i].time, value: acumulado });
  }
  return out;
}
