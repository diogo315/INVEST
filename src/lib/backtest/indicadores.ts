/**
 * Indicadores disponibles en el backtesting.
 *
 * Reusa el registro declarativo de `indicadores-nuevos.ts` —Alligator,
 * DEMA, Keltner, SAR, Supertrend, AO, ATR, Aroon, ADR, OBV— y le suma los
 * clásicos que en el gráfico principal están cableados a mano: medias,
 * RSI, MACD, Bollinger y volumen.
 *
 * Cada indicador se describe igual: qué series dibuja, de qué color, si va
 * en su propio panel y cómo se calcula. El gráfico del backtest tiene un
 * solo bloque genérico que recorre esto, así que agregar uno más es
 * agregar un objeto a la lista.
 *
 * LO CRÍTICO: `calcular` recibe SOLO las velas que el backtest ya vivió.
 * Un indicador que mirase la serie completa estaría viendo el futuro, y el
 * backtest entero no valdría nada.
 */

import {
  INDICADORES_NUEVOS,
  type IndicadorNuevo,
  type PuntoSerie,
} from "@/lib/chart/indicadores-nuevos";
import { bollinger, ema, macd, rsi } from "@/lib/indicators";
import { DEFAULT_CONFIG, type IndicatorConfig } from "@/lib/store/chart-store";
import type { Candle } from "@/lib/binance/types";

export interface IndicadorBT extends Omit<IndicadorNuevo, "clave"> {
  clave: string;
  /** Nombre corto para el menú. */
  etiqueta: string;
}

const AMARILLO = "#ffb74d";
const ROJO = "#ef5350";
const AZUL = "#2962ff";
const VERDE = "#26a69a";
const MORADO = "#ab47bc";
const GRIS = "#787b86";

/** Línea horizontal de punta a punta: el 30 y el 70 del RSI, el 0 del MACD. */
function nivel(velas: Candle[], v: number): PuntoSerie[] {
  if (velas.length === 0) return [];
  return [
    { time: velas[0].time, value: v },
    { time: velas[velas.length - 1].time, value: v },
  ];
}

const CLASICOS: IndicadorBT[] = [
  {
    clave: "medias",
    etiqueta: "Medias (20/50/200)",
    nombre: () => "Medias 20 · 50 · 200",
    conPanel: false,
    series: [
      { clave: "m20", forma: "linea", color: AMARILLO },
      { clave: "m50", forma: "linea", color: ROJO },
      { clave: "m200", forma: "linea", color: AZUL, grosor: 2 },
    ],
    calcular: (velas) => ({
      m20: ema(velas, 20),
      m50: ema(velas, 50),
      m200: ema(velas, 200),
    }),
    valor: (u, fmt) =>
      u.m20 === undefined ? undefined : `20 ${fmt(u.m20)}`,
  },
  {
    clave: "bb",
    etiqueta: "Bandas de Bollinger",
    nombre: () => "Bollinger 20 · 2σ",
    conPanel: false,
    series: [
      { clave: "superior", forma: "linea", color: MORADO },
      { clave: "media", forma: "linea", color: MORADO, estilo: 2 },
      { clave: "inferior", forma: "linea", color: MORADO },
    ],
    relleno: { arriba: "superior", abajo: "inferior", color: "#ab47bc14" },
    calcular: (velas) => {
      const b = bollinger(velas, 20, 2);
      return {
        superior: b.map((p) => ({ time: p.time, value: p.upper })),
        media: b.map((p) => ({ time: p.time, value: p.middle })),
        inferior: b.map((p) => ({ time: p.time, value: p.lower })),
      };
    },
    valor: (u, fmt) =>
      u.media === undefined ? undefined : `media ${fmt(u.media)}`,
  },
  {
    clave: "volumen",
    etiqueta: "Volumen",
    nombre: () => "Volumen",
    conPanel: true,
    series: [{ clave: "vol", forma: "histograma", color: GRIS }],
    calcular: (velas) => ({
      vol: velas.map((k) => ({
        time: k.time,
        value: k.volume,
        color: k.close >= k.open ? `${VERDE}66` : `${ROJO}66`,
      })),
    }),
    valor: (u) =>
      u.vol === undefined
        ? undefined
        : u.vol >= 1e6
          ? `${(u.vol / 1e6).toFixed(2)}M`
          : `${(u.vol / 1e3).toFixed(1)}K`,
  },
  {
    clave: "rsi",
    etiqueta: "RSI 14",
    nombre: () => "RSI 14",
    conPanel: true,
    series: [
      { clave: "rsi", forma: "linea", color: MORADO, grosor: 2 },
      { clave: "n70", forma: "linea", color: GRIS, estilo: 2 },
      { clave: "n30", forma: "linea", color: GRIS, estilo: 2 },
    ],
    calcular: (velas) => ({
      rsi: rsi(velas, 14),
      n70: nivel(velas, 70),
      n30: nivel(velas, 30),
    }),
    valor: (u) => (u.rsi === undefined ? undefined : u.rsi.toFixed(1)),
  },
  {
    clave: "macd",
    etiqueta: "MACD 12/26/9",
    nombre: () => "MACD 12 · 26 · 9",
    conPanel: true,
    series: [
      { clave: "macd", forma: "linea", color: AZUL, grosor: 2 },
      { clave: "senal", forma: "linea", color: AMARILLO },
      { clave: "hist", forma: "histograma", color: GRIS },
    ],
    calcular: (velas) => {
      const m = macd(velas, 12, 26, 9);
      return {
        macd: m.map((p) => ({ time: p.time, value: p.macd })),
        senal: m.map((p) => ({ time: p.time, value: p.signal })),
        hist: m.map((p) => ({
          time: p.time,
          value: p.histogram,
          color: p.histogram >= 0 ? `${VERDE}80` : `${ROJO}80`,
        })),
      };
    },
    valor: (u) =>
      u.macd === undefined ? undefined : `${u.macd.toFixed(2)} / ${(u.senal ?? 0).toFixed(2)}`,
  },
];

/** Nombres cortos de los del registro compartido, para el menú. */
const ETIQUETAS: Record<string, string> = {
  alligator: "Alligator",
  dema: "DEMA",
  keltner: "Canales de Keltner",
  sar: "Parabolic SAR",
  supertrend: "Supertrend",
  ao: "Awesome Oscillator",
  atr: "ATR",
  aroon: "Aroon",
  adr: "Rango promedio (ADR)",
  obv: "OBV",
};

export const INDICADORES_BT: IndicadorBT[] = [
  ...CLASICOS,
  ...INDICADORES_NUEVOS.map((i) => ({
    ...i,
    clave: i.clave as string,
    etiqueta: ETIQUETAS[i.clave] ?? i.clave,
  })),
];

export function indicadorPorClave(clave: string): IndicadorBT | undefined {
  return INDICADORES_BT.find((i) => i.clave === clave);
}

/** Config con la que se calculan: la de fábrica del gráfico principal. */
export const CONFIG_BT: IndicatorConfig = DEFAULT_CONFIG;

/** Solo las claves que existen, sin repetidos y con un tope sensato. */
export function sanearIndicadores(crudo: unknown): string[] {
  if (!Array.isArray(crudo)) return [];
  const validas = new Set(INDICADORES_BT.map((i) => i.clave));
  return [...new Set(crudo.filter((c): c is string => typeof c === "string"))]
    .filter((c) => validas.has(c))
    .slice(0, 8);
}
