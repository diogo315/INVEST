/**
 * Registro de los indicadores agregados en octubre, declarado como datos.
 *
 * El gráfico tenía un bloque de ~80 líneas por indicador (crear series,
 * borrarlas, recalcular, leyenda). Con diez más eso eran mil líneas casi
 * iguales. Acá cada indicador se describe una vez —qué series dibuja, de qué
 * color, si va en su propio panel y cómo se calcula— y `PriceChart` tiene un
 * solo bloque genérico que lo recorre.
 *
 * No importa `lightweight-charts` a propósito: las formas son strings y el
 * gráfico las traduce. Así se puede probar sin navegador.
 */

import type { Candle } from "@/lib/binance/types";
import type { IndicatorConfig, IndicatorKey } from "@/lib/store/chart-store";
import {
  adr,
  alligator,
  aroon,
  atr,
  awesomeOscillator,
  dema,
  keltner,
  obv,
  parabolicSar,
  suavizarPuntos,
  supertrend,
  type Punto,
  type TipoSuavizado,
} from "@/lib/indicators/nuevos";

/** Un punto sin `value` es un hueco: corta la línea sin dibujar nada. */
export interface PuntoSerie {
  time: number;
  value?: number;
  color?: string;
}

/** Cómo se dibuja una serie: línea, puntos sueltos o barras. */
export type FormaSerie = "linea" | "puntos" | "histograma";

export interface SerieSpec {
  clave: string;
  forma: FormaSerie;
  color: string;
  grosor?: 1 | 2;
  /** 0 sólido, 2 punteado (igual que lightweight-charts). */
  estilo?: 0 | 2;
}

export interface RellenoSpec {
  arriba: string;
  abajo: string;
  color: string;
}

export interface IndicadorNuevo {
  clave: IndicatorKey;
  /** Nombre que va en la chapa del gráfico. */
  nombre: (c: IndicatorConfig) => string;
  /** true: panel propio debajo del precio. false: encima de las velas. */
  conPanel: boolean;
  series: SerieSpec[];
  relleno?: RellenoSpec;
  calcular: (velas: Candle[], c: IndicatorConfig) => Record<string, PuntoSerie[]>;
  /** Texto del valor actual en la chapa. */
  valor: (
    ultimos: Record<string, number | undefined>,
    fmt: (n: number) => string,
  ) => string | undefined;
}

const VERDE = "#26a69a";
const ROJO = "#ef5350";
const AZUL = "#2962ff";
const NARANJA = "#ff6d00";
const GRIS = "#787b86";

/** Línea horizontal de punta a punta de los datos (el cero del AO, el 50…). */
function nivel(velas: Candle[], v: number): PuntoSerie[] {
  if (velas.length === 0) return [];
  return [
    { time: velas[0].time, value: v },
    { time: velas[velas.length - 1].time, value: v },
  ];
}

/** Los puntos de una curva, cortada donde `activo` es falso. */
function soloCuando<T extends Punto>(
  pts: T[],
  activo: (p: T) => boolean,
): PuntoSerie[] {
  return pts.map((p) => (activo(p) ? { time: p.time, value: p.value } : { time: p.time }));
}

const num = (n: number | undefined, dec = 2) =>
  n === undefined ? "—" : n.toFixed(dec);

export const INDICADORES_NUEVOS: IndicadorNuevo[] = [
  // ───────────────────────── superposiciones ─────────────────────────
  {
    clave: "alligator",
    conPanel: false,
    nombre: (c) =>
      `Alligator ${c.alligatorMandibula}, ${c.alligatorDientes}, ${c.alligatorLabios}`,
    series: [
      { clave: "mandibula", forma: "linea", color: AZUL },
      { clave: "dientes", forma: "linea", color: ROJO },
      { clave: "labios", forma: "linea", color: VERDE },
    ],
    calcular: (velas, c) => {
      const a = alligator(
        velas,
        c.alligatorMandibula,
        c.alligatorMandibulaDesp,
        c.alligatorDientes,
        c.alligatorDientesDesp,
        c.alligatorLabios,
        c.alligatorLabiosDesp,
      );
      return { mandibula: a.mandibula, dientes: a.dientes, labios: a.labios };
    },
    valor: (u, fmt) =>
      u.labios === undefined
        ? undefined
        : `${fmt(u.labios)} · ${fmt(u.dientes ?? 0)} · ${fmt(u.mandibula ?? 0)}`,
  },
  {
    clave: "dema",
    conPanel: false,
    nombre: (c) => `DEMA ${c.demaLength}`,
    series: [{ clave: "dema", forma: "linea", color: NARANJA, grosor: 2 }],
    calcular: (velas, c) => ({ dema: dema(velas, c.demaLength) }),
    valor: (u, fmt) => (u.dema === undefined ? undefined : fmt(u.dema)),
  },
  {
    clave: "keltner",
    conPanel: false,
    nombre: (c) => `Keltner ${c.keltnerLength}, ${c.keltnerMult}`,
    series: [
      { clave: "superior", forma: "linea", color: VERDE },
      { clave: "media", forma: "linea", color: VERDE, estilo: 2 },
      { clave: "inferior", forma: "linea", color: VERDE },
    ],
    relleno: { arriba: "superior", abajo: "inferior", color: "#26a69a14" },
    calcular: (velas, c) => {
      const k = keltner(
        velas,
        c.keltnerLength,
        c.keltnerMult,
        c.keltnerAtrLength,
        c.keltnerUseEma,
      );
      return { superior: k.superior, media: k.media, inferior: k.inferior };
    },
    valor: (u, fmt) =>
      u.media === undefined
        ? undefined
        : `${fmt(u.superior ?? 0)} · ${fmt(u.media)} · ${fmt(u.inferior ?? 0)}`,
  },
  {
    clave: "sar",
    conPanel: false,
    nombre: (c) => `SAR ${c.sarStart}, ${c.sarInc}, ${c.sarMax}`,
    series: [
      { clave: "sube", forma: "puntos", color: VERDE },
      { clave: "baja", forma: "puntos", color: ROJO },
    ],
    calcular: (velas, c) => {
      const s = parabolicSar(velas, c.sarStart, c.sarInc, c.sarMax);
      return {
        sube: soloCuando(s, (p) => p.alcista),
        baja: soloCuando(s, (p) => !p.alcista),
      };
    },
    valor: (u, fmt) => {
      const v = u.sube ?? u.baja;
      return v === undefined ? undefined : fmt(v);
    },
  },
  {
    clave: "supertrend",
    conPanel: false,
    nombre: (c) => `Supertrend ${c.supertrendAtr}, ${c.supertrendFactor}`,
    series: [
      { clave: "sube", forma: "linea", color: VERDE, grosor: 2 },
      { clave: "baja", forma: "linea", color: ROJO, grosor: 2 },
    ],
    calcular: (velas, c) => {
      const s = supertrend(velas, c.supertrendAtr, c.supertrendFactor);
      return {
        sube: soloCuando(s, (p) => p.alcista),
        baja: soloCuando(s, (p) => !p.alcista),
      };
    },
    valor: (u, fmt) => {
      const v = u.sube ?? u.baja;
      return v === undefined ? undefined : fmt(v);
    },
  },

  // ─────────────────────────── osciladores ───────────────────────────
  {
    clave: "ao",
    conPanel: true,
    nombre: (c) => `Awesome Oscillator ${c.aoFast}, ${c.aoSlow}`,
    series: [
      { clave: "cero", forma: "linea", color: GRIS, estilo: 2 },
      { clave: "ao", forma: "histograma", color: VERDE },
    ],
    calcular: (velas, c) => ({
      cero: nivel(velas, 0),
      // El color de cada barra depende de si subió respecto de la anterior,
      // no del signo: así lo pinta TradingView.
      ao: awesomeOscillator(velas, c.aoFast, c.aoSlow).map((p) => ({
        time: p.time,
        value: p.value,
        color: p.sube ? `${VERDE}cc` : `${ROJO}cc`,
      })),
    }),
    valor: (u) => (u.ao === undefined ? undefined : num(u.ao)),
  },
  {
    clave: "atr",
    conPanel: true,
    nombre: (c) => `ATR ${c.atrLength}`,
    series: [{ clave: "atr", forma: "linea", color: "#b2b5be" }],
    calcular: (velas, c) => ({
      atr: atr(velas, c.atrLength, c.atrSmoothing as TipoSuavizado),
    }),
    valor: (u, fmt) => (u.atr === undefined ? undefined : fmt(u.atr)),
  },
  {
    clave: "aroon",
    conPanel: true,
    nombre: (c) => `Aroon ${c.aroonLength}`,
    series: [
      { clave: "medio", forma: "linea", color: `${GRIS}80`, estilo: 2 },
      { clave: "arriba", forma: "linea", color: NARANJA },
      { clave: "abajo", forma: "linea", color: AZUL },
    ],
    calcular: (velas, c) => {
      const a = aroon(velas, c.aroonLength);
      return { medio: nivel(velas, 50), arriba: a.arriba, abajo: a.abajo };
    },
    valor: (u) =>
      u.arriba === undefined
        ? undefined
        : `${num(u.arriba, 0)} / ${num(u.abajo, 0)}`,
  },
  {
    clave: "adr",
    conPanel: true,
    nombre: (c) => `Rango promedio ${c.adrLength}`,
    series: [{ clave: "adr", forma: "linea", color: "#9c27b0" }],
    calcular: (velas, c) => ({ adr: adr(velas, c.adrLength) }),
    valor: (u, fmt) => (u.adr === undefined ? undefined : fmt(u.adr)),
  },
  {
    clave: "obv",
    conPanel: true,
    nombre: () => "OBV",
    series: [
      { clave: "obv", forma: "linea", color: AZUL },
      { clave: "media", forma: "linea", color: NARANJA },
    ],
    calcular: (velas, c) => {
      const base = obv(velas);
      const suave =
        c.obvSmoothType === "None"
          ? []
          : suavizarPuntos(
              base,
              c.obvSmoothLength,
              c.obvSmoothType as TipoSuavizado,
            );
      return { obv: base, media: suave };
    },
    valor: (u) => (u.obv === undefined ? undefined : compacto(u.obv)),
  },
];

/** 1.234.567 → "1,23 M": el OBV acumula volumen y los números se van. */
export function compacto(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e12) return `${(n / 1e12).toFixed(2)} B`;
  if (abs >= 1e9) return `${(n / 1e9).toFixed(2)} MM`;
  if (abs >= 1e6) return `${(n / 1e6).toFixed(2)} M`;
  if (abs >= 1e3) return `${(n / 1e3).toFixed(2)} K`;
  return n.toFixed(2);
}

/** Acceso por clave, para la leyenda y el diálogo de ajustes. */
export const POR_CLAVE: Record<string, IndicadorNuevo> = Object.fromEntries(
  INDICADORES_NUEVOS.map((i) => [i.clave, i]),
);

/** Las claves de los indicadores nuevos, para distinguirlos de los viejos. */
export const CLAVES_NUEVAS = INDICADORES_NUEVOS.map((i) => i.clave);
