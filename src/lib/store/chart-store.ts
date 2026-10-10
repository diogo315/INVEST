"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Timeframe } from "@/lib/binance/types";
import { ZONA_POR_DEFECTO, type ChartTimezone } from "@/lib/chart/timezone";

export type IndicatorKey =
  | "ema20"
  | "ema50"
  | "ema200"
  | "rsi"
  | "macd"
  | "volume"
  | "bb"
  | "stoch"
  | "vwap"
  | "cipher"
  | "gli"
  | "srsi";

export type DrawingTool = "cursor" | "hline" | "measure" | "eraser";

export interface PriceLine {
  id: string;
  symbol: string;
  price: number;
}

export interface IndicatorConfig {
  ema20: number;
  ema50: number;
  ema200: number;
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
}

export const DEFAULT_CONFIG: IndicatorConfig = {
  ema20: 20,
  ema50: 50,
  ema200: 200,
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
};

export const INDICATOR_COLORS: Record<IndicatorKey, string> = {
  ema20: "#ffb74d",
  ema50: "#2962ff",
  ema200: "#ab47bc",
  rsi: "#ab47bc",
  macd: "#2962ff",
  volume: "#787b86",
  bb: "#42a5f5",
  stoch: "#ec407a",
  vwap: "#2962ff", // Pine: plot(vwapValue, color = #2962FF)
  cipher: "#4994ec",
  gli: "#f59e0b",
  srsi: "#2962ff",
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
];

/** Máximo de paneles de indicadores simultáneos. */
export const MAX_PANELES_INDICADOR = 3;

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

export interface ChartState {
  symbol: string;
  timeframe: Timeframe;
  /** Indicator is added to the chart (appears in pill + renders unless hidden) */
  indicators: Record<IndicatorKey, boolean>;
  /** Indicator is hidden (eye icon off) — kept in pill list, just not rendered */
  hidden: Record<IndicatorKey, boolean>;
  /** Periods and parameters for each indicator */
  config: IndicatorConfig;
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
  /** Which indicator's settings dialog is open (null = closed) */
  settingsTarget: IndicatorKey | null;

  // Actions
  setSymbol: (s: string) => void;
  setTimeframe: (t: Timeframe) => void;
  toggleIndicator: (key: IndicatorKey) => void;
  removeIndicator: (key: IndicatorKey) => void;
  toggleHidden: (key: IndicatorKey) => void;
  setConfig: (patch: Partial<IndicatorConfig>) => void;
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
  refreshChart: () => void;
  setChartLoading: (v: boolean) => void;
  setSettingsTarget: (k: IndicatorKey | null) => void;
}

export const useChartStore = create<ChartState>()(
  persist(
    (set) => ({
      symbol: "BIN:BTCUSDT",
      timeframe: "15m" as Timeframe,
      indicators: {
        ema20: true,
        ema50: true,
        ema200: false,
        rsi: true,
        macd: false,
        volume: true,
        bb: false,
        stoch: false,
        vwap: false,
        cipher: false,
        gli: false,
        srsi: false,
      },
      hidden: {
        ema20: false,
        ema50: false,
        ema200: false,
        rsi: false,
        macd: false,
        volume: false,
        bb: false,
        stoch: false,
        vwap: false,
        cipher: false,
        gli: false,
        srsi: false,
      },
      config: { ...DEFAULT_CONFIG },
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
      tool: "cursor",
      priceLines: [],
      symbolDialogOpen: false,
      refreshNonce: 0,
      chartLoading: false,
      settingsTarget: null,

      setSymbol: (symbol) => set({ symbol: migrateSymbol(symbol) }),
      setTimeframe: (timeframe) => set({ timeframe }),
      toggleIndicator: (key) =>
        set((s) => {
          const prendiendo = !s.indicators[key];
          // Tope de paneles: no se pueden tener más de
          // MAX_PANELES_INDICADOR osciladores abiertos a la vez.
          if (
            prendiendo &&
            INDICADORES_CON_PANEL.includes(key) &&
            panelesActivos(s.indicators) >= MAX_PANELES_INDICADOR
          ) {
            return {};
          }
          return {
            indicators: { ...s.indicators, [key]: prendiendo },
            // When re-adding, ensure not hidden
            hidden: prendiendo ? { ...s.hidden, [key]: false } : s.hidden,
          };
        }),
      removeIndicator: (key) =>
        set((s) => ({
          indicators: { ...s.indicators, [key]: false },
          hidden: { ...s.hidden, [key]: false },
        })),
      toggleHidden: (key) =>
        set((s) => ({ hidden: { ...s.hidden, [key]: !s.hidden[key] } })),
      setConfig: (patch) =>
        set((s) => ({ config: { ...s.config, ...patch } })),
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
      refreshChart: () => set((s) => ({ refreshNonce: s.refreshNonce + 1 })),
      setChartLoading: (chartLoading) => set({ chartLoading }),
      setSettingsTarget: (settingsTarget) => set({ settingsTarget }),
    }),
    {
      name: "tv-gratis-chart-state",
      partialize: (s) => ({
        symbol: s.symbol,
        timeframe: s.timeframe,
        indicators: s.indicators,
        hidden: s.hidden,
        config: s.config,
        listas: s.listas,
        listaActivaId: s.listaActivaId,
        watchlistCollapsed: s.watchlistCollapsed,
        mostrarNombres: s.mostrarNombres,
        futuresSeeded: s.futuresSeeded,
        bolsaSeeded: s.bolsaSeeded,
        timezone: s.timezone,
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

        return {
          ...current,
          ...p,
          futuresSeeded: true,
          bolsaSeeded: true,
          // "utc" era el default viejo, no una eleccion del usuario: pasa a la
          // zona por defecto actual. Una zona elegida a mano se respeta.
          timezone:
            !p.timezone || p.timezone === "utc" ? current.timezone : p.timezone,
          // Migrate legacy unprefixed symbols (pre-Bitget) → "BIN:..."
          symbol: p.symbol ? migrateSymbol(p.symbol) : current.symbol,
          listas,
          listaActivaId,
          config: { ...DEFAULT_CONFIG, ...stripNullish(p.config) },
          indicators: { ...current.indicators, ...stripNullish(p.indicators) },
          hidden: { ...current.hidden, ...stripNullish(p.hidden) },
        };
      },
    },
  ),
);

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
