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
  type AreaSpec,
  type IndicadorNuevo,
  type PuntoSerie,
  type SerieSpec,
} from "@/lib/chart/indicadores-nuevos";
import {
  bollinger,
  macd,
  maOverPoints,
  mfiArea,
  rsi,
  stochRsi,
  wavetrend,
  type MaType,
} from "@/lib/indicators";
import {
  mediasPorDefecto,
  type MediaMovil,
  type TipoMedia,
} from "@/lib/chart/medias";
import { DEFAULT_CONFIG, type IndicatorConfig } from "@/lib/store/chart-store";
import type { Candle } from "@/lib/binance/types";

export interface IndicadorBT extends Omit<IndicadorNuevo, "clave" | "calcular"> {
  clave: string;
  /** Nombre corto para el menú. */
  etiqueta: string;
  /**
   * Las medias son la excepción: cuántas líneas hay y de qué color lo
   * decide el usuario, así que sus series se arman en el momento en vez
   * de estar declaradas fijas.
   */
  seriesDe?: (medias: MediaMovil[]) => SerieSpec[];
  /** Tiene parámetros que el usuario puede tocar. */
  editable?: boolean;
  calcular: (
    velas: Candle[],
    c: IndicatorConfig,
    medias: MediaMovil[],
  ) => Record<string, PuntoSerie[]>;
}

/** De nuestro nombre de media al que entiende `maOverPoints`. */
const MAPA_MA: Record<TipoMedia, MaType> = {
  MA: "SMA",
  EMA: "EMA",
  WMA: "WMA",
  VWMA: "VWMA",
  SMMA: "SMMA (RMA)",
};

const AMARILLO = "#ffb74d";
const ROJO = "#ef5350";
const AZUL = "#2962ff";
const VERDE = "#26a69a";
const MORADO = "#ab47bc";
const NARANJA = "#ff6d00";
const GRIS = "#787b86";

/**
 * Colores y filas del Cipher B, copiados del gráfico principal.
 *
 * Son los del Pine original de VuManChu, no una paleta nuestra: si acá se
 * eligieran otros, el mismo indicador se vería de dos formas distintas
 * según la pestaña. Las filas de señal (±106) están medidas sobre la
 * captura de TradingView.
 */
const CIPHER_FILA_VENTA = 106;
const CIPHER_FILA_COMPRA = -106;
const C_WT1 = "#4994ec";
const C_WT2 = "#1f1559";
const C_RAPIDA = "#ffffff";
const C_MFI_ARRIBA = "#3ee145";
const C_MFI_ABAJO = "#ff3d2e";
const C_RSI = "#c33ee1";
const C_TEXTO = "#d1d4dc";
const AREA_WT1: AreaSpec = {
  arriba: [`${C_WT1}B3`, `${C_WT1}30`],
  abajo: [`${C_WT1}30`, `${C_WT1}B3`],
  lineaArriba: C_WT1,
  lineaAbajo: C_WT1,
};
const AREA_WT2: AreaSpec = {
  arriba: [`${C_WT2}BF`, `${C_WT2}50`],
  abajo: [`${C_WT2}50`, `${C_WT2}BF`],
  lineaArriba: C_WT2,
  lineaAbajo: C_WT2,
};
const AREA_RAPIDA: AreaSpec = {
  arriba: [`${C_RAPIDA}80`, `${C_RAPIDA}20`],
  abajo: [`${C_RAPIDA}20`, `${C_RAPIDA}80`],
  lineaArriba: C_RAPIDA,
  lineaAbajo: C_RAPIDA,
};
const AREA_MFI: AreaSpec = {
  arriba: [`${C_MFI_ARRIBA}FF`, `${C_MFI_ARRIBA}80`],
  abajo: [`${C_MFI_ABAJO}80`, `${C_MFI_ABAJO}FF`],
  lineaArriba: `${C_MFI_ARRIBA}FF`,
  lineaAbajo: `${C_MFI_ABAJO}FF`,
};

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
    etiqueta: "Medias móviles",
    nombre: () => "Medias",
    conPanel: false,
    editable: true,
    // Fijas solo como respaldo: lo que manda es `seriesDe`.
    series: [{ clave: "ema20", forma: "linea", color: AMARILLO }],
    seriesDe: (medias) =>
      medias
        .filter((m) => m.visible)
        .map((m) => ({
          clave: m.id,
          forma: "linea" as const,
          color: m.color,
          grosor: (m.grosor === 2 ? 2 : 1) as 1 | 2,
        })),
    calcular: (velas, _c, medias) => {
      // `maOverPoints` trabaja sobre puntos y necesita los volúmenes
      // aparte, que es lo único que distingue a la VWMA.
      const cierres = velas.map((k) => ({ time: k.time, value: k.close }));
      const volumenes = new Map(velas.map((k) => [k.time, k.volume]));
      const out: Record<string, PuntoSerie[]> = {};
      for (const m of medias) {
        if (!m.visible) continue;
        out[m.id] = maOverPoints(cierres, m.periodo, MAPA_MA[m.tipo], volumenes);
      }
      return out;
    },
    valor: (u, fmt) => {
      const primera = Object.values(u).find((v) => v !== undefined);
      return primera === undefined ? undefined : fmt(primera);
    },
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
  {
    clave: "srsi",
    etiqueta: "Stoch RSI",
    nombre: () => "Stoch RSI 3 · 3 · 14 · 14",
    conPanel: true,
    series: [
      { clave: "k", forma: "linea", color: AZUL, grosor: 2 },
      { clave: "d", forma: "linea", color: NARANJA },
      { clave: "n80", forma: "linea", color: GRIS, estilo: 2 },
      { clave: "n20", forma: "linea", color: GRIS, estilo: 2 },
    ],
    calcular: (velas, c) => {
      const s = stochRsi(velas, c.srsiStochLen, c.srsiRsiLen, c.srsiK, c.srsiD);
      return {
        k: s.map((p) => ({ time: p.time, value: p.k })),
        d: s.map((p) => ({ time: p.time, value: p.d })),
        n80: nivel(velas, 80),
        n20: nivel(velas, 20),
      };
    },
    valor: (u) =>
      u.k === undefined ? undefined : `${u.k.toFixed(1)} / ${(u.d ?? 0).toFixed(1)}`,
  },
  {
    clave: "cipher",
    etiqueta: "VuManChu Cipher B",
    nombre: () => "Cipher B",
    conPanel: true,
    // Las filas de señal viven a ±106, fuera del rango de la onda, y el
    // panel se encogía hasta recortarlas cuando no había ninguna a la
    // vista. Mismo margen que usa el gráfico principal.
    rango: { min: CIPHER_FILA_COMPRA - 8, max: CIPHER_FILA_VENTA + 8 },
    // Doble alto, como en el gráfico principal: con el de un RSI la onda
    // y las dos filas de puntos no entran.
    alto: 2,
    // El orden es el orden de dibujo: lo último queda encima. Es el mismo
    // que el del gráfico principal, para que se vea igual.
    series: [
      { clave: "ola", forma: "area", color: C_WT1, area: AREA_WT1 },
      { clave: "wt2", forma: "area", color: C_WT2, area: AREA_WT2 },
      { clave: "rapida", forma: "area", color: C_RAPIDA, area: AREA_RAPIDA },
      { clave: "mfi", forma: "area", color: C_MFI_ARRIBA, area: AREA_MFI, grosor: 2 },
      { clave: "rsi", forma: "linea", color: C_RSI, grosor: 2 },
      // Niveles: el primero punteado, el segundo sólido, el tercero rayado.
      { clave: "ob", forma: "linea", color: GRIS, estilo: 2 },
      { clave: "ob2", forma: "linea", color: C_TEXTO, estilo: 0 },
      { clave: "ob3", forma: "linea", color: `${C_TEXTO}60`, estilo: 3 },
      { clave: "os", forma: "linea", color: GRIS, estilo: 2 },
      { clave: "os2", forma: "linea", color: C_TEXTO, estilo: 0 },
      { clave: "os3", forma: "linea", color: `${C_TEXTO}60`, estilo: 3 },
      { clave: "cero", forma: "linea", color: `${C_TEXTO}60` },
      // Los puntos, de más débil a más fuerte para que el fuerte tape.
      { clave: "cruceArriba", forma: "puntos", color: "#00e676" },
      { clave: "cruceAbajo", forma: "puntos", color: "#ff5252" },
      { clave: "compra", forma: "puntos", color: "#3fff00", grosor: 2 },
      { clave: "venta", forma: "puntos", color: "#ff0000", grosor: 2 },
      { clave: "oro", forma: "puntos", color: "#e2a400", grosor: 2 },
      { clave: "filaCompra", forma: "puntos", color: "#3fff00", grosor: 2 },
      { clave: "filaVenta", forma: "puntos", color: "#ff0000", grosor: 2 },
    ],
    calcular: (velas, c) => {
      const w = wavetrend(velas, c.wtChannelLen, c.wtAverageLen, c.wtMALen);
      const m = mfiArea(velas, c.mfiPeriod, c.mfiMultiplier, c.cipherMfiYPos);
      const r = rsi(velas, c.cipherRsiLen);
      const rsiEn = new Map(r.map((p) => [p.time, p.value]));

      // Los puntos de señal son el cruce de la ola con su media. En el
      // gráfico se ven dos cosas por cada señal: el círculo sobre la onda
      // y el puntito en la fila fija de arriba o de abajo.
      const compra: PuntoSerie[] = [];
      const venta: PuntoSerie[] = [];
      const oro: PuntoSerie[] = [];
      const cruceArriba: PuntoSerie[] = [];
      const cruceAbajo: PuntoSerie[] = [];
      const filaCompra: PuntoSerie[] = [];
      const filaVenta: PuntoSerie[] = [];
      for (let i = 1; i < w.length; i++) {
        const a = w[i - 1];
        const b = w[i];
        const haciaArriba = a.wt1 <= a.wt2 && b.wt1 > b.wt2;
        const haciaAbajo = a.wt1 >= a.wt2 && b.wt1 < b.wt2;
        if (!haciaArriba && !haciaAbajo) continue;
        const sobrevendido = b.wt2 <= c.wtOsLevel;
        const sobrecomprado = b.wt2 >= c.wtObLevel;
        const rsiAca = rsiEn.get(b.time);
        // Punto de oro: cruce al alza desde el extremo de sobreventa con el
        // RSI por debajo de 30. Es la señal fuerte del Cipher B.
        if (
          haciaArriba &&
          rsiAca !== undefined &&
          rsiAca < 30 &&
          a.wt2 <= c.wtOsLevel3 &&
          b.wt2 - a.wt2 >= 0 &&
          b.wt2 > c.wtOsLevel3 - 5
        ) {
          oro.push({ time: b.time, value: b.wt2 });
          filaCompra.push({ time: b.time, value: CIPHER_FILA_COMPRA });
          continue;
        }
        if (haciaArriba && sobrevendido) {
          compra.push({ time: b.time, value: b.wt2 });
          filaCompra.push({ time: b.time, value: CIPHER_FILA_COMPRA });
        } else if (haciaAbajo && sobrecomprado) {
          venta.push({ time: b.time, value: b.wt2 });
          filaVenta.push({ time: b.time, value: CIPHER_FILA_VENTA });
        } else if (haciaArriba) {
          cruceArriba.push({ time: b.time, value: b.wt2 });
        } else {
          cruceAbajo.push({ time: b.time, value: b.wt2 });
        }
      }

      return {
        ola: w.map((p) => ({ time: p.time, value: p.wt1 })),
        wt2: w.map((p) => ({ time: p.time, value: p.wt2 })),
        // La onda rápida es wt1 − wt2, que `wavetrend` ya devuelve.
        rapida: w.map((p) => ({ time: p.time, value: p.vwap })),
        mfi: m.map((p) => ({ time: p.time, value: p.value })),
        rsi: r.map((p) => ({ time: p.time, value: p.value })),
        ob: nivel(velas, c.wtObLevel),
        ob2: nivel(velas, c.wtObLevel2),
        ob3: nivel(velas, c.wtObLevel3),
        os: nivel(velas, c.wtOsLevel),
        os2: nivel(velas, c.wtOsLevel2),
        os3: nivel(velas, c.wtOsLevel3),
        cero: nivel(velas, 0),
        cruceArriba,
        cruceAbajo,
        compra,
        venta,
        oro,
        filaCompra,
        filaVenta,
      };
    },
    valor: (u) =>
      u.ola === undefined
        ? undefined
        : `WT ${u.ola.toFixed(1)} · MFI ${(u.mfi ?? 0).toFixed(1)}`,
  },
];

/** Las medias con las que arranca un backtest nuevo. */
export { mediasPorDefecto };

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
