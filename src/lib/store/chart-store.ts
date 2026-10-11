"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Timeframe } from "@/lib/binance/types";
import { ZONA_POR_DEFECTO, type ChartTimezone } from "@/lib/chart/timezone";
import { HISTORIA_POR_DEFECTO, OPCIONES_HISTORIA } from "@/lib/binance/paginado";
import {
  dibujoNuevo,
  sanearDibujos,
  type Dibujo,
  type PuntoDibujo,
  type TipoDibujo,
} from "@/lib/dibujos/tipos";
export type { Dibujo, PuntoDibujo, TipoDibujo } from "@/lib/dibujos/tipos";
import {
  MAX_ALERTAS,
  MAX_DISPAROS,
  type Alerta,
  type Disparo,
} from "@/lib/alertas/tipos";
export type { Alerta, Disparo } from "@/lib/alertas/tipos";
export { OPCIONES_HISTORIA } from "@/lib/binance/paginado";
import {
  MAX_MEDIAS,
  mediasPorDefecto,
  migrarMedias,
  nuevaMedia,
  sanearMedias,
  type MediaMovil,
} from "@/lib/chart/medias";

export type { MediaMovil, TipoMedia } from "@/lib/chart/medias";
export { MAX_MEDIAS, COLORES_MEDIA } from "@/lib/chart/medias";

export type IndicatorKey =
  // Un solo indicador para todas las medias móviles: la lista de líneas
  // vive en `medias`, no en el config.
  | "medias"
  | "rsi"
  | "macd"
  | "volume"
  | "bb"
  | "stoch"
  | "vwap"
  | "cipher"
  | "gli"
  | "srsi"
  // Superposiciones sobre las velas
  | "alligator"
  | "dema"
  | "keltner"
  | "sar"
  | "supertrend"
  // Osciladores, cada uno en su panel
  | "ao"
  | "atr"
  | "aroon"
  | "adr"
  | "obv";

/**
 * Herramienta activa del panel izquierdo: el cursor normal, la regla, el
 * borrador o una de las herramientas de dibujo.
 */
export type DrawingTool = "cursor" | "measure" | "eraser" | TipoDibujo;

export interface PriceLine {
  id: string;
  symbol: string;
  price: number;
}

export interface IndicatorConfig {
  rsi: number;
  // RSI — resto de entradas del indicador estándar de TradingView
  rsiSource: string; // close | open | high | low | hl2 | hlc3 | ohlc4
  rsiCalcDivergence: boolean;
  rsiMaType: string; // None | SMA | SMA + Bollinger Bands | EMA | SMMA (RMA) | WMA | VWMA
  rsiMaLength: number;
  rsiBbMult: number;
  macdFast: number;
  macdSlow: number;
  macdSignal: number;
  bbPeriod: number;
  bbStdDev: number;
  stochK: number;
  stochD: number;
  stochSmooth: number;
  // Stoch RSI estándar (TradingView / Pine v6)
  srsiK: number;
  srsiD: number;
  srsiRsiLen: number;
  srsiStochLen: number;
  // VWAP anclado + bandas (TradingView / Pine v6)
  vwapHideOnDWM: boolean;
  vwapAnchor: string; // session | week | month | quarter | year
  vwapSource: string; // hlc3 | hl2 | hlcc4 | ohlc4 | close
  vwapOffset: number;
  vwapBandsMode: string; // stdev | pct
  vwapShowBand1: boolean;
  vwapMult1: number;
  vwapShowBand2: boolean;
  vwapMult2: number;
  vwapShowBand3: boolean;
  vwapMult3: number;
  // VuManChu Cipher B
  wtChannelLen: number;
  wtAverageLen: number;
  wtMALen: number;
  mfiPeriod: number;
  mfiMultiplier: number;
  cipherStochLen: number;
  cipherStochRsiLen: number;
  cipherStochSmoothK: number;
  cipherStochSmoothD: number;
  wtObLevel: number;
  wtObLevel2: number;
  wtObLevel3: number;
  wtOsLevel: number;
  wtOsLevel2: number;
  wtOsLevel3: number;
  cipherMfiYPos: number;
  cipherRsiLen: number;
  cipherRsiOversold: number;
  cipherRsiOverbought: number;
  cipherStochUseLog: boolean;
  cipherStochUseAvg: boolean;
  // Cipher sub-feature toggles
  cipherShowWaveTrend: boolean;
  cipherShowBuyDots: boolean;
  cipherShowGoldDots: boolean;
  cipherShowSellDots: boolean;
  cipherShowCrossDots: boolean;
  cipherShowFastWT: boolean;
  cipherShowMFI: boolean;
  cipherShowRSI: boolean;
  cipherShowStochRSI: boolean;
  // Divergences
  cipherShowDivDots: boolean;
  cipherShowWTDivergences: boolean;
  cipherShowWTDivergencesHidden: boolean;
  cipherShowWTDivergences2: boolean;
  cipherShowRSIDivergences: boolean;
  cipherShowRSIDivergencesHidden: boolean;
  cipherShowStochDivergences: boolean;
  cipherShowStochDivergencesHidden: boolean;
  cipherNotApplyOBOSOnHidden: boolean;
  cipherWtDivOBLevel: number;
  cipherWtDivOSLevel: number;
  cipherWtDivOBLevel2: number;
  cipherWtDivOSLevel2: number;
  cipherRsiDivOBLevel: number;
  cipherRsiDivOSLevel: number;
  // Schaff Trend Cycle
  cipherShowSchaff: boolean;
  cipherSchaffLength: number;
  cipherSchaffFast: number;
  cipherSchaffSlow: number;
  cipherSchaffFactor: number;
  // Sommi flag (multi-TF)
  cipherShowSommiFlag: boolean;
  cipherShowSommiFastWave: boolean;
  cipherSommiVwapTF: string;
  cipherSommiVwapBearLevel: number;
  cipherSommiVwapBullLevel: number;
  cipherSommiFlagWTBearLevel: number;
  cipherSommiFlagWTBullLevel: number;
  cipherSommiRSIMFIBearLevel: number;
  cipherSommiRSIMFIBullLevel: number;
  // Sommi diamond (multi-TF Heikin Ashi)
  cipherShowSommiDiamond: boolean;
  cipherSommiHTCRes: string;
  cipherSommiHTCRes2: string;
  cipherSommiDiamondWTBearLevel: number;
  cipherSommiDiamondWTBullLevel: number;
  // MACD colors override (multi-TF)
  cipherShowMacdColors: boolean;
  cipherMacdColorsTF: string;

  // ── Indicadores agregados en octubre ────────────────────────────────
  // Alligator de Bill Williams: tres medias suavizadas adelantadas.
  alligatorMandibula: number;
  alligatorMandibulaDesp: number;
  alligatorDientes: number;
  alligatorDientesDesp: number;
  alligatorLabios: number;
  alligatorLabiosDesp: number;
  // DEMA
  demaLength: number;
  // Canales de Keltner
  keltnerLength: number;
  keltnerMult: number;
  keltnerAtrLength: number;
  keltnerUseEma: boolean;
  keltnerFill: boolean;
  // Parabolic SAR
  sarStart: number;
  sarInc: number;
  sarMax: number;
  // Supertrend
  supertrendAtr: number;
  supertrendFactor: number;
  // Awesome Oscillator
  aoFast: number;
  aoSlow: number;
  // ATR
  atrLength: number;
  atrSmoothing: string; // RMA | SMA | EMA | WMA
  // Aroon
  aroonLength: number;
  // ADR (rango promedio)
  adrLength: number;
  // OBV con media opcional
  obvSmoothType: string; // None | SMA | EMA | WMA | RMA
  obvSmoothLength: number;
}

export const DEFAULT_CONFIG: IndicatorConfig = {
  rsi: 14,
  rsiSource: "close",
  rsiCalcDivergence: true,
  rsiMaType: "SMA",
  rsiMaLength: 14,
  rsiBbMult: 2,
  macdFast: 12,
  macdSlow: 26,
  macdSignal: 9,
  bbPeriod: 20,
  bbStdDev: 2,
  stochK: 14,
  stochD: 3,
  stochSmooth: 3,
  srsiK: 3,
  srsiD: 3,
  srsiRsiLen: 14,
  srsiStochLen: 14,
  vwapHideOnDWM: false,
  vwapAnchor: "session",
  vwapSource: "hlc3",
  vwapOffset: 0,
  vwapBandsMode: "stdev",
  vwapShowBand1: true,
  vwapMult1: 1,
  vwapShowBand2: false,
  vwapMult2: 2,
  vwapShowBand3: false,
  vwapMult3: 3,
  wtChannelLen: 9,
  wtAverageLen: 12,
  wtMALen: 3,
  mfiPeriod: 60,
  mfiMultiplier: 600,
  cipherStochLen: 14,
  cipherStochRsiLen: 14,
  cipherStochSmoothK: 3,
  cipherStochSmoothD: 3,
  wtObLevel: 53,
  wtObLevel2: 60,
  wtObLevel3: 100,
  wtOsLevel: -53,
  wtOsLevel2: -60,
  wtOsLevel3: -75,
  cipherMfiYPos: 2.5,
  cipherRsiLen: 14,
  cipherRsiOversold: 30,
  cipherRsiOverbought: 60,
  cipherStochUseLog: true,
  cipherStochUseAvg: false,
  cipherShowWaveTrend: true,
  cipherShowBuyDots: true,
  cipherShowGoldDots: true,
  cipherShowSellDots: true,
  cipherShowCrossDots: true,
  cipherShowFastWT: true,
  cipherShowMFI: true,
  cipherShowRSI: true,
  cipherShowStochRSI: false,
  cipherShowDivDots: true,
  cipherShowWTDivergences: true,
  cipherShowWTDivergencesHidden: false,
  cipherShowWTDivergences2: true,
  cipherShowRSIDivergences: false,
  cipherShowRSIDivergencesHidden: false,
  cipherShowStochDivergences: false,
  cipherShowStochDivergencesHidden: false,
  cipherNotApplyOBOSOnHidden: true,
  cipherWtDivOBLevel: 45,
  cipherWtDivOSLevel: -65,
  cipherWtDivOBLevel2: 15,
  cipherWtDivOSLevel2: -40,
  cipherRsiDivOBLevel: 60,
  cipherRsiDivOSLevel: 30,
  cipherShowSchaff: false,
  cipherSchaffLength: 10,
  cipherSchaffFast: 23,
  cipherSchaffSlow: 50,
  cipherSchaffFactor: 0.5,
  cipherShowSommiFlag: false,
  cipherShowSommiFastWave: false,
  cipherSommiVwapTF: "12h",
  cipherSommiVwapBearLevel: 0,
  cipherSommiVwapBullLevel: 0,
  cipherSommiFlagWTBearLevel: 0,
  cipherSommiFlagWTBullLevel: 0,
  cipherSommiRSIMFIBearLevel: 0,
  cipherSommiRSIMFIBullLevel: 0,
  cipherShowSommiDiamond: false,
  cipherSommiHTCRes: "1h",
  cipherSommiHTCRes2: "4h",
  cipherSommiDiamondWTBearLevel: 0,
  cipherSommiDiamondWTBullLevel: 0,
  cipherShowMacdColors: false,
  cipherMacdColorsTF: "4h",
  alligatorMandibula: 13,
  alligatorMandibulaDesp: 8,
  alligatorDientes: 8,
  alligatorDientesDesp: 5,
  alligatorLabios: 5,
  alligatorLabiosDesp: 3,
  demaLength: 20,
  keltnerLength: 20,
  keltnerMult: 2,
  keltnerAtrLength: 10,
  keltnerUseEma: true,
  keltnerFill: true,
  sarStart: 0.02,
  sarInc: 0.02,
  sarMax: 0.2,
  supertrendAtr: 10,
  supertrendFactor: 3,
  aoFast: 5,
  aoSlow: 34,
  atrLength: 14,
  atrSmoothing: "RMA",
  aroonLength: 14,
  adrLength: 14,
  obvSmoothType: "None",
  obvSmoothLength: 20,
};

export const INDICATOR_COLORS: Record<IndicatorKey, string> = {
  medias: "#ffb74d",
  rsi: "#ab47bc",
  macd: "#2962ff",
  volume: "#787b86",
  bb: "#42a5f5",
  stoch: "#ec407a",
  vwap: "#2962ff", // Pine: plot(vwapValue, color = #2962FF)
  cipher: "#4994ec",
  gli: "#f59e0b",
  srsi: "#2962ff",
  alligator: "#2962ff",
  dema: "#ff6d00",
  keltner: "#26a69a",
  sar: "#2962ff",
  supertrend: "#26a69a",
  ao: "#26a69a",
  atr: "#b2b5be",
  aroon: "#ff6d00",
  adr: "#9c27b0",
  obv: "#2962ff",
};

/** Perpetuos que se agregan a todo watchlist (también a los ya guardados). */
export const DEFAULT_FUTURES = ["BINF:BTCUSDT", "BINF:ETHUSDT"];

/**
 * Indicadores que se dibujan en su propio panel debajo del gráfico del
 * activo (el resto son superposiciones sobre las velas).
 */
export const INDICADORES_CON_PANEL: IndicatorKey[] = [
  "rsi",
  "macd",
  "stoch",
  "cipher",
  "srsi",
  "ao",
  "atr",
  "aroon",
  "adr",
  "obv",
];

/**
 * Máximo de paneles de indicadores simultáneos. Con cuatro ya quedan
 * angostos, pero con la opción de maximizar uno se puede trabajar; más que
 * eso no se lee.
 */
export const MAX_PANELES_INDICADOR = 4;

/** Cuántos paneles de indicadores hay prendidos. */
export function panelesActivos(ind: Record<IndicatorKey, boolean>): number {
  return INDICADORES_CON_PANEL.filter((k) => ind[k]).length;
}

export const DEFAULT_WATCHLIST = [
  "BIN:BTCUSDT",
  "BIN:ETHUSDT",
  ...DEFAULT_FUTURES,
  "BIN:SOLUSDT",
  "BIN:BNBUSDT",
  "BIN:XRPUSDT",
  "BIN:DOGEUSDT",
  "BIN:ADAUSDT",
  "BIN:AVAXUSDT",
  "BIN:LINKUSDT",
  "BIN:MATICUSDT",
];

/**
 * Lista inicial de bolsa: unas pocas acciones grandes y los ETFs con los
 * que se siguen las materias primas (oro, plata, petróleo, gas) y los
 * índices, que es la forma de verlas sin pagar datos de futuros.
 */
export const LISTA_BOLSA = [
  "ALP:SPY",
  "ALP:QQQ",
  "ALP:AAPL",
  "ALP:MSFT",
  "ALP:NVDA",
  "ALP:AMZN",
  "ALP:GOOGL",
  "ALP:TSLA",
  "ALP:GLD",
  "ALP:SLV",
  "ALP:USO",
  "ALP:UNG",
];

export const ID_LISTA_BOLSA = "bolsa";
export const NOMBRE_LISTA_BOLSA = "Bolsa y ETFs";

/** Una lista de activos guardada, con su nombre. */
export interface ListaActivos {
  id: string;
  nombre: string;
  simbolos: string[];
}

export const ID_LISTA_INICIAL = "principal";
export const NOMBRE_LISTA_INICIAL = "Mi lista";
/** Tope de listas, para que el menú no se vuelva inmanejable. */
export const MAX_LISTAS = 20;

function nuevoId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `l${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

/** Add a prefix to symbols that came from older versions without one. */
function migrateSymbol(s: string): string {
  if (typeof s !== "string") return "BIN:BTCUSDT";
  return s.includes(":") ? s : `BIN:${s}`;
}

/**
 * Nombre único dentro del conjunto: "Mi lista" ya usada pasa a ser
 * "Mi lista (2)". Sin esto dos listas distintas se ven igual en el menú.
 */
export function nombreLibre(listas: ListaActivos[], deseado: string): string {
  const base = deseado.trim().slice(0, 40) || "Lista";
  const usados = new Set(listas.map((l) => l.nombre.toLowerCase()));
  if (!usados.has(base.toLowerCase())) return base;
  for (let i = 2; i < 100; i++) {
    const intento = `${base} (${i})`;
    if (!usados.has(intento.toLowerCase())) return intento;
  }
  return `${base} ${nuevoId().slice(0, 4)}`;
}

/**
 * Un gráfico de la pantalla. Con la vista de 2, 3 o 4 gráficos, cada uno
 * tiene **su** activo, **su** temporalidad y **sus** indicadores: se puede
 * mirar BTC con el Supertrend al lado de ETH con medias nada más.
 */
export interface Grafico {
  id: string;
  symbol: string;
  timeframe: Timeframe;
  /** Indicator is added to the chart (appears in pill + renders unless hidden) */
  indicators: Record<IndicatorKey, boolean>;
  /** Indicator is hidden (eye icon off) — kept in pill list, just not rendered */
  hidden: Record<IndicatorKey, boolean>;
  /** Periods and parameters for each indicator */
  config: IndicatorConfig;
  /** Líneas del indicador de medias móviles, en el orden en que se dibujan. */
  medias: MediaMovil[];
}

/**
 * Cómo se reparten los gráficos en la pantalla:
 *  · 1  — uno solo, como siempre
 *  · 2v — dos, lado a lado
 *  · 2h — dos, uno arriba del otro
 *  · 3  — uno grande arriba y dos abajo
 *  · 4  — cuatro en grilla
 */
export type Distribucion = "1" | "2v" | "2h" | "3" | "4";

export const DISTRIBUCIONES: Array<{ id: Distribucion; etiqueta: string }> = [
  { id: "1", etiqueta: "1 gráfico" },
  { id: "2v", etiqueta: "2 lado a lado" },
  { id: "2h", etiqueta: "2 arriba y abajo" },
  { id: "3", etiqueta: "3 gráficos" },
  { id: "4", etiqueta: "4 en grilla" },
];

export const GRAFICOS_DE: Record<Distribucion, number> = {
  "1": 1,
  "2v": 2,
  "2h": 2,
  "3": 3,
  "4": 4,
};

export const MAX_GRAFICOS = 4;

/**
 * Reproducción barra por barra ("replay"): el gráfico oculta todo lo que
 * pasó después de cierta vela y avanza de a una, recalculando los
 * indicadores con lo que se sabía hasta ese momento. Sirve para practicar
 * sin ver el futuro.
 *
 * Es estado de pantalla, no se guarda: al recargar la app se vuelve al
 * gráfico normal.
 */
export interface EstadoReplay {
  /** Gráfico que está en replay (los demás siguen en vivo). */
  graficoId: string;
  /** Vela en la que está parado. null mientras se elige dónde empezar. */
  indice: number | null;
  /** Cuántas velas tiene el gráfico en total. */
  total: number;
  reproduciendo: boolean;
  /** Velas por segundo. */
  velocidad: number;
}

export const VELOCIDADES_REPLAY = [0.5, 1, 2, 5, 10];

/**
 * Un juego de indicadores guardado con nombre, para aplicarlo a cualquier
 * gráfico. Guarda exactamente lo mismo que define a un gráfico menos el
 * activo y la temporalidad: qué indicadores están puestos, cuáles con el
 * ojo apagado, toda la configuración y la lista de medias.
 */
export interface PlantillaIndicadores {
  id: string;
  nombre: string;
  indicators: Record<IndicatorKey, boolean>;
  hidden: Record<IndicatorKey, boolean>;
  config: IndicatorConfig;
  medias: MediaMovil[];
}

/** Tope de plantillas, para que el menú siga siendo usable. */
export const MAX_PLANTILLAS = 20;

/** Activos con los que se estrena cada gráfico nuevo, en orden. */
const SIMBOLOS_INICIALES = [
  "BIN:BTCUSDT",
  "BIN:ETHUSDT",
  "BIN:SOLUSDT",
  "BIN:BNBUSDT",
];

export interface ChartState {
  /** Los gráficos abiertos (entre 1 y 4). */
  graficos: Grafico[];
  /** El gráfico que recibe lo que se hace en la barra de arriba. */
  graficoActivoId: string;
  /** Cómo se reparten en la pantalla. */
  distribucion: Distribucion;
  /** Listas de activos guardadas, en el orden en que se muestran. */
  listas: ListaActivos[];
  /** Id de la lista que se está viendo en el panel derecho. */
  listaActivaId: string;
  /** Panel derecho (watchlist) plegado para dar más ancho al chart */
  watchlistCollapsed: boolean;
  /** Mostrar el nombre del activo debajo del ticker en la lista. */
  mostrarNombres: boolean;
  /** Zona horaria de las etiquetas del chart ("utc", "local" o un id IANA). */
  timezone: ChartTimezone;
  /** Cuántas velas de historia se piden por gráfico (1.000 a 10.000). */
  velasHistoria: number;
  /** Juegos de indicadores guardados con nombre. */
  plantillas: PlantillaIndicadores[];
  /** Dibujos por activo: una línea puesta en BTC se ve en todos los
   * gráficos que muestren BTC, y en cualquier temporalidad. */
  dibujos: Record<string, Dibujo[]>;
  /** Dibujo seleccionado (para editarlo). No se guarda. */
  dibujoSeleccionado: string | null;
  /** Activo cuyo dibujo seleccionado tiene abierto el diálogo de edición. */
  dibujoEnDialogo: string | null;
  /** Alertas de precio e indicador. */
  alertas: Alerta[];
  /** Las últimas veces que saltó alguna, de la más nueva a la más vieja. */
  disparos: Disparo[];
  /** Marca de que ya se sembraron los perpetuos en un watchlist viejo. */
  futuresSeeded: boolean;
  /** Marca de que ya se agregó la lista de bolsa a un estado guardado. */
  bolsaSeeded: boolean;

  // Ephemeral UI state (not persisted)
  tool: DrawingTool;
  priceLines: PriceLine[];
  symbolDialogOpen: boolean;
  /** Se incrementa para forzar una recarga de datos del chart. */
  refreshNonce: number;
  /** El chart está pidiendo datos (para el spinner del botón). */
  chartLoading: boolean;
  /** Qué indicador de qué gráfico tiene abierto el diálogo (null = cerrado) */
  settingsTarget: { grafico: string; key: IndicatorKey } | null;
  /** Reproducción barra por barra, o null si no hay ninguna. */
  replay: EstadoReplay | null;

  // Actions. Las que tocan un gráfico aceptan su id; sin id, van al activo.
  setSymbol: (s: string, grafico?: string) => void;
  setTimeframe: (t: Timeframe, grafico?: string) => void;
  toggleIndicator: (key: IndicatorKey, grafico?: string) => void;
  removeIndicator: (key: IndicatorKey, grafico?: string) => void;
  toggleHidden: (key: IndicatorKey, grafico?: string) => void;
  setConfig: (patch: Partial<IndicatorConfig>, grafico?: string) => void;
  agregarMedia: (periodo: number, grafico?: string) => void;
  editarMedia: (id: string, patch: Partial<MediaMovil>, grafico?: string) => void;
  quitarMedia: (id: string, grafico?: string) => void;
  /** Cambia la distribución, creando o guardando gráficos según haga falta. */
  setDistribucion: (d: Distribucion) => void;
  /** Marca cuál recibe lo que se hace en la barra de arriba. */
  activarGrafico: (id: string) => void;
  /** Agrega a la lista activa, o a `listaId` si se pasa. */
  addToWatchlist: (s: string, listaId?: string) => void;
  /** Quita de la lista activa, o de `listaId` si se pasa. */
  removeFromWatchlist: (s: string, listaId?: string) => void;
  crearLista: (nombre: string, simbolos?: string[]) => void;
  renombrarLista: (id: string, nombre: string) => void;
  duplicarLista: (id: string) => void;
  eliminarLista: (id: string) => void;
  seleccionarLista: (id: string) => void;
  setTool: (t: DrawingTool) => void;
  addPriceLine: (price: number, symbol: string) => void;
  clearPriceLines: (symbol?: string) => void;
  setSymbolDialogOpen: (v: boolean) => void;
  toggleWatchlistCollapsed: () => void;
  toggleMostrarNombres: () => void;
  setTimezone: (tz: ChartTimezone) => void;
  setVelasHistoria: (n: number) => void;
  /** Guarda los indicadores de un gráfico como plantilla. */
  guardarPlantilla: (nombre: string, grafico?: string) => void;
  /** Vuelca una plantilla sobre un gráfico. */
  aplicarPlantilla: (id: string, grafico?: string) => void;
  renombrarPlantilla: (id: string, nombre: string) => void;
  borrarPlantilla: (id: string) => void;
  /** Agrega un dibujo al activo y lo deja seleccionado. */
  agregarDibujo: (simbolo: string, tipo: TipoDibujo, puntos: PuntoDibujo[]) => void;
  editarDibujo: (simbolo: string, id: string, patch: Partial<Dibujo>) => void;
  borrarDibujo: (simbolo: string, id: string) => void;
  /** Borra todos los dibujos de un activo. */
  borrarDibujosDe: (simbolo: string) => void;
  duplicarDibujo: (simbolo: string, id: string) => void;
  seleccionarDibujo: (id: string | null) => void;
  /** Abre (con el símbolo) o cierra (null) el diálogo de edición. */
  setDibujoEnDialogo: (simbolo: string | null) => void;
  crearAlerta: (a: Omit<Alerta, "id" | "creada">) => void;
  editarAlerta: (id: string, patch: Partial<Alerta>) => void;
  borrarAlerta: (id: string) => void;
  /** Registra que una alerta saltó (y la apaga si era de una sola vez). */
  registrarDisparo: (alertaId: string, texto: string) => void;
  limpiarDisparos: () => void;
  refreshChart: () => void;
  setChartLoading: (v: boolean) => void;
  setSettingsTarget: (k: IndicatorKey | null, grafico?: string) => void;
  /** Entra en replay en un gráfico, a la espera de que se elija la vela. */
  iniciarReplay: (grafico?: string) => void;
  /** El gráfico avisa cuántas velas tiene. */
  totalReplay: (total: number) => void;
  /** Se eligió la vela de arranque (índice dentro de la serie). */
  elegirIndiceReplay: (indice: number) => void;
  /** Adelanta o retrocede velas. */
  avanzarReplay: (n: number) => void;
  reproducirReplay: (v: boolean) => void;
  velocidadReplay: (v: number) => void;
  salirReplay: () => void;
}

/** Indicadores apagados, uno por clave. */
function indicadoresVacios(): Record<IndicatorKey, boolean> {
  return {
    medias: false,
    rsi: false,
    macd: false,
    volume: false,
    bb: false,
    stoch: false,
    vwap: false,
    cipher: false,
    gli: false,
    srsi: false,
    alligator: false,
    dema: false,
    keltner: false,
    sar: false,
    supertrend: false,
    ao: false,
    atr: false,
    aroon: false,
    adr: false,
    obv: false,
  };
}

/** Un gráfico recién abierto: lo mismo que veía la app de un solo gráfico. */
export function graficoNuevo(symbol: string, timeframe: Timeframe = "15m" as Timeframe): Grafico {
  return {
    id: nuevoId(),
    symbol,
    timeframe,
    indicators: { ...indicadoresVacios(), medias: true, rsi: true, volume: true },
    hidden: indicadoresVacios(),
    config: { ...DEFAULT_CONFIG },
    medias: mediasPorDefecto(),
  };
}

/**
 * Deja un gráfico guardado en condiciones de usarse: completa las claves que
 * no existían en versiones viejas, migra las tres EMA sueltas a la lista de
 * medias y respeta el tope de paneles.
 *
 * Toda esta migración vivía dentro de `merge` cuando había un solo gráfico;
 * ahora hay hasta cuatro, así que se aplica a cada uno.
 */
function sanearGrafico(
  crudo: unknown,
  indice: number,
  stripNullish: <T extends object>(o: T | undefined) => Partial<T>,
): Grafico {
  const g = (crudo ?? {}) as Record<string, unknown>;
  const base = graficoNuevo(SIMBOLOS_INICIALES[indice] ?? SIMBOLOS_INICIALES[0]);

  // Medias móviles: antes eran tres indicadores sueltos (ema20/50/200) con su
  // período en el config. Se convierten en la lista nueva una sola vez,
  // conservando períodos y ojos apagados.
  const viejoConfig = (g.config ?? {}) as Record<string, unknown>;
  const viejoInd = (g.indicators ?? {}) as Record<string, unknown>;
  const viejoOcu = (g.hidden ?? {}) as Record<string, unknown>;
  const migracion = migrarMedias({
    periodos: {
      ema20: viejoConfig.ema20,
      ema50: viejoConfig.ema50,
      ema200: viejoConfig.ema200,
    },
    prendidos: {
      ema20: viejoInd.ema20,
      ema50: viejoInd.ema50,
      ema200: viejoInd.ema200,
    },
    ocultos: {
      ema20: viejoOcu.ema20,
      ema50: viejoOcu.ema50,
      ema200: viejoOcu.ema200,
    },
  });
  const medias = sanearMedias(g.medias) ?? migracion.medias;
  const mediasPrendidas =
    typeof viejoInd.medias === "boolean" ? viejoInd.medias : migracion.prendido;

  // Prendidos, con el tope de paneles respetado. Un estado guardado puede
  // traer más osciladores que paneles disponibles (otra pestaña, o una
  // versión con otro tope): sin esto quedan prendidos en el menú pero sin
  // dibujar nada ni chapa, que es imposible de entender. Se apagan los que
  // sobran, los últimos de la lista primero.
  const indicators = {
    ...base.indicators,
    ...stripNullish(g.indicators as Record<IndicatorKey, boolean> | undefined),
    medias: mediasPrendidas,
  } as Record<IndicatorKey, boolean>;
  let conPanel = 0;
  for (const k of INDICADORES_CON_PANEL) {
    if (!indicators[k]) continue;
    conPanel++;
    if (conPanel > MAX_PANELES_INDICADOR) indicators[k] = false;
  }

  return {
    id: typeof g.id === "string" && g.id ? g.id : base.id,
    // Símbolos sin prefijo venían de antes de Bitget → "BIN:..."
    symbol: typeof g.symbol === "string" ? migrateSymbol(g.symbol) : base.symbol,
    timeframe: (typeof g.timeframe === "string" ? g.timeframe : base.timeframe) as Timeframe,
    indicators,
    hidden: {
      ...base.hidden,
      ...stripNullish(g.hidden as Record<IndicatorKey, boolean> | undefined),
    },
    config: { ...DEFAULT_CONFIG, ...stripNullish(g.config as IndicatorConfig | undefined) },
    medias,
  };
}

/**
 * Aplica un cambio a UN gráfico: el que se pasa por id, o el activo. El
 * parche devuelve solo los campos que cambian, o `null` para no tocar nada.
 *
 * Está acá y no repetido en cada acción porque son doce acciones que hacen
 * exactamente lo mismo: encontrar el gráfico y reemplazarlo en la lista.
 */
function tocar(
  set: (fn: (s: ChartState) => Partial<ChartState>) => void,
  id: string | undefined,
  parche: (g: Grafico) => Partial<Grafico> | null,
) {
  set((s) => {
    const destino = id ?? s.graficoActivoId;
    const actual = s.graficos.find((g) => g.id === destino) ?? s.graficos[0];
    if (!actual) return {};
    const cambios = parche(actual);
    if (!cambios) return {};
    return {
      graficos: s.graficos.map((g) => (g.id === actual.id ? { ...g, ...cambios } : g)),
    };
  });
}

export const useChartStore = create<ChartState>()(
  persist(
    (set) => ({
      graficos: [graficoNuevo(SIMBOLOS_INICIALES[0])],
      graficoActivoId: "",
      distribucion: "1" as Distribucion,
      listas: [
        {
          id: ID_LISTA_INICIAL,
          nombre: NOMBRE_LISTA_INICIAL,
          simbolos: DEFAULT_WATCHLIST,
        },
        {
          id: ID_LISTA_BOLSA,
          nombre: NOMBRE_LISTA_BOLSA,
          simbolos: LISTA_BOLSA,
        },
      ],
      listaActivaId: ID_LISTA_INICIAL,
      watchlistCollapsed: false,
      mostrarNombres: true,
      futuresSeeded: true,
      bolsaSeeded: true,
      timezone: ZONA_POR_DEFECTO,
      velasHistoria: HISTORIA_POR_DEFECTO,
      plantillas: [],
      dibujos: {},
      dibujoSeleccionado: null,
      dibujoEnDialogo: null,
      alertas: [],
      disparos: [],
      tool: "cursor",
      priceLines: [],
      symbolDialogOpen: false,
      refreshNonce: 0,
      chartLoading: false,
      settingsTarget: null,
      replay: null,

      setSymbol: (symbol, grafico) =>
        tocar(set, grafico, () => ({ symbol: migrateSymbol(symbol) })),
      setTimeframe: (timeframe, grafico) => tocar(set, grafico, () => ({ timeframe })),
      toggleIndicator: (key, grafico) =>
        tocar(set, grafico, (g) => {
          const prendiendo = !g.indicators[key];
          // Tope de paneles: no se pueden tener más de
          // MAX_PANELES_INDICADOR osciladores abiertos a la vez.
          if (
            prendiendo &&
            INDICADORES_CON_PANEL.includes(key) &&
            panelesActivos(g.indicators) >= MAX_PANELES_INDICADOR
          ) {
            return null;
          }
          return {
            indicators: { ...g.indicators, [key]: prendiendo },
            // When re-adding, ensure not hidden
            hidden: prendiendo ? { ...g.hidden, [key]: false } : g.hidden,
          };
        }),
      removeIndicator: (key, grafico) =>
        tocar(set, grafico, (g) => ({
          indicators: { ...g.indicators, [key]: false },
          hidden: { ...g.hidden, [key]: false },
        })),
      toggleHidden: (key, grafico) =>
        tocar(set, grafico, (g) => ({ hidden: { ...g.hidden, [key]: !g.hidden[key] } })),
      setConfig: (patch, grafico) =>
        tocar(set, grafico, (g) => ({ config: { ...g.config, ...patch } })),
      agregarMedia: (periodo, grafico) =>
        tocar(set, grafico, (g) => {
          if (g.medias.length >= MAX_MEDIAS) return null;
          const media = nuevaMedia(
            periodo,
            g.medias.map((m) => m.color),
          );
          // Se agrega al final y NO se reordena: si la lista se reacomoda
          // sola, al escribir un período la fila se mueve y el cursor salta
          // a otra — es justo lo que pasaba.
          return {
            medias: [...g.medias, media],
            indicators: { ...g.indicators, medias: true },
          };
        }),
      editarMedia: (id, patch, grafico) =>
        tocar(set, grafico, (g) => ({
          // Sin reordenar: la fila que se está editando tiene que quedarse
          // donde está mientras se escribe.
          medias: g.medias.map((m) => (m.id === id ? { ...m, ...patch } : m)),
        })),
      quitarMedia: (id, grafico) =>
        tocar(set, grafico, (g) => ({ medias: g.medias.filter((m) => m.id !== id) })),
      setDistribucion: (distribucion) =>
        set((state) => {
          const quiere = GRAFICOS_DE[distribucion];
          let graficos = state.graficos;
          // Al agrandar la vista se abren gráficos nuevos con activos que no
          // estén ya en pantalla; al achicarla NO se borran, quedan
          // guardados para cuando se vuelva a abrir.
          if (graficos.length < quiere) {
            const puestos = new Set(graficos.map((g) => g.symbol));
            const libres = [
              ...SIMBOLOS_INICIALES.filter((x) => !puestos.has(x)),
              ...SIMBOLOS_INICIALES,
            ];
            const extra = Array.from({ length: quiere - graficos.length }, (_, i) =>
              graficoNuevo(libres[i] ?? SIMBOLOS_INICIALES[0], graficos[0]?.timeframe),
            );
            graficos = [...graficos, ...extra];
          }
          const visibles = graficos.slice(0, quiere);
          return {
            distribucion,
            graficos,
            // Si el activo quedaba fuera de la vista nueva, pasa al primero.
            graficoActivoId: visibles.some((g) => g.id === state.graficoActivoId)
              ? state.graficoActivoId
              : visibles[0].id,
          };
        }),
      activarGrafico: (graficoActivoId) =>
        set((state) =>
          state.graficos.some((g) => g.id === graficoActivoId) ? { graficoActivoId } : {},
        ),
      addToWatchlist: (s, listaId) =>
        set((state) => {
          const qualified = migrateSymbol(s);
          const destino = listaId ?? state.listaActivaId;
          return {
            listas: state.listas.map((l) =>
              l.id !== destino || l.simbolos.includes(qualified)
                ? l
                : { ...l, simbolos: [...l.simbolos, qualified] },
            ),
          };
        }),
      removeFromWatchlist: (s, listaId) =>
        set((state) => {
          const qualified = migrateSymbol(s);
          const destino = listaId ?? state.listaActivaId;
          return {
            listas: state.listas.map((l) =>
              l.id !== destino
                ? l
                : { ...l, simbolos: l.simbolos.filter((x) => x !== qualified) },
            ),
          };
        }),
      crearLista: (nombre, simbolos = []) =>
        set((state) => {
          if (state.listas.length >= MAX_LISTAS) return {};
          const lista: ListaActivos = {
            id: nuevoId(),
            nombre: nombreLibre(state.listas, nombre),
            simbolos: simbolos.map(migrateSymbol),
          };
          return { listas: [...state.listas, lista], listaActivaId: lista.id };
        }),
      renombrarLista: (id, nombre) =>
        set((state) => ({
          listas: state.listas.map((l) =>
            l.id !== id
              ? l
              : {
                  ...l,
                  nombre: nombreLibre(
                    state.listas.filter((o) => o.id !== id),
                    nombre,
                  ),
                },
          ),
        })),
      duplicarLista: (id) =>
        set((state) => {
          const origen = state.listas.find((l) => l.id === id);
          if (!origen || state.listas.length >= MAX_LISTAS) return {};
          const copia: ListaActivos = {
            id: nuevoId(),
            nombre: nombreLibre(state.listas, origen.nombre),
            simbolos: [...origen.simbolos],
          };
          return { listas: [...state.listas, copia], listaActivaId: copia.id };
        }),
      eliminarLista: (id) =>
        set((state) => {
          // Nunca se queda sin ninguna: la última se vacía en vez de borrarse.
          if (state.listas.length <= 1) {
            return {
              listas: state.listas.map((l) =>
                l.id === id ? { ...l, simbolos: [] } : l,
              ),
            };
          }
          const listas = state.listas.filter((l) => l.id !== id);
          return {
            listas,
            listaActivaId:
              state.listaActivaId === id ? listas[0].id : state.listaActivaId,
          };
        }),
      seleccionarLista: (listaActivaId) =>
        set((state) =>
          state.listas.some((l) => l.id === listaActivaId)
            ? { listaActivaId }
            : {},
        ),
      setTool: (tool) => set({ tool }),
      addPriceLine: (price, symbol) =>
        set((state) => ({
          priceLines: [
            ...state.priceLines,
            {
              id:
                typeof crypto !== "undefined" && "randomUUID" in crypto
                  ? crypto.randomUUID()
                  : `${Date.now()}-${Math.random()}`,
              symbol,
              price,
            },
          ],
        })),
      clearPriceLines: (symbol) =>
        set((state) => ({
          priceLines: symbol
            ? state.priceLines.filter((p) => p.symbol !== symbol)
            : [],
        })),
      setSymbolDialogOpen: (symbolDialogOpen) => set({ symbolDialogOpen }),
      toggleWatchlistCollapsed: () =>
        set((s) => ({ watchlistCollapsed: !s.watchlistCollapsed })),
      toggleMostrarNombres: () =>
        set((s) => ({ mostrarNombres: !s.mostrarNombres })),
      setTimezone: (timezone) => set({ timezone }),
      guardarPlantilla: (nombre, grafico) =>
        set((state) => {
          if (state.plantillas.length >= MAX_PLANTILLAS) return {};
          const g =
            state.graficos.find((x) => x.id === (grafico ?? state.graficoActivoId)) ??
            state.graficos[0];
          if (!g) return {};
          const usados = state.plantillas.map((p) => p.nombre.toLowerCase());
          const base = nombre.trim().slice(0, 40) || "Plantilla";
          let libre = base;
          for (let i = 2; usados.includes(libre.toLowerCase()); i++) {
            libre = `${base} (${i})`;
          }
          return {
            plantillas: [
              ...state.plantillas,
              {
                id: nuevoId(),
                nombre: libre,
                // Copias, no referencias: después se edita el gráfico y la
                // plantilla tiene que quedarse como estaba.
                indicators: { ...g.indicators },
                hidden: { ...g.hidden },
                config: { ...g.config },
                medias: g.medias.map((m) => ({ ...m })),
              },
            ],
          };
        }),
      aplicarPlantilla: (id, grafico) =>
        set((state) => {
          const p = state.plantillas.find((x) => x.id === id);
          const destino = grafico ?? state.graficoActivoId;
          const g =
            state.graficos.find((x) => x.id === destino) ?? state.graficos[0];
          if (!p || !g) return {};
          // El activo y la temporalidad del gráfico NO se tocan: la
          // plantilla es solo el juego de indicadores.
          return {
            graficos: state.graficos.map((x) =>
              x.id === g.id
                ? {
                    ...x,
                    indicators: { ...p.indicators },
                    hidden: { ...p.hidden },
                    config: { ...p.config },
                    medias: p.medias.map((m) => ({ ...m })),
                  }
                : x,
            ),
          };
        }),
      renombrarPlantilla: (id, nombre) =>
        set((state) => ({
          plantillas: state.plantillas.map((p) =>
            p.id === id ? { ...p, nombre: nombre.trim().slice(0, 40) || p.nombre } : p,
          ),
        })),
      borrarPlantilla: (id) =>
        set((state) => ({ plantillas: state.plantillas.filter((p) => p.id !== id) })),
      agregarDibujo: (simbolo, tipo, puntos) =>
        set((state) => {
          const d = dibujoNuevo(nuevoId(), tipo, puntos);
          return {
            dibujos: {
              ...state.dibujos,
              [simbolo]: [...(state.dibujos[simbolo] ?? []), d],
            },
            dibujoSeleccionado: d.id,
          };
        }),
      editarDibujo: (simbolo, id, patch) =>
        set((state) => ({
          dibujos: {
            ...state.dibujos,
            [simbolo]: (state.dibujos[simbolo] ?? []).map((d) =>
              d.id === id ? { ...d, ...patch } : d,
            ),
          },
        })),
      borrarDibujo: (simbolo, id) =>
        set((state) => ({
          dibujos: {
            ...state.dibujos,
            [simbolo]: (state.dibujos[simbolo] ?? []).filter((d) => d.id !== id),
          },
          dibujoSeleccionado:
            state.dibujoSeleccionado === id ? null : state.dibujoSeleccionado,
        })),
      borrarDibujosDe: (simbolo) =>
        set((state) => ({
          dibujos: { ...state.dibujos, [simbolo]: [] },
          dibujoSeleccionado: null,
        })),
      duplicarDibujo: (simbolo, id) =>
        set((state) => {
          const orig = (state.dibujos[simbolo] ?? []).find((d) => d.id === id);
          if (!orig) return {};
          // La copia queda un poco corrida para que no tape al original.
          const corrimiento =
            orig.puntos.length > 1
              ? Math.abs(orig.puntos[1].time - orig.puntos[0].time) * 0.15
              : 0;
          const copia: Dibujo = {
            ...orig,
            id: nuevoId(),
            puntos: orig.puntos.map((p) => ({
              time: p.time + corrimiento,
              price: p.price,
            })),
            creado: Date.now(),
          };
          return {
            dibujos: {
              ...state.dibujos,
              [simbolo]: [...(state.dibujos[simbolo] ?? []), copia],
            },
            dibujoSeleccionado: copia.id,
          };
        }),
      seleccionarDibujo: (dibujoSeleccionado) => set({ dibujoSeleccionado }),
      setDibujoEnDialogo: (dibujoEnDialogo) => set({ dibujoEnDialogo }),
      crearAlerta: (a) =>
        set((state) => {
          if (state.alertas.length >= MAX_ALERTAS) return {};
          return {
            alertas: [
              ...state.alertas,
              { ...a, id: nuevoId(), creada: Date.now() },
            ],
          };
        }),
      editarAlerta: (id, patch) =>
        set((state) => ({
          alertas: state.alertas.map((x) => (x.id === id ? { ...x, ...patch } : x)),
        })),
      borrarAlerta: (id) =>
        set((state) => ({ alertas: state.alertas.filter((x) => x.id !== id) })),
      registrarDisparo: (alertaId, texto) =>
        set((state) => {
          const a = state.alertas.find((x) => x.id === alertaId);
          if (!a) return {};
          const cuando = Date.now();
          return {
            alertas: state.alertas.map((x) =>
              x.id !== alertaId
                ? x
                : // Una alerta de "una sola vez" se apaga sola: si no,
                  // seguiría sonando en cada vela mientras la condición
                  // se mantenga.
                  { ...x, ultimoDisparo: cuando, activa: x.unaVez ? false : x.activa },
            ),
            disparos: [
              { id: nuevoId(), alertaId, simbolo: a.simbolo, texto, cuando },
              ...state.disparos,
            ].slice(0, MAX_DISPAROS),
          };
        }),
      limpiarDisparos: () => set({ disparos: [] }),
      setVelasHistoria: (velasHistoria) =>
        set((s) => ({
          velasHistoria: OPCIONES_HISTORIA.includes(
            velasHistoria as (typeof OPCIONES_HISTORIA)[number],
          )
            ? velasHistoria
            : s.velasHistoria,
          // Hay que volver a pedir los datos: el cambio no se ve solo.
          refreshNonce: s.refreshNonce + 1,
        })),
      iniciarReplay: (grafico) =>
        set((state) => ({
          replay: {
            graficoId: grafico ?? state.graficoActivoId,
            indice: null,
            total: 0,
            reproduciendo: false,
            velocidad: 2,
          },
        })),
      totalReplay: (total) =>
        set((state) => (state.replay ? { replay: { ...state.replay, total } } : {})),
      elegirIndiceReplay: (indice) =>
        set((state) =>
          state.replay
            ? {
                replay: {
                  ...state.replay,
                  // Siempre quedan al menos unas velas a la izquierda: con
                  // dos no se puede calcular ningún indicador.
                  indice: Math.max(10, Math.min(state.replay.total - 1, indice)),
                },
              }
            : {},
        ),
      avanzarReplay: (n) =>
        set((state) => {
          const r = state.replay;
          if (!r || r.indice === null) return {};
          const siguiente = r.indice + n;
          // Al llegar al final se frena solo: seguir corriendo no agrega
          // nada y deja el botón de play encendido sin que pase nada.
          if (siguiente >= r.total - 1) {
            return { replay: { ...r, indice: r.total - 1, reproduciendo: false } };
          }
          return { replay: { ...r, indice: Math.max(10, siguiente) } };
        }),
      reproducirReplay: (reproduciendo) =>
        set((state) => (state.replay ? { replay: { ...state.replay, reproduciendo } } : {})),
      velocidadReplay: (velocidad) =>
        set((state) => (state.replay ? { replay: { ...state.replay, velocidad } } : {})),
      salirReplay: () => set({ replay: null }),
      refreshChart: () => set((s) => ({ refreshNonce: s.refreshNonce + 1 })),
      setChartLoading: (chartLoading) => set({ chartLoading }),
      setSettingsTarget: (key, grafico) =>
        set((state) => ({
          settingsTarget:
            key === null
              ? null
              : { grafico: grafico ?? state.graficoActivoId, key },
        })),
    }),
    {
      name: "tv-gratis-chart-state",
      partialize: (s) => ({
        graficos: s.graficos,
        graficoActivoId: s.graficoActivoId,
        distribucion: s.distribucion,
        listas: s.listas,
        listaActivaId: s.listaActivaId,
        watchlistCollapsed: s.watchlistCollapsed,
        mostrarNombres: s.mostrarNombres,
        futuresSeeded: s.futuresSeeded,
        bolsaSeeded: s.bolsaSeeded,
        timezone: s.timezone,
        velasHistoria: s.velasHistoria,
        plantillas: s.plantillas,
        alertas: s.alertas,
        disparos: s.disparos,
        dibujos: s.dibujos,
      }),
      // Deep-merge so config/indicators/hidden keys added in newer versions
      // get their defaults instead of staying undefined from older persisted state.
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<ChartState>;
        // Strip null/undefined values from persisted partials so DEFAULT_CONFIG
        // (and the current defaults for indicators/hidden) win for missing keys.
        const stripNullish = <T extends object>(o: T | undefined): Partial<T> =>
          Object.fromEntries(
            Object.entries(o ?? {}).filter(([, v]) => v !== null && v !== undefined),
          ) as Partial<T>;
        // Estado viejo: un solo watchlist sin nombre. Pasa a ser la primera
        // lista guardada, con los perpetuos sembrados si nunca lo estuvieron.
        const viejo = (p as { watchlist?: unknown }).watchlist;
        const persistedList = Array.isArray(viejo)
          ? (viejo as string[]).map(migrateSymbol)
          : null;
        const needsFutures = persistedList !== null && !p.futuresSeeded;
        const migrada = persistedList
          ? needsFutures
            ? [
                ...persistedList,
                ...DEFAULT_FUTURES.filter((f) => !persistedList.includes(f)),
              ]
            : persistedList
          : null;

        const guardadas = Array.isArray(p.listas)
          ? p.listas
              .filter(
                (l): l is ListaActivos =>
                  !!l && typeof l.id === "string" && Array.isArray(l.simbolos),
              )
              .map((l) => ({
                id: l.id,
                nombre:
                  typeof l.nombre === "string" && l.nombre.trim()
                    ? l.nombre
                    : NOMBRE_LISTA_INICIAL,
                simbolos: l.simbolos.map(migrateSymbol),
              }))
          : [];

        let listas: ListaActivos[] =
          guardadas.length > 0
            ? guardadas
            : migrada
              ? [
                  {
                    id: ID_LISTA_INICIAL,
                    nombre: NOMBRE_LISTA_INICIAL,
                    simbolos: migrada,
                  },
                ]
              : current.listas;

        // A quien ya tenía listas guardadas se le agrega la de bolsa una
        // sola vez, igual que en su momento los perpetuos.
        if (!p.bolsaSeeded && !listas.some((l) => l.id === ID_LISTA_BOLSA)) {
          listas = [
            ...listas,
            {
              id: ID_LISTA_BOLSA,
              nombre: nombreLibre(listas, NOMBRE_LISTA_BOLSA),
              simbolos: LISTA_BOLSA,
            },
          ];
        }

        const listaActivaId = listas.some((l) => l.id === p.listaActivaId)
          ? (p.listaActivaId as string)
          : listas[0].id;

        // Gráficos. Hasta octubre de 2026 había uno solo y su estado vivía
        // suelto en la raíz (symbol, timeframe, indicators, hidden, config,
        // medias): eso se convierte en el gráfico 1 sin perder nada.
        const crudos: unknown[] = Array.isArray(p.graficos) && p.graficos.length > 0
          ? p.graficos
          : [
              {
                id: "g1",
                symbol: (p as Record<string, unknown>).symbol,
                timeframe: (p as Record<string, unknown>).timeframe,
                indicators: (p as Record<string, unknown>).indicators,
                hidden: (p as Record<string, unknown>).hidden,
                config: (p as Record<string, unknown>).config,
                medias: (p as Record<string, unknown>).medias,
              },
            ];

        const graficos = crudos
          .slice(0, MAX_GRAFICOS)
          .map((g, i) => sanearGrafico(g, i, stripNullish));

        const distribucion: Distribucion =
          typeof p.distribucion === "string" && p.distribucion in GRAFICOS_DE
            ? (p.distribucion as Distribucion)
            : "1";
        // Nunca menos gráficos que los que pide la distribución guardada.
        while (graficos.length < GRAFICOS_DE[distribucion]) {
          graficos.push(graficoNuevo(SIMBOLOS_INICIALES[graficos.length] ?? SIMBOLOS_INICIALES[0]));
        }
        // Plantillas guardadas: se las pasa por el mismo saneo que a un
        // gráfico, así una guardada antes de los indicadores nuevos no deja
        // claves sin definir.
        const plantillas: PlantillaIndicadores[] = (Array.isArray(p.plantillas)
          ? p.plantillas
          : []
        )
          .slice(0, MAX_PLANTILLAS)
          .map((pl, i) => {
            const g = sanearGrafico(pl, i, stripNullish);
            const crudo = (pl ?? {}) as unknown as Record<string, unknown>;
            return {
              id: typeof crudo.id === "string" && crudo.id ? crudo.id : g.id,
              nombre:
                typeof crudo.nombre === "string" && crudo.nombre.trim()
                  ? crudo.nombre
                  : `Plantilla ${i + 1}`,
              indicators: g.indicators,
              hidden: g.hidden,
              config: g.config,
              medias: g.medias,
            };
          });

        // Dibujos por activo. Las "líneas de precio" que antes eran una
        // lista aparte pasan a ser dibujos horizontales, así se pueden
        // editar y mover como todo lo demás.
        const dibujos: Record<string, Dibujo[]> = {};
        const guardadosDibujos = (p.dibujos ?? {}) as Record<string, unknown>;
        for (const [simbolo, lista] of Object.entries(guardadosDibujos)) {
          dibujos[migrateSymbol(simbolo)] = sanearDibujos(lista);
        }
        const lineasViejas = (p as { priceLines?: unknown }).priceLines;
        if (Array.isArray(lineasViejas)) {
          for (const l of lineasViejas as Array<{ symbol?: string; price?: number }>) {
            if (!l || typeof l.symbol !== "string" || !Number.isFinite(l.price)) {
              continue;
            }
            const sim = migrateSymbol(l.symbol);
            const d = dibujoNuevo(
              `hl-${sim}-${l.price}`,
              "horizontal",
              [{ time: 0, price: l.price as number }],
            );
            dibujos[sim] = [...(dibujos[sim] ?? []), d];
          }
        }

        const visibles = graficos.slice(0, GRAFICOS_DE[distribucion]);
        const graficoActivoId = visibles.some((g) => g.id === p.graficoActivoId)
          ? (p.graficoActivoId as string)
          : visibles[0].id;

        return {
          ...current,
          ...p,
          futuresSeeded: true,
          bolsaSeeded: true,
          // "utc" era el default viejo, no una eleccion del usuario: pasa a la
          // zona por defecto actual. Una zona elegida a mano se respeta.
          timezone:
            !p.timezone || p.timezone === "utc" ? current.timezone : p.timezone,
          listas,
          listaActivaId,
          graficos,
          graficoActivoId,
          distribucion,
          plantillas,
          dibujos,
          // Lo guardado puede venir de una versión anterior: se filtra lo
          // que no tenga forma de alerta en vez de confiar.
          alertas: (Array.isArray(p.alertas) ? p.alertas : [])
            .filter(
              (a): a is Alerta =>
                !!a && typeof a.id === "string" && typeof a.simbolo === "string",
            )
            .slice(0, MAX_ALERTAS),
          disparos: (Array.isArray(p.disparos) ? p.disparos : [])
            .filter(
              (d): d is Disparo =>
                !!d && typeof d.id === "string" && typeof d.texto === "string",
            )
            .slice(0, MAX_DISPAROS),
        };
      },
    },
  ),
);

/**
 * El gráfico que recibe lo que se hace en la barra de arriba (activo,
 * temporalidad, indicadores). Siempre devuelve uno.
 */
export function graficoActivo(s: ChartState): Grafico {
  return s.graficos.find((g) => g.id === s.graficoActivoId) ?? s.graficos[0];
}

/** Un gráfico por id, cayendo en el activo si ese id ya no existe. */
export function graficoPorId(s: ChartState, id?: string): Grafico {
  if (!id) return graficoActivo(s);
  return s.graficos.find((g) => g.id === id) ?? graficoActivo(s);
}

/** Los gráficos que se están viendo, según la distribución elegida. */
export function graficosVisibles(s: ChartState): Grafico[] {
  return s.graficos.slice(0, GRAFICOS_DE[s.distribucion]);
}

/**
 * La lista que se está viendo. Siempre devuelve una: si el id guardado no
 * existe (una lista borrada en otra pestaña) cae en la primera.
 */
export function listaActivaDe(s: ChartState): ListaActivos {
  return s.listas.find((l) => l.id === s.listaActivaId) ?? s.listas[0];
}

/** Símbolos de la lista activa. Referencia estable para los selectores. */
export function simbolosActivosDe(s: ChartState): string[] {
  return listaActivaDe(s).simbolos;
}
