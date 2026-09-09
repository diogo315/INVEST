"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Timeframe } from "@/lib/binance/types";

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
  vwapAnchor: string; // session | week | month | quarter | year
  vwapSource: string; // hlc3 | hl2 | hlcc4 | ohlc4 | close
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
  vwapAnchor: "session",
  vwapSource: "hlc3",
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

export const DEFAULT_WATCHLIST = [
  "BIN:BTCUSDT",
  "BIN:ETHUSDT",
  "BIN:SOLUSDT",
  "BIN:BNBUSDT",
  "BIN:XRPUSDT",
  "BIN:DOGEUSDT",
  "BIN:ADAUSDT",
  "BIN:AVAXUSDT",
  "BIN:LINKUSDT",
  "BIN:MATICUSDT",
];

/** Add a prefix to symbols that came from older versions without one. */
function migrateSymbol(s: string): string {
  if (typeof s !== "string") return "BIN:BTCUSDT";
  return s.includes(":") ? s : `BIN:${s}`;
}

interface ChartState {
  symbol: string;
  timeframe: Timeframe;
  /** Indicator is added to the chart (appears in pill + renders unless hidden) */
  indicators: Record<IndicatorKey, boolean>;
  /** Indicator is hidden (eye icon off) — kept in pill list, just not rendered */
  hidden: Record<IndicatorKey, boolean>;
  /** Periods and parameters for each indicator */
  config: IndicatorConfig;
  watchlist: string[];

  // Ephemeral UI state (not persisted)
  tool: DrawingTool;
  priceLines: PriceLine[];
  symbolDialogOpen: boolean;
  /** Which indicator's settings dialog is open (null = closed) */
  settingsTarget: IndicatorKey | null;

  // Actions
  setSymbol: (s: string) => void;
  setTimeframe: (t: Timeframe) => void;
  toggleIndicator: (key: IndicatorKey) => void;
  removeIndicator: (key: IndicatorKey) => void;
  toggleHidden: (key: IndicatorKey) => void;
  setConfig: (patch: Partial<IndicatorConfig>) => void;
  addToWatchlist: (s: string) => void;
  removeFromWatchlist: (s: string) => void;
  setTool: (t: DrawingTool) => void;
  addPriceLine: (price: number, symbol: string) => void;
  clearPriceLines: (symbol?: string) => void;
  setSymbolDialogOpen: (v: boolean) => void;
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
      watchlist: DEFAULT_WATCHLIST,
      tool: "cursor",
      priceLines: [],
      symbolDialogOpen: false,
      settingsTarget: null,

      setSymbol: (symbol) => set({ symbol: migrateSymbol(symbol) }),
      setTimeframe: (timeframe) => set({ timeframe }),
      toggleIndicator: (key) =>
        set((s) => ({
          indicators: { ...s.indicators, [key]: !s.indicators[key] },
          // When re-adding, ensure not hidden
          hidden: !s.indicators[key]
            ? { ...s.hidden, [key]: false }
            : s.hidden,
        })),
      removeIndicator: (key) =>
        set((s) => ({
          indicators: { ...s.indicators, [key]: false },
          hidden: { ...s.hidden, [key]: false },
        })),
      toggleHidden: (key) =>
        set((s) => ({ hidden: { ...s.hidden, [key]: !s.hidden[key] } })),
      setConfig: (patch) =>
        set((s) => ({ config: { ...s.config, ...patch } })),
      addToWatchlist: (s) =>
        set((state) => {
          const qualified = migrateSymbol(s);
          return {
            watchlist: state.watchlist.includes(qualified)
              ? state.watchlist
              : [...state.watchlist, qualified],
          };
        }),
      removeFromWatchlist: (s) =>
        set((state) => {
          const qualified = migrateSymbol(s);
          return {
            watchlist: state.watchlist.filter((x) => x !== qualified),
          };
        }),
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
        watchlist: s.watchlist,
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
        return {
          ...current,
          ...p,
          // Migrate legacy unprefixed symbols (pre-Bitget) → "BIN:..."
          symbol: p.symbol ? migrateSymbol(p.symbol) : current.symbol,
          watchlist: Array.isArray(p.watchlist)
            ? p.watchlist.map(migrateSymbol)
            : current.watchlist,
          config: { ...DEFAULT_CONFIG, ...stripNullish(p.config) },
          indicators: { ...current.indicators, ...stripNullish(p.indicators) },
          hidden: { ...current.hidden, ...stripNullish(p.hidden) },
        };
      },
    },
  ),
);
