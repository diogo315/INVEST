"use client";

import { useEffect, useRef, useState } from "react";
import {
  createChart,
  createSeriesMarkers,
  CandlestickSeries,
  LineSeries,
  AreaSeries,
  BaselineSeries,
  HistogramSeries,
  CrosshairMode,
  type IChartApi,
  type ISeriesApi,
  type IPriceLine,
  type ISeriesMarkersPluginApi,
  type SeriesMarker,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import { fetchKlinesCached } from "@/lib/binance/multi-tf";
import { readCandleCache, writeCandleCache } from "@/lib/binance/candle-cache";
import { BandFill, ZoneGradientFill } from "@/lib/chart/band-fill";
import { SegmentsOverlay } from "@/lib/chart/segments";
import { tickMarkFormatter, timeFormatter } from "@/lib/chart/timezone";
import { getAdapter, parseSymbol } from "@/lib/exchanges";
import {
  ema,
  rsi,
  rsiDivergences,
  maOverPoints,
  stdevPoints,
  macd,
  bollinger,
  stochastic,
  vwapAnchored,
  wavetrend,
  mfiArea,
  stochRsi,
  schaffTC,
  heikinAshi,
  findDivergences,
  globalLiquidity,
  type DivergenceSegment,
  type IndicatorPoint,
  type VwapAnchor,
  type VwapBandsMode,
  type VwapSource,
  type MaType,
} from "@/lib/indicators";
import type { Candle, Timeframe } from "@/lib/binance/types";
import { TIMEFRAME_SECONDS } from "@/lib/binance/types";
import { reconnectAllBinanceWS } from "@/lib/binance/ws";
import {
  INDICATOR_COLORS,
  useChartStore,
  type IndicatorKey,
} from "@/lib/store/chart-store";
import { formatPrice, formatVolume } from "@/lib/format";
import { IndicatorPill } from "./IndicatorPill";
import { MeasureOverlay } from "./MeasureOverlay";

interface MeasurePoint {
  time: number;
  price: number;
}
interface MeasureState {
  phase: "idle" | "placing" | "done";
  a: MeasurePoint | null;
  b: MeasurePoint | null;
}
const INITIAL_MEASURE: MeasureState = { phase: "idle", a: null, b: null };

function durationLabel(aTime: number, bTime: number): string {
  const diff = Math.abs(bTime - aTime);
  const days = Math.floor(diff / 86400);
  const hours = Math.floor((diff % 86400) / 3600);
  const minutes = Math.floor((diff % 3600) / 60);
  if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  return `${minutes}m`;
}

interface Props {
  symbol: string;
  timeframe: Timeframe;
}

const TV_COLORS = {
  bg: "#000000",
  panel: "#1e222d",
  border: "#2a2e39",
  text: "#d1d4dc",
  textMuted: "#787b86",
  green: "#26a69a",
  red: "#ef5350",
  blue: "#2962ff",
  yellow: "#ffb74d",
  purple: "#ab47bc",
  grid: "#15171f",
};

// Colores de las bandas del VWAP — del Pine: green / olive / teal
const VWAP_BAND_COLORS = ["#4caf50", "#808000", "#008080"] as const;
// Pine: fill(..., color.new(<color>, 95)) — 95% transparente = alpha 0.05.
const VWAP_FILL_COLORS = [
  "rgba(76, 175, 80, 0.05)",
  "rgba(128, 128, 0, 0.05)",
  "rgba(0, 128, 128, 0.05)",
] as const;

// "1D o superior" del Pine (timeframe.isdwm): diario, semanal, mensual.
const DWM_TIMEFRAMES = new Set(["1d", "3d", "1w", "1M"]);

// Colores del RSI estándar de TradingView (Pine v6)
const RSI_COLORS = {
  ma: "#ffeb3b", // color.yellow
  bb: "#4caf50", // color.green
  bbFill: "rgba(76, 175, 80, 0.10)",
  bgFill: "rgba(126, 87, 194, 0.10)", // color.rgb(126, 87, 194, 90)
  bull: "#4caf50",
  bear: "#f23645",
};

const VWAP_ANCHOR_LABELS: Record<string, string> = {
  session: "Sesión",
  week: "Semana",
  month: "Mes",
  quarter: "Trimestre",
  year: "Año",
};

interface HoverInfo {
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
  time: number;
  pct: number;
}

interface LastValues {
  ema20?: number;
  ema50?: number;
  ema200?: number;
  rsi?: number;
  macd?: number;
  macdSignal?: number;
  macdHist?: number;
  volume?: number;
  bbUpper?: number;
  bbMiddle?: number;
  bbLower?: number;
  vwap?: number;
  vwapBands?: Array<[number, number]>;
  gli?: number;
  stochK?: number;
  stochD?: number;
  srsiK?: number;
  srsiD?: number;
  cipherWt1?: number;
  cipherWt2?: number;
  cipherMfi?: number;
  cipherStochK?: number;
  cipherStochD?: number;
}

interface PaneOffset {
  top: number;
  height: number;
}

export function PriceChart({ symbol, timeframe }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const ema20Ref = useRef<ISeriesApi<"Line"> | null>(null);
  const ema50Ref = useRef<ISeriesApi<"Line"> | null>(null);
  const ema200Ref = useRef<ISeriesApi<"Line"> | null>(null);
  const rsiRef = useRef<ISeriesApi<"Line"> | null>(null);
  const rsi30Ref = useRef<ISeriesApi<"Line"> | null>(null);
  const rsi70Ref = useRef<ISeriesApi<"Line"> | null>(null);
  const rsi50Ref = useRef<ISeriesApi<"Line"> | null>(null);
  const rsiMaRef = useRef<ISeriesApi<"Line"> | null>(null);
  const rsiBbUpRef = useRef<ISeriesApi<"Line"> | null>(null);
  const rsiBbLoRef = useRef<ISeriesApi<"Line"> | null>(null);
  // Primitives del pane de RSI: fondo 70-30, degradados de sobrecompra /
  // sobreventa, relleno de las Bollinger y los marcadores Bull / Bear.
  const rsiFillsRef = useRef<{
    bg: BandFill | null;
    ob: ZoneGradientFill | null;
    os: ZoneGradientFill | null;
    bb: BandFill | null;
    divs: SegmentsOverlay | null;
    markers: ISeriesMarkersPluginApi<Time> | null;
  }>({ bg: null, ob: null, os: null, bb: null, divs: null, markers: null });
  const macdRef = useRef<ISeriesApi<"Line"> | null>(null);
  const macdSignalRef = useRef<ISeriesApi<"Line"> | null>(null);
  const macdHistRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const bbUpperRef = useRef<ISeriesApi<"Line"> | null>(null);
  const bbMiddleRef = useRef<ISeriesApi<"Line"> | null>(null);
  const bbLowerRef = useRef<ISeriesApi<"Line"> | null>(null);
  const vwapRef = useRef<ISeriesApi<"Line"> | null>(null);
  // Bandas del VWAP: ±mult1 / ±mult2 / ±mult3, todas sobre el pane 0.
  // Van en un solo ref (no 6 sueltos) para que la identidad sea estable
  // entre renders y los efectos no las vean como dependencia nueva.
  const vwapBandsRef = useRef<{
    upper: Array<ISeriesApi<"Line"> | null>;
    lower: Array<ISeriesApi<"Line"> | null>;
    fills: Array<BandFill | null>;
  }>({
    upper: [null, null, null],
    lower: [null, null, null],
    fills: [null, null, null],
  });
  const gliRef = useRef<ISeriesApi<"Line"> | null>(null);
  const stochKRef = useRef<ISeriesApi<"Line"> | null>(null);
  const stochDRef = useRef<ISeriesApi<"Line"> | null>(null);
  const stoch20Ref = useRef<ISeriesApi<"Line"> | null>(null);
  const stoch80Ref = useRef<ISeriesApi<"Line"> | null>(null);
  // Stoch RSI estándar (TradingView) — pane propio, siempre el último
  const srsiKRef = useRef<ISeriesApi<"Line"> | null>(null);
  const srsiDRef = useRef<ISeriesApi<"Line"> | null>(null);
  const srsi20Ref = useRef<ISeriesApi<"Line"> | null>(null);
  const srsi50Ref = useRef<ISeriesApi<"Line"> | null>(null);
  const srsi80Ref = useRef<ISeriesApi<"Line"> | null>(null);
  // VuManChu Cipher B series — WT1/WT2 use BaselineSeries so the area
  // is filled relative to zero (so the wave appears both above and below 0).
  const cipherWt1Ref = useRef<ISeriesApi<"Baseline"> | null>(null);
  const cipherWt2Ref = useRef<ISeriesApi<"Baseline"> | null>(null);
  const cipherVwapRef = useRef<ISeriesApi<"Baseline"> | null>(null);
  const cipherMfiRef = useRef<ISeriesApi<"Baseline"> | null>(null);
  const cipherStochKRef = useRef<ISeriesApi<"Line"> | null>(null);
  const cipherStochDRef = useRef<ISeriesApi<"Line"> | null>(null);
  const cipherObRef = useRef<ISeriesApi<"Line"> | null>(null);
  const cipherOb2Ref = useRef<ISeriesApi<"Line"> | null>(null);
  const cipherOb3Ref = useRef<ISeriesApi<"Line"> | null>(null);
  const cipherOsRef = useRef<ISeriesApi<"Line"> | null>(null);
  const cipherOs2Ref = useRef<ISeriesApi<"Line"> | null>(null);
  const cipherOs3Ref = useRef<ISeriesApi<"Line"> | null>(null);
  const cipherZeroRef = useRef<ISeriesApi<"Line"> | null>(null);
  const cipherRsiRef = useRef<ISeriesApi<"Line"> | null>(null);
  const cipherStochFillRef = useRef<ISeriesApi<"Area"> | null>(null);
  // Divergence series — each one renders multiple discontinuous segments
  // (gaps via whitespace data points). Naming: <source><kind>DivRef.
  const wtBearDivRef = useRef<ISeriesApi<"Line"> | null>(null);
  const wtBullDivRef = useRef<ISeriesApi<"Line"> | null>(null);
  const wtBearHidDivRef = useRef<ISeriesApi<"Line"> | null>(null);
  const wtBullHidDivRef = useRef<ISeriesApi<"Line"> | null>(null);
  const wtBearDiv2Ref = useRef<ISeriesApi<"Line"> | null>(null);
  const wtBullDiv2Ref = useRef<ISeriesApi<"Line"> | null>(null);
  const rsiBearDivRef = useRef<ISeriesApi<"Line"> | null>(null);
  const rsiBullDivRef = useRef<ISeriesApi<"Line"> | null>(null);
  const rsiBearHidDivRef = useRef<ISeriesApi<"Line"> | null>(null);
  const rsiBullHidDivRef = useRef<ISeriesApi<"Line"> | null>(null);
  const stochBearDivRef = useRef<ISeriesApi<"Line"> | null>(null);
  const stochBullDivRef = useRef<ISeriesApi<"Line"> | null>(null);
  // Schaff Trend Cycle line
  const cipherSchaffRef = useRef<ISeriesApi<"Line"> | null>(null);
  // Sommi higher-timeframe VWAP line (smoothed)
  const cipherSommiHVwapRef = useRef<ISeriesApi<"Line"> | null>(null);
  // Multi-TF candle caches (Sommi flag uses sommiVwapTF, diamond uses HTCRes/HTCRes2, macd colors uses macdColorsTF)
  const multiTFCandlesRef = useRef<{
    sommiFlag: Candle[];
    sommiHTC1: Candle[];
    sommiHTC2: Candle[];
    macdColors: Candle[];
  }>({ sommiFlag: [], sommiHTC1: [], sommiHTC2: [], macdColors: [] });
  const [multiTFTick, setMultiTFTick] = useState(0);
  const cipherMarkersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const candlesRef = useRef<Candle[]>([]);
  const priceLinesMapRef = useRef<Map<string, IPriceLine>>(new Map());

  const indicators = useChartStore((s) => s.indicators);
  const hidden = useChartStore((s) => s.hidden);
  const config = useChartStore((s) => s.config);
  const tool = useChartStore((s) => s.tool);
  const priceLines = useChartStore((s) => s.priceLines);
  const addPriceLine = useChartStore((s) => s.addPriceLine);
  const removeIndicator = useChartStore((s) => s.removeIndicator);
  const toggleHidden = useChartStore((s) => s.toggleHidden);
  const setSettingsTarget = useChartStore((s) => s.setSettingsTarget);
  const timezone = useChartStore((s) => s.timezone);
  const refreshNonce = useChartStore((s) => s.refreshNonce);
  const refreshChart = useChartStore((s) => s.refreshChart);
  const setChartLoading = useChartStore((s) => s.setChartLoading);

  // Refs to avoid recreating subscribeClick on every tool change
  const toolRef = useRef(tool);
  toolRef.current = tool;
  const addPriceLineRef = useRef(addPriceLine);
  addPriceLineRef.current = addPriceLine;
  const symbolRef = useRef(symbol);
  symbolRef.current = symbol;
  const configRef = useRef(config);
  configRef.current = config;

  const [hover, setHover] = useState<HoverInfo | null>(null);
  const [lastPrice, setLastPrice] = useState<{ value: number; pct: number } | null>(null);
  const [lastValues, setLastValues] = useState<LastValues>({});
  const [paneOffsets, setPaneOffsets] = useState<PaneOffset[]>([]);
  const [measure, setMeasure] = useState<MeasureState>(INITIAL_MEASURE);
  const [renderTick, setRenderTick] = useState(0);
  const measureRef = useRef(measure);
  measureRef.current = measure;

  // Helper — compute pane top offsets from chart layout
  function recomputePaneOffsets() {
    if (!chartRef.current) return;
    const panes = chartRef.current.panes();
    let top = 0;
    const offsets: PaneOffset[] = panes.map((p) => {
      const h = p.getHeight();
      const o = { top, height: h };
      top += h;
      return o;
    });
    setPaneOffsets(offsets);
  }

  // Los osciladores pesados (BB, VWAP, Stoch, Stoch RSI, Cipher B) se
  // recalculan como mucho 1 vez por segundo mientras llegan ticks del
  // WebSocket. Recalcularlos en cada tick bloquea el hilo principal.
  const heavyTimerRef = useRef<number | null>(null);
  // El chart se crea una sola vez; la zona se lee por ref para no
  // recrearlo, y un efecto aparte reaplica los formateadores.
  const tzRef = useRef(timezone);
  tzRef.current = timezone;
  function scheduleHeavyUpdate() {
    if (heavyTimerRef.current !== null) return;
    heavyTimerRef.current = window.setTimeout(() => {
      heavyTimerRef.current = null;
      updateBB();
      updateVWAP();
      updateStochastic();
      updateStochRsi();
      updateCipher();
    }, 1000);
  }

  // Cambiar de zona solo reformatea etiquetas: no toca ni un dato, así el
  // anclaje del VWAP y las divergencias siguen calculándose igual.
  useEffect(() => {
    chartRef.current?.applyOptions({
      timeScale: { tickMarkFormatter: tickMarkFormatter(timezone) },
      localization: { timeFormatter: timeFormatter(timezone) },
    });
  }, [timezone]);

  // Fuente configurable de un indicador (Pine: input.source)
  function candleSource(k: Candle, src: string): number {
    switch (src) {
      case "open":
        return k.open;
      case "high":
        return k.high;
      case "low":
        return k.low;
      case "hl2":
        return (k.high + k.low) / 2;
      case "hlc3":
        return (k.high + k.low + k.close) / 3;
      case "ohlc4":
        return (k.open + k.high + k.low + k.close) / 4;
      default:
        return k.close;
    }
  }

  // Create chart once
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { color: TV_COLORS.bg },
        textColor: TV_COLORS.text,
        fontFamily: "var(--font-sans), Inter, system-ui, sans-serif",
        fontSize: 11,
        panes: { separatorColor: TV_COLORS.border, separatorHoverColor: TV_COLORS.border },
      },
      grid: {
        vertLines: { color: TV_COLORS.grid },
        horzLines: { color: TV_COLORS.grid },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: TV_COLORS.textMuted, width: 1, style: 3, labelBackgroundColor: TV_COLORS.panel },
        horzLine: { color: TV_COLORS.textMuted, width: 1, style: 3, labelBackgroundColor: TV_COLORS.panel },
      },
      rightPriceScale: {
        borderColor: TV_COLORS.border,
        textColor: TV_COLORS.textMuted,
      },
      timeScale: {
        borderColor: TV_COLORS.border,
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 12,
        barSpacing: 8,
        tickMarkFormatter: tickMarkFormatter(tzRef.current),
      },
      localization: { timeFormatter: timeFormatter(tzRef.current) },
      autoSize: true,
    });

    // PANE 0 — Candles + EMAs
    candleSeriesRef.current = chart.addSeries(CandlestickSeries, {
      upColor: TV_COLORS.green,
      downColor: TV_COLORS.red,
      borderUpColor: TV_COLORS.green,
      borderDownColor: TV_COLORS.red,
      wickUpColor: TV_COLORS.green,
      wickDownColor: TV_COLORS.red,
      priceLineColor: TV_COLORS.textMuted,
      priceLineStyle: 2,
    });

    ema20Ref.current = chart.addSeries(LineSeries, {
      color: INDICATOR_COLORS.ema20,
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    ema50Ref.current = chart.addSeries(LineSeries, {
      color: INDICATOR_COLORS.ema50,
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    ema200Ref.current = chart.addSeries(LineSeries, {
      color: INDICATOR_COLORS.ema200,
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
    });

    // Bollinger Bands — upper / middle / lower (pane 0, hidden by default)
    bbUpperRef.current = chart.addSeries(LineSeries, {
      color: INDICATOR_COLORS.bb,
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    bbMiddleRef.current = chart.addSeries(LineSeries, {
      color: INDICATOR_COLORS.bb,
      lineWidth: 1,
      lineStyle: 2,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    bbLowerRef.current = chart.addSeries(LineSeries, {
      color: INDICATOR_COLORS.bb,
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
    });

    // VWAP (pane 0) — Pine: plot(vwapValue, color = #2962FF)
    vwapRef.current = chart.addSeries(LineSeries, {
      color: INDICATOR_COLORS.vwap,
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
    });

    // Bandas del VWAP — colores del Pine: green / olive / teal
    VWAP_BAND_COLORS.forEach((color, i) => {
      const opts = {
        color,
        lineWidth: 1 as const,
        priceLineVisible: false,
        lastValueVisible: false,
        visible: false,
      };
      const up = chart.addSeries(LineSeries, opts);
      const lo = chart.addSeries(LineSeries, opts);
      vwapBandsRef.current.upper[i] = up;
      vwapBandsRef.current.lower[i] = lo;
      // El relleno entre banda superior e inferior (el fill() del Pine).
      const fill = new BandFill(chart, up, VWAP_FILL_COLORS[i]);
      fill.setVisible(false);
      up.attachPrimitive(fill);
      vwapBandsRef.current.fills[i] = fill;
    });

    // Global Liquidity Index — overlay on pane 0 using its own (invisible)
    // price scale so trillions-of-USD values don't break the price scale.
    // Shape of the line is what matters for crypto correlation analysis.
    gliRef.current = chart.addSeries(LineSeries, {
      color: INDICATOR_COLORS.gli,
      lineWidth: 2,
      lineStyle: 0,
      priceScaleId: "gli",
      priceLineVisible: false,
      lastValueVisible: false,
      visible: false,
    });
    chart.priceScale("gli").applyOptions({
      visible: false,
      scaleMargins: { top: 0.05, bottom: 0.05 },
    });

    chartRef.current = chart;

    // Click handler — add horizontal price line when hline tool is active
    chart.subscribeClick((param) => {
      if (!param.point || !candleSeriesRef.current) return;
      const price = candleSeriesRef.current.coordinateToPrice(param.point.y);
      if (price === null || !isFinite(price)) return;

      if (toolRef.current === "hline") {
        addPriceLineRef.current(price, symbolRef.current);
        return;
      }

      if (toolRef.current === "measure") {
        if (!param.time) return;
        const time = Number(param.time);
        const current = measureRef.current;
        if (current.phase === "idle") {
          setMeasure({
            phase: "placing",
            a: { time, price },
            b: { time, price },
          });
        } else if (current.phase === "placing") {
          setMeasure({
            phase: "done",
            a: current.a,
            b: { time, price },
          });
        } else {
          setMeasure({
            phase: "placing",
            a: { time, price },
            b: { time, price },
          });
        }
      }
    });

    // Crosshair handler
    chart.subscribeCrosshairMove((param) => {
      if (
        toolRef.current === "measure" &&
        measureRef.current.phase === "placing" &&
        param.point &&
        param.time &&
        candleSeriesRef.current
      ) {
        const price = candleSeriesRef.current.coordinateToPrice(param.point.y);
        if (price !== null && isFinite(price)) {
          const time = Number(param.time);
          setMeasure((prev) =>
            prev.phase === "placing" ? { ...prev, b: { time, price } } : prev,
          );
        }
      }

      if (!param.time || !candleSeriesRef.current) {
        setHover(null);
        return;
      }
      const data = param.seriesData.get(candleSeriesRef.current);
      const vol = volumeSeriesRef.current
        ? param.seriesData.get(volumeSeriesRef.current)
        : null;
      if (data && "open" in data) {
        const o = data.open as number;
        const c = data.close as number;
        setHover({
          o,
          h: data.high as number,
          l: data.low as number,
          c,
          v: vol && "value" in vol ? (vol.value as number) : 0,
          time: Number(param.time),
          pct: o === 0 ? 0 : ((c - o) / o) * 100,
        });
      }
    });

    // Re-render measure overlay on pan / zoom so pixel coords stay in sync
    const tsRangeHandler = () => setRenderTick((t) => t + 1);
    chart.timeScale().subscribeVisibleTimeRangeChange(tsRangeHandler);
    const logicalRangeHandler = () => setRenderTick((t) => t + 1);
    chart.timeScale().subscribeVisibleLogicalRangeChange(logicalRangeHandler);

    // ResizeObserver — recompute pane offsets when chart container resizes
    // Al cambiar el ANCHO (plegar el watchlist, redimensionar la ventana)
    // lightweight-charts ancla el contenido a la derecha y deja un hueco a la
    // izquierda. Reencuadramos para que el gráfico use todo el espacio nuevo.
    let lastWidth = containerRef.current.clientWidth;
    const ro = new ResizeObserver(() => {
      const w = containerRef.current?.clientWidth ?? lastWidth;
      const widthChanged = w !== lastWidth;
      lastWidth = w;
      requestAnimationFrame(() => {
        if (widthChanged) chartRef.current?.timeScale().fitContent();
        recomputePaneOffsets();
      });
    });
    ro.observe(containerRef.current);
    recomputePaneOffsets();

    return () => {
      chart.timeScale().unsubscribeVisibleTimeRangeChange(tsRangeHandler);
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(logicalRangeHandler);
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
      priceLinesMapRef.current.clear();
      ema20Ref.current = null;
      ema50Ref.current = null;
      ema200Ref.current = null;
      rsiRef.current = null;
      rsi30Ref.current = null;
      rsi70Ref.current = null;
      rsi50Ref.current = null;
      rsiMaRef.current = null;
      rsiBbUpRef.current = null;
      rsiBbLoRef.current = null;
      rsiFillsRef.current = {
        bg: null,
        ob: null,
        os: null,
        bb: null,
        divs: null,
        markers: null,
      };
      macdRef.current = null;
      macdSignalRef.current = null;
      macdHistRef.current = null;
      bbUpperRef.current = null;
      bbMiddleRef.current = null;
      bbLowerRef.current = null;
      vwapRef.current = null;
      vwapBandsRef.current = {
        upper: [null, null, null],
        lower: [null, null, null],
        fills: [null, null, null],
      };
      gliRef.current = null;
      stochKRef.current = null;
      stochDRef.current = null;
      if (heavyTimerRef.current !== null) {
        clearTimeout(heavyTimerRef.current);
        heavyTimerRef.current = null;
      }
      stoch20Ref.current = null;
      stoch80Ref.current = null;
      srsiKRef.current = null;
      srsiDRef.current = null;
      srsi20Ref.current = null;
      srsi50Ref.current = null;
      srsi80Ref.current = null;
      cipherWt1Ref.current = null;
      cipherWt2Ref.current = null;
      cipherVwapRef.current = null;
      cipherMfiRef.current = null;
      cipherStochKRef.current = null;
      cipherStochDRef.current = null;
      cipherStochFillRef.current = null;
      cipherRsiRef.current = null;
      cipherObRef.current = null;
      cipherOb2Ref.current = null;
      cipherOb3Ref.current = null;
      cipherOsRef.current = null;
      cipherOs2Ref.current = null;
      cipherOs3Ref.current = null;
      cipherZeroRef.current = null;
      cipherMarkersRef.current = null;
      wtBearDivRef.current = null;
      wtBullDivRef.current = null;
      wtBearHidDivRef.current = null;
      wtBullHidDivRef.current = null;
      wtBearDiv2Ref.current = null;
      wtBullDiv2Ref.current = null;
      rsiBearDivRef.current = null;
      rsiBullDivRef.current = null;
      rsiBearHidDivRef.current = null;
      rsiBullHidDivRef.current = null;
      stochBearDivRef.current = null;
      stochBullDivRef.current = null;
      cipherSchaffRef.current = null;
      cipherSommiHVwapRef.current = null;
    };
  }, []);

  // Manage volume — overlay at the bottom of the main pane
  useEffect(() => {
    if (!chartRef.current) return;
    if (indicators.volume && !volumeSeriesRef.current) {
      const v = chartRef.current.addSeries(
        HistogramSeries,
        {
          priceFormat: { type: "volume" },
          priceScaleId: "volume",
          color: TV_COLORS.textMuted,
          priceLineVisible: false,
          lastValueVisible: false,
        },
        0,
      );
      v.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
      volumeSeriesRef.current = v;
      const data = candlesRef.current.map((k) => ({
        time: k.time as UTCTimestamp,
        value: k.volume,
        color: k.close >= k.open ? `${TV_COLORS.green}66` : `${TV_COLORS.red}66`,
      }));
      v.setData(data);
    } else if (!indicators.volume && volumeSeriesRef.current && chartRef.current) {
      chartRef.current.removeSeries(volumeSeriesRef.current);
      volumeSeriesRef.current = null;
    }
    requestAnimationFrame(() => recomputePaneOffsets());
  }, [indicators.volume]);

  // RSI pane
  useEffect(() => {
    if (!chartRef.current) return;
    if (indicators.rsi && !rsiRef.current) {
      const paneIndex = 1;
      const r = chartRef.current.addSeries(
        LineSeries,
        {
          color: INDICATOR_COLORS.rsi,
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: false,
          // El RSI vive entre 0 y 100: fijamos la escala del pane para que
          // las bandas 70/30 queden siempre en el mismo lugar, como en
          // TradingView. Las demás series del pane no aportan a la escala.
          autoscaleInfoProvider: () => ({
            priceRange: { minValue: 0, maxValue: 100 },
          }),
        },
        paneIndex,
      );
      const r30 = chartRef.current.addSeries(
        LineSeries,
        {
          color: TV_COLORS.textMuted,
          lineWidth: 1,
          lineStyle: 2,
          priceLineVisible: false,
          lastValueVisible: false,
          autoscaleInfoProvider: () => null,
        },
        paneIndex,
      );
      const r70 = chartRef.current.addSeries(
        LineSeries,
        {
          color: TV_COLORS.textMuted,
          lineWidth: 1,
          lineStyle: 2,
          priceLineVisible: false,
          lastValueVisible: false,
          autoscaleInfoProvider: () => null,
        },
        paneIndex,
      );
      // Línea media 50, más tenue que las bandas (Pine: color.new(#787B86, 50))
      const r50 = chartRef.current.addSeries(
        LineSeries,
        {
          color: "#787B8680",
          lineWidth: 1,
          lineStyle: 2,
          priceLineVisible: false,
          lastValueVisible: false,
          autoscaleInfoProvider: () => null,
        },
        paneIndex,
      );
      // MA de suavizado del RSI (Pine: "RSI-based MA", amarilla)
      const rma = chartRef.current.addSeries(
        LineSeries,
        {
          color: RSI_COLORS.ma,
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: false,
          autoscaleInfoProvider: () => null,
        },
        paneIndex,
      );
      const mkBb = () =>
        chartRef.current!.addSeries(
          LineSeries,
          {
            color: RSI_COLORS.bb,
            lineWidth: 1,
            priceLineVisible: false,
            lastValueVisible: false,
            visible: false,
            autoscaleInfoProvider: () => null,
          },
          paneIndex,
        );
      const bbUp = mkBb();
      const bbLo = mkBb();
      rsiRef.current = r;
      rsi30Ref.current = r30;
      rsi70Ref.current = r70;
      rsi50Ref.current = r50;
      rsiMaRef.current = rma;
      rsiBbUpRef.current = bbUp;
      rsiBbLoRef.current = bbLo;

      // Fondo entre 70 y 30, degradados de sobrecompra/sobreventa y
      // relleno de las Bollinger.
      const bg = new BandFill(chartRef.current, r, RSI_COLORS.bgFill);
      r.attachPrimitive(bg);
      const ob = new ZoneGradientFill(
        chartRef.current,
        r,
        50,
        100,
        "rgba(76, 175, 80, 1)",
        70,
        "rgba(76, 175, 80, 0)",
      );
      r.attachPrimitive(ob);
      const os = new ZoneGradientFill(
        chartRef.current,
        r,
        50,
        30,
        "rgba(242, 54, 69, 0)",
        0,
        "rgba(242, 54, 69, 1)",
      );
      r.attachPrimitive(os);
      const bbFill = new BandFill(chartRef.current, bbUp, RSI_COLORS.bbFill);
      bbFill.setVisible(false);
      bbUp.attachPrimitive(bbFill);
      const divOverlay = new SegmentsOverlay(chartRef.current, r, 2);
      r.attachPrimitive(divOverlay);
      rsiFillsRef.current = {
        bg,
        ob,
        os,
        bb: bbFill,
        divs: divOverlay,
        markers: createSeriesMarkers(r, []),
      };

      try {
        chartRef.current.panes()[1]?.setStretchFactor(1);
        chartRef.current.panes()[0]?.setStretchFactor(3);
      } catch {}
      updateRSI();
    } else if (!indicators.rsi && rsiRef.current && chartRef.current) {
      for (const ref of [
        rsiRef,
        rsi30Ref,
        rsi70Ref,
        rsi50Ref,
        rsiMaRef,
        rsiBbUpRef,
        rsiBbLoRef,
      ]) {
        if (ref.current) {
          try {
            chartRef.current.removeSeries(ref.current);
          } catch {}
          ref.current = null;
        }
      }
      rsiFillsRef.current = {
        bg: null,
        ob: null,
        os: null,
        bb: null,
        divs: null,
        markers: null,
      };
    }
    requestAnimationFrame(() => recomputePaneOffsets());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indicators.rsi]);

  // MACD pane
  useEffect(() => {
    if (!chartRef.current) return;
    if (indicators.macd && !macdRef.current) {
      const paneIndex = indicators.rsi ? 2 : 1;
      const m = chartRef.current.addSeries(
        LineSeries,
        {
          color: INDICATOR_COLORS.macd,
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: false,
        },
        paneIndex,
      );
      const s = chartRef.current.addSeries(
        LineSeries,
        {
          color: TV_COLORS.yellow,
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: false,
        },
        paneIndex,
      );
      const h = chartRef.current.addSeries(
        HistogramSeries,
        { priceLineVisible: false, lastValueVisible: false },
        paneIndex,
      );
      macdRef.current = m;
      macdSignalRef.current = s;
      macdHistRef.current = h;
      try {
        chartRef.current.panes()[paneIndex]?.setStretchFactor(1);
        chartRef.current.panes()[0]?.setStretchFactor(3);
      } catch {}
      updateMACD();
    } else if (!indicators.macd && macdRef.current && chartRef.current) {
      if (macdRef.current) chartRef.current.removeSeries(macdRef.current);
      if (macdSignalRef.current) chartRef.current.removeSeries(macdSignalRef.current);
      if (macdHistRef.current) chartRef.current.removeSeries(macdHistRef.current);
      macdRef.current = null;
      macdSignalRef.current = null;
      macdHistRef.current = null;
    }
    requestAnimationFrame(() => recomputePaneOffsets());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indicators.macd, indicators.rsi]);

  // Cipher B pane — appended after RSI/MACD/Stoch if those are active
  useEffect(() => {
    if (!chartRef.current) return;
    if (indicators.cipher && !cipherWt1Ref.current) {
      const paneIndex =
        1 +
        (indicators.rsi ? 1 : 0) +
        (indicators.macd ? 1 : 0) +
        (indicators.stoch ? 1 : 0);
      // WT1 baseline area — same color above & below 0 to draw a sinusoidal
      // wave that crosses zero (Pine: #4994ec light blue).
      const wt1 = chartRef.current.addSeries(
        BaselineSeries,
        {
          baseValue: { type: "price", price: 0 },
          topFillColor1: "#4994ecB3",
          topFillColor2: "#4994ec30",
          topLineColor: "#4994ec",
          bottomFillColor1: "#4994ec30",
          bottomFillColor2: "#4994ecB3",
          bottomLineColor: "#4994ec",
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: false,
        },
        paneIndex,
      );
      // WT2 baseline area — Pine: #1f1559 dark purple
      const wt2 = chartRef.current.addSeries(
        BaselineSeries,
        {
          baseValue: { type: "price", price: 0 },
          topFillColor1: "#1f1559BF",
          topFillColor2: "#1f155950",
          topLineColor: "#1f1559",
          bottomFillColor1: "#1f155950",
          bottomFillColor2: "#1f1559BF",
          bottomLineColor: "#1f1559",
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: false,
        },
        paneIndex,
      );
      // Fast WT (wt1 - wt2), Pine renders as white area (also crosses 0)
      const vw = chartRef.current.addSeries(
        BaselineSeries,
        {
          baseValue: { type: "price", price: 0 },
          topFillColor1: "#ffffff80",
          topFillColor2: "#ffffff20",
          topLineColor: "#ffffff",
          bottomFillColor1: "#ffffff20",
          bottomFillColor2: "#ffffff80",
          bottomLineColor: "#ffffff",
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: false,
        },
        paneIndex,
      );
      // MFI baseline area (green above 0, red below — matches Pine's style_area)
      const mfiH = chartRef.current.addSeries(
        BaselineSeries,
        {
          baseValue: { type: "price", price: 0 },
          topFillColor1: "#3ee145FF",
          topFillColor2: "#3ee14580",
          topLineColor: "#3ee145FF",
          bottomFillColor1: "#ff3d2e80",
          bottomFillColor2: "#ff3d2eFF",
          bottomLineColor: "#ff3d2eFF",
          lineWidth: 2,
          priceLineVisible: false,
          lastValueVisible: false,
        },
        paneIndex,
      );
      // Stoch RSI K (Pine: #21baf3 cyan)
      const sk = chartRef.current.addSeries(
        LineSeries,
        {
          color: "#21baf3",
          lineWidth: 2,
          priceLineVisible: false,
          lastValueVisible: false,
        },
        paneIndex,
      );
      // Stoch RSI D (Pine: #673ab7 violet)
      const sd = chartRef.current.addSeries(
        LineSeries,
        {
          color: "#673ab7",
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: false,
        },
        paneIndex,
      );
      // Stoch K-D fill — soft area below K to approximate the K/D fill from Pine
      const sFill = chartRef.current.addSeries(
        AreaSeries,
        {
          topColor: "#21baf340",
          bottomColor: "#21baf300",
          lineColor: "#21baf300",
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: false,
        },
        paneIndex,
      );
      // RSI line (Pine: #c33ee1 purple/pink baseline color)
      const rsiLine = chartRef.current.addSeries(
        LineSeries,
        {
          color: "#c33ee1",
          lineWidth: 2,
          priceLineVisible: false,
          lastValueVisible: false,
        },
        paneIndex,
      );
      const ob = chartRef.current.addSeries(
        LineSeries,
        {
          color: TV_COLORS.textMuted,
          lineWidth: 1,
          lineStyle: 2,
          priceLineVisible: false,
          lastValueVisible: false,
        },
        paneIndex,
      );
      const ob2 = chartRef.current.addSeries(
        LineSeries,
        {
          color: TV_COLORS.text,
          lineWidth: 1,
          lineStyle: 0,
          priceLineVisible: false,
          lastValueVisible: false,
        },
        paneIndex,
      );
      const ob3 = chartRef.current.addSeries(
        LineSeries,
        {
          color: `${TV_COLORS.text}60`,
          lineWidth: 1,
          lineStyle: 3,
          priceLineVisible: false,
          lastValueVisible: false,
        },
        paneIndex,
      );
      const os = chartRef.current.addSeries(
        LineSeries,
        {
          color: TV_COLORS.textMuted,
          lineWidth: 1,
          lineStyle: 2,
          priceLineVisible: false,
          lastValueVisible: false,
        },
        paneIndex,
      );
      const os2 = chartRef.current.addSeries(
        LineSeries,
        {
          color: TV_COLORS.text,
          lineWidth: 1,
          lineStyle: 0,
          priceLineVisible: false,
          lastValueVisible: false,
        },
        paneIndex,
      );
      const os3 = chartRef.current.addSeries(
        LineSeries,
        {
          color: `${TV_COLORS.text}60`,
          lineWidth: 1,
          lineStyle: 3,
          priceLineVisible: false,
          lastValueVisible: false,
        },
        paneIndex,
      );
      const zero = chartRef.current.addSeries(
        LineSeries,
        {
          color: `${TV_COLORS.text}60`,
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: false,
        },
        paneIndex,
      );
      // Divergence line series — render as 2px-wide segments. Colors from Pine.
      const makeDivSeries = (color: string, width = 2) =>
        chartRef.current!.addSeries(
          LineSeries,
          {
            color,
            lineWidth: width as 1 | 2 | 3 | 4,
            priceLineVisible: false,
            lastValueVisible: false,
          },
          paneIndex,
        );
      wtBearDivRef.current = makeDivSeries("#e60000");
      wtBullDivRef.current = makeDivSeries("#00e676");
      wtBearHidDivRef.current = makeDivSeries("#e60000");
      wtBullHidDivRef.current = makeDivSeries("#00e676");
      wtBearDiv2Ref.current = makeDivSeries("#e6000099");
      wtBullDiv2Ref.current = makeDivSeries("#00e67699");
      rsiBearDivRef.current = makeDivSeries("#e60000", 1);
      rsiBullDivRef.current = makeDivSeries("#38ff42", 1);
      rsiBearHidDivRef.current = makeDivSeries("#e60000", 1);
      rsiBullHidDivRef.current = makeDivSeries("#38ff42", 1);
      stochBearDivRef.current = makeDivSeries("#e60000", 1);
      stochBullDivRef.current = makeDivSeries("#38ff42", 1);

      // Schaff Trend Cycle — soft purple line
      cipherSchaffRef.current = chartRef.current.addSeries(
        LineSeries,
        {
          color: "#673ab7",
          lineWidth: 2,
          priceLineVisible: false,
          lastValueVisible: false,
        },
        paneIndex,
      );
      // Sommi higher-TF VWAP (smoothed) — yellow line
      cipherSommiHVwapRef.current = chartRef.current.addSeries(
        LineSeries,
        {
          color: "#ffe500",
          lineWidth: 2,
          priceLineVisible: false,
          lastValueVisible: false,
        },
        paneIndex,
      );

      cipherWt1Ref.current = wt1;
      cipherWt2Ref.current = wt2;
      cipherVwapRef.current = vw;
      cipherMfiRef.current = mfiH;
      cipherStochKRef.current = sk;
      cipherStochDRef.current = sd;
      cipherStochFillRef.current = sFill;
      cipherRsiRef.current = rsiLine;
      cipherObRef.current = ob;
      cipherOb2Ref.current = ob2;
      cipherOb3Ref.current = ob3;
      cipherOsRef.current = os;
      cipherOs2Ref.current = os2;
      cipherOs3Ref.current = os3;
      cipherZeroRef.current = zero;
      cipherMarkersRef.current = createSeriesMarkers(wt2, []);
      try {
        chartRef.current.panes()[paneIndex]?.setStretchFactor(2);
        chartRef.current.panes()[0]?.setStretchFactor(3);
      } catch {}
      updateCipher();
    } else if (!indicators.cipher && cipherWt1Ref.current && chartRef.current) {
      cipherMarkersRef.current?.detach();
      cipherMarkersRef.current = null;
      for (const r of [
        cipherWt1Ref,
        cipherWt2Ref,
        cipherVwapRef,
        cipherMfiRef,
        cipherStochKRef,
        cipherStochDRef,
        cipherStochFillRef,
        cipherRsiRef,
        cipherObRef,
        cipherOb2Ref,
        cipherOb3Ref,
        cipherOsRef,
        cipherOs2Ref,
        cipherOs3Ref,
        cipherZeroRef,
        wtBearDivRef,
        wtBullDivRef,
        wtBearHidDivRef,
        wtBullHidDivRef,
        wtBearDiv2Ref,
        wtBullDiv2Ref,
        rsiBearDivRef,
        rsiBullDivRef,
        rsiBearHidDivRef,
        rsiBullHidDivRef,
        stochBearDivRef,
        stochBullDivRef,
        cipherSchaffRef,
        cipherSommiHVwapRef,
      ]) {
        if (r.current) {
          try {
            chartRef.current.removeSeries(r.current);
          } catch {}
          r.current = null;
        }
      }
    }
    requestAnimationFrame(() => recomputePaneOffsets());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indicators.cipher, indicators.rsi, indicators.macd, indicators.stoch]);

  // Stochastic pane — appended after RSI/MACD if those are active
  useEffect(() => {
    if (!chartRef.current) return;
    if (indicators.stoch && !stochKRef.current) {
      const paneIndex =
        1 + (indicators.rsi ? 1 : 0) + (indicators.macd ? 1 : 0);
      const k = chartRef.current.addSeries(
        LineSeries,
        {
          color: INDICATOR_COLORS.stoch,
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: false,
        },
        paneIndex,
      );
      const d = chartRef.current.addSeries(
        LineSeries,
        {
          color: TV_COLORS.yellow,
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: false,
        },
        paneIndex,
      );
      const s20 = chartRef.current.addSeries(
        LineSeries,
        {
          color: TV_COLORS.textMuted,
          lineWidth: 1,
          lineStyle: 2,
          priceLineVisible: false,
          lastValueVisible: false,
        },
        paneIndex,
      );
      const s80 = chartRef.current.addSeries(
        LineSeries,
        {
          color: TV_COLORS.textMuted,
          lineWidth: 1,
          lineStyle: 2,
          priceLineVisible: false,
          lastValueVisible: false,
        },
        paneIndex,
      );
      stochKRef.current = k;
      stochDRef.current = d;
      stoch20Ref.current = s20;
      stoch80Ref.current = s80;
      try {
        chartRef.current.panes()[paneIndex]?.setStretchFactor(1);
        chartRef.current.panes()[0]?.setStretchFactor(3);
      } catch {}
      updateStochastic();
    } else if (!indicators.stoch && stochKRef.current && chartRef.current) {
      if (stochKRef.current) chartRef.current.removeSeries(stochKRef.current);
      if (stochDRef.current) chartRef.current.removeSeries(stochDRef.current);
      if (stoch20Ref.current) chartRef.current.removeSeries(stoch20Ref.current);
      if (stoch80Ref.current) chartRef.current.removeSeries(stoch80Ref.current);
      stochKRef.current = null;
      stochDRef.current = null;
      stoch20Ref.current = null;
      stoch80Ref.current = null;
    }
    requestAnimationFrame(() => recomputePaneOffsets());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indicators.stoch, indicators.rsi, indicators.macd]);

  // Stoch RSI pane — SIEMPRE el último pane, así agregarlo no reordena
  // los índices de RSI / MACD / Stoch / Cipher que ya existen.
  useEffect(() => {
    if (!chartRef.current) return;
    if (indicators.srsi && !srsiKRef.current) {
      const paneIndex =
        1 +
        (indicators.rsi ? 1 : 0) +
        (indicators.macd ? 1 : 0) +
        (indicators.stoch ? 1 : 0) +
        (indicators.cipher ? 1 : 0);
      const mkLine = (color: string, dashed = false) =>
        chartRef.current!.addSeries(
          LineSeries,
          {
            color,
            lineWidth: 1,
            lineStyle: dashed ? 2 : 0,
            priceLineVisible: false,
            lastValueVisible: false,
          },
          paneIndex,
        );
      // Pine: plot(k, "K", color=#2962FF) / plot(d, "D", color=#FF6D00)
      srsiKRef.current = mkLine("#2962FF");
      srsiDRef.current = mkLine("#FF6D00");
      // hline 80 / 50 / 20 — #787B86 (la del medio más tenue)
      srsi80Ref.current = mkLine("#787B86", true);
      srsi50Ref.current = mkLine("#787B8680", true);
      srsi20Ref.current = mkLine("#787B86", true);
      try {
        chartRef.current.panes()[paneIndex]?.setStretchFactor(1);
        chartRef.current.panes()[0]?.setStretchFactor(3);
      } catch {}
      updateStochRsi();
    } else if (!indicators.srsi && srsiKRef.current && chartRef.current) {
      for (const r of [srsiKRef, srsiDRef, srsi20Ref, srsi50Ref, srsi80Ref]) {
        if (r.current) {
          try {
            chartRef.current.removeSeries(r.current);
          } catch {}
          r.current = null;
        }
      }
    }
    requestAnimationFrame(() => recomputePaneOffsets());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    indicators.srsi,
    indicators.rsi,
    indicators.macd,
    indicators.stoch,
    indicators.cipher,
  ]);

  // Visibility — eye toggle (hidden state) + enabled state combined
  useEffect(() => {
    const v = (key: IndicatorKey) => indicators[key] && !hidden[key];
    ema20Ref.current?.applyOptions({ visible: v("ema20") });
    ema50Ref.current?.applyOptions({ visible: v("ema50") });
    ema200Ref.current?.applyOptions({ visible: v("ema200") });
    if (rsiRef.current) rsiRef.current.applyOptions({ visible: v("rsi") });
    if (rsi30Ref.current) rsi30Ref.current.applyOptions({ visible: v("rsi") });
    if (rsi70Ref.current) rsi70Ref.current.applyOptions({ visible: v("rsi") });
    if (macdRef.current) macdRef.current.applyOptions({ visible: v("macd") });
    if (macdSignalRef.current) macdSignalRef.current.applyOptions({ visible: v("macd") });
    if (macdHistRef.current) macdHistRef.current.applyOptions({ visible: v("macd") });
    if (volumeSeriesRef.current) volumeSeriesRef.current.applyOptions({ visible: v("volume") });
    bbUpperRef.current?.applyOptions({ visible: v("bb") });
    bbMiddleRef.current?.applyOptions({ visible: v("bb") });
    bbLowerRef.current?.applyOptions({ visible: v("bb") });
    vwapRef.current?.applyOptions({ visible: v("vwap") });
    {
      const bandsOn = [
        config.vwapShowBand1,
        config.vwapShowBand2,
        config.vwapShowBand3,
      ];
      for (let i = 0; i < 3; i++) {
        const on = v("vwap") && bandsOn[i];
        vwapBandsRef.current.upper[i]?.applyOptions({ visible: on });
        vwapBandsRef.current.lower[i]?.applyOptions({ visible: on });
        vwapBandsRef.current.fills[i]?.setVisible(on);
      }
    }
    gliRef.current?.applyOptions({ visible: v("gli") });
    stochKRef.current?.applyOptions({ visible: v("stoch") });
    stochDRef.current?.applyOptions({ visible: v("stoch") });
    stoch20Ref.current?.applyOptions({ visible: v("stoch") });
    stoch80Ref.current?.applyOptions({ visible: v("stoch") });
    srsiKRef.current?.applyOptions({ visible: v("srsi") });
    srsiDRef.current?.applyOptions({ visible: v("srsi") });
    srsi20Ref.current?.applyOptions({ visible: v("srsi") });
    srsi50Ref.current?.applyOptions({ visible: v("srsi") });
    srsi80Ref.current?.applyOptions({ visible: v("srsi") });
    // Cipher B — top-level visibility AND per-sub-feature toggles
    const cipherOn = v("cipher");
    const cfg = config;
    const wtVis = cipherOn && cfg.cipherShowWaveTrend;
    cipherWt1Ref.current?.applyOptions({ visible: wtVis });
    cipherWt2Ref.current?.applyOptions({ visible: wtVis });
    cipherVwapRef.current?.applyOptions({
      visible: cipherOn && cfg.cipherShowFastWT,
    });
    cipherMfiRef.current?.applyOptions({
      visible: cipherOn && cfg.cipherShowMFI,
    });
    const stochVis = cipherOn && cfg.cipherShowStochRSI;
    cipherStochKRef.current?.applyOptions({ visible: stochVis });
    cipherStochDRef.current?.applyOptions({ visible: stochVis });
    cipherStochFillRef.current?.applyOptions({ visible: stochVis });
    cipherRsiRef.current?.applyOptions({
      visible: cipherOn && cfg.cipherShowRSI,
    });
    // OB/OS lines are always shown when cipher is on
    for (const r of [
      cipherObRef,
      cipherOb2Ref,
      cipherOb3Ref,
      cipherOsRef,
      cipherOs2Ref,
      cipherOs3Ref,
      cipherZeroRef,
    ]) {
      r.current?.applyOptions({ visible: cipherOn });
    }
    // Divergence series visibility
    const wtDivOn = cipherOn && cfg.cipherShowWTDivergences;
    const wtHidOn = cipherOn && cfg.cipherShowWTDivergencesHidden;
    const wtDiv2On = cipherOn && cfg.cipherShowWTDivergences2;
    const rsiDivOn = cipherOn && cfg.cipherShowRSIDivergences;
    const rsiHidOn = cipherOn && cfg.cipherShowRSIDivergencesHidden;
    const stDivOn = cipherOn && cfg.cipherShowStochDivergences;
    wtBearDivRef.current?.applyOptions({ visible: wtDivOn });
    wtBullDivRef.current?.applyOptions({ visible: wtDivOn });
    wtBearHidDivRef.current?.applyOptions({ visible: wtHidOn });
    wtBullHidDivRef.current?.applyOptions({ visible: wtHidOn });
    wtBearDiv2Ref.current?.applyOptions({ visible: wtDiv2On });
    wtBullDiv2Ref.current?.applyOptions({ visible: wtDiv2On });
    rsiBearDivRef.current?.applyOptions({ visible: rsiDivOn });
    rsiBullDivRef.current?.applyOptions({ visible: rsiDivOn });
    rsiBearHidDivRef.current?.applyOptions({ visible: rsiHidOn });
    rsiBullHidDivRef.current?.applyOptions({ visible: rsiHidOn });
    stochBearDivRef.current?.applyOptions({ visible: stDivOn });
    stochBullDivRef.current?.applyOptions({ visible: stDivOn });
    cipherSchaffRef.current?.applyOptions({
      visible: cipherOn && cfg.cipherShowSchaff,
    });
    cipherSommiHVwapRef.current?.applyOptions({
      visible: cipherOn && cfg.cipherShowSommiFastWave,
    });
  }, [indicators, hidden, config]);

  // Recompute indicators when config changes (periods)
  useEffect(() => {
    updateEMAs();
  }, [config.ema20, config.ema50, config.ema200]);

  useEffect(() => {
    updateRSI();
  }, [config.rsi]);

  useEffect(() => {
    updateMACD();
  }, [config.macdFast, config.macdSlow, config.macdSignal]);

  useEffect(() => {
    updateBB();
  }, [config.bbPeriod, config.bbStdDev]);

  useEffect(() => {
    updateStochastic();
  }, [config.stochK, config.stochD, config.stochSmooth]);

  useEffect(() => {
    updateRSI();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    config.rsi,
    config.rsiSource,
    config.rsiCalcDivergence,
    config.rsiMaType,
    config.rsiMaLength,
    config.rsiBbMult,
  ]);

  useEffect(() => {
    updateStochRsi();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.srsiK, config.srsiD, config.srsiRsiLen, config.srsiStochLen]);

  useEffect(() => {
    updateVWAP();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    config.vwapHideOnDWM,
    config.vwapAnchor,
    config.vwapSource,
    config.vwapOffset,
    config.vwapBandsMode,
    config.vwapMult1,
    config.vwapMult2,
    config.vwapMult3,
    timeframe,
  ]);

  // Multi-TF data fetching for Sommi flag/diamond and MACD colors override.
  // Runs whenever the user enables one of these features or changes the relevant TF.
  useEffect(() => {
    if (!indicators.cipher) return;
    const needFlag = config.cipherShowSommiFlag || config.cipherShowSommiFastWave;
    const needDiamond = config.cipherShowSommiDiamond;
    const needMacd = config.cipherShowMacdColors;
    if (!needFlag && !needDiamond && !needMacd) return;
    let cancelled = false;
    (async () => {
      try {
        const targets: Array<{
          key: keyof typeof multiTFCandlesRef.current;
          tf: Timeframe;
        }> = [];
        if (needFlag)
          targets.push({
            key: "sommiFlag",
            tf: config.cipherSommiVwapTF as Timeframe,
          });
        if (needDiamond) {
          targets.push({
            key: "sommiHTC1",
            tf: config.cipherSommiHTCRes as Timeframe,
          });
          targets.push({
            key: "sommiHTC2",
            tf: config.cipherSommiHTCRes2 as Timeframe,
          });
        }
        if (needMacd)
          targets.push({
            key: "macdColors",
            tf: config.cipherMacdColorsTF as Timeframe,
          });
        const results = await Promise.all(
          targets.map((t) => fetchKlinesCached(symbol, t.tf, 500)),
        );
        if (cancelled) return;
        for (let i = 0; i < targets.length; i++) {
          multiTFCandlesRef.current[targets[i].key] = results[i];
        }
        setMultiTFTick((t) => t + 1);
      } catch (e) {
        console.error("multi-TF fetch failed:", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    indicators.cipher,
    symbol,
    timeframe,
    config.cipherShowSommiFlag,
    config.cipherShowSommiFastWave,
    config.cipherShowSommiDiamond,
    config.cipherShowMacdColors,
    config.cipherSommiVwapTF,
    config.cipherSommiHTCRes,
    config.cipherSommiHTCRes2,
    config.cipherMacdColorsTF,
  ]);

  useEffect(() => {
    updateCipher();
  }, [
    config.wtChannelLen,
    config.wtAverageLen,
    config.wtMALen,
    config.mfiPeriod,
    config.mfiMultiplier,
    config.cipherMfiYPos,
    config.cipherStochLen,
    config.cipherStochRsiLen,
    config.cipherStochSmoothK,
    config.cipherStochSmoothD,
    config.cipherStochUseLog,
    config.cipherStochUseAvg,
    config.cipherRsiLen,
    config.cipherRsiOverbought,
    config.cipherRsiOversold,
    config.wtObLevel,
    config.wtObLevel2,
    config.wtObLevel3,
    config.wtOsLevel,
    config.wtOsLevel2,
    config.wtOsLevel3,
    config.cipherShowBuyDots,
    config.cipherShowGoldDots,
    config.cipherShowSellDots,
    config.cipherShowCrossDots,
    config.cipherShowDivDots,
    config.cipherShowWTDivergences,
    config.cipherShowWTDivergences2,
    config.cipherShowRSIDivergences,
    config.cipherNotApplyOBOSOnHidden,
    config.cipherWtDivOBLevel,
    config.cipherWtDivOSLevel,
    config.cipherWtDivOBLevel2,
    config.cipherWtDivOSLevel2,
    config.cipherRsiDivOBLevel,
    config.cipherRsiDivOSLevel,
    config.cipherShowSchaff,
    config.cipherSchaffLength,
    config.cipherSchaffFast,
    config.cipherSchaffSlow,
    config.cipherSchaffFactor,
    config.cipherShowSommiFlag,
    config.cipherShowSommiFastWave,
    config.cipherShowSommiDiamond,
    config.cipherShowMacdColors,
    config.cipherSommiVwapBearLevel,
    config.cipherSommiVwapBullLevel,
    config.cipherSommiFlagWTBearLevel,
    config.cipherSommiFlagWTBullLevel,
    config.cipherSommiRSIMFIBearLevel,
    config.cipherSommiRSIMFIBullLevel,
    config.cipherSommiDiamondWTBearLevel,
    config.cipherSommiDiamondWTBullLevel,
    multiTFTick,
  ]);

  // Sync price lines from store to the candle series
  useEffect(() => {
    const series = candleSeriesRef.current;
    if (!series) return;
    const map = priceLinesMapRef.current;
    const linesForThisSymbol = priceLines.filter((p) => p.symbol === symbol);
    const activeIds = new Set(linesForThisSymbol.map((p) => p.id));

    for (const [id, apiLine] of map.entries()) {
      if (!activeIds.has(id)) {
        try {
          series.removePriceLine(apiLine);
        } catch {}
        map.delete(id);
      }
    }
    for (const pl of linesForThisSymbol) {
      if (!map.has(pl.id)) {
        const apiLine = series.createPriceLine({
          price: pl.price,
          color: TV_COLORS.blue,
          lineWidth: 1,
          lineStyle: 2,
          axisLabelVisible: true,
          title: "",
        });
        map.set(pl.id, apiLine);
      }
    }
  }, [priceLines, symbol]);

  // Cursor style when drawing tools are active + reset measure on tool change
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.style.cursor =
        tool === "hline" || tool === "measure" ? "crosshair" : "";
    }
    if (tool !== "measure") setMeasure(INITIAL_MEASURE);
  }, [tool]);

  function updateEMAs() {
    const c = candlesRef.current;
    if (c.length === 0) return;
    const cfg = configRef.current;
    let last20: number | undefined;
    let last50: number | undefined;
    let last200: number | undefined;

    if (ema20Ref.current) {
      const data = ema(c, cfg.ema20);
      ema20Ref.current.setData(
        data.map((p) => ({ time: p.time as UTCTimestamp, value: p.value })),
      );
      last20 = data.at(-1)?.value;
    }
    if (ema50Ref.current) {
      const data = ema(c, cfg.ema50);
      ema50Ref.current.setData(
        data.map((p) => ({ time: p.time as UTCTimestamp, value: p.value })),
      );
      last50 = data.at(-1)?.value;
    }
    if (ema200Ref.current) {
      const data = ema(c, cfg.ema200);
      ema200Ref.current.setData(
        data.map((p) => ({ time: p.time as UTCTimestamp, value: p.value })),
      );
      last200 = data.at(-1)?.value;
    }
    const lastVol = c.at(-1)?.volume;
    setLastValues((prev) => ({
      ...prev,
      ema20: last20,
      ema50: last50,
      ema200: last200,
      volume: lastVol,
    }));
  }

  function updateRSI() {
    const c = candlesRef.current;
    if (c.length === 0 || !rsiRef.current) return;
    const cfg = configRef.current;

    // Pine: input.source(close) — el RSI puede calcularse sobre otra fuente.
    const srcCandles =
      cfg.rsiSource === "close"
        ? c
        : c.map((k) => ({ ...k, close: candleSource(k, cfg.rsiSource) }));
    const raw = rsi(srcCandles, cfg.rsi);
    const data = raw.map((p) => ({
      time: p.time as UTCTimestamp,
      value: p.value,
    }));
    rsiRef.current.setData(data);

    const first = data[0]?.time;
    const last = data[data.length - 1]?.time;
    const level = (v: number) =>
      first !== undefined && last !== undefined
        ? [
            { time: first, value: v },
            { time: last, value: v },
          ]
        : [];
    rsi30Ref.current?.setData(level(30));
    rsi70Ref.current?.setData(level(70));
    rsi50Ref.current?.setData(level(50));

    // Fondo entre las bandas 70 y 30 + degradados de sobrecompra/sobreventa
    rsiFillsRef.current.bg?.setData(
      raw.map((p) => ({ time: p.time, upper: 70, lower: 30 })),
    );
    const zone = raw.map((p) => ({ time: p.time, value: p.value }));
    rsiFillsRef.current.ob?.setData(zone);
    rsiFillsRef.current.os?.setData(zone);

    // MA de suavizado (+ Bollinger cuando corresponde)
    const maType = cfg.rsiMaType as MaType;
    const isBB = maType === "SMA + Bollinger Bands";
    if (maType === "None") {
      rsiMaRef.current?.setData([]);
      rsiMaRef.current?.applyOptions({ visible: false });
    } else {
      const volumes = new Map(c.map((k) => [k.time, k.volume]));
      const ma = maOverPoints(raw, cfg.rsiMaLength, maType, volumes);
      rsiMaRef.current?.applyOptions({ visible: true });
      rsiMaRef.current?.setData(
        ma.map((p) => ({ time: p.time as UTCTimestamp, value: p.value })),
      );
      if (isBB) {
        const sd = stdevPoints(raw, cfg.rsiMaLength);
        const sdByTime = new Map(sd.map((p) => [p.time, p.value]));
        const up = ma.map((p) => ({
          time: p.time as UTCTimestamp,
          value: p.value + (sdByTime.get(p.time) ?? 0) * cfg.rsiBbMult,
        }));
        const lo = ma.map((p) => ({
          time: p.time as UTCTimestamp,
          value: p.value - (sdByTime.get(p.time) ?? 0) * cfg.rsiBbMult,
        }));
        rsiBbUpRef.current?.setData(up);
        rsiBbLoRef.current?.setData(lo);
        rsiFillsRef.current.bb?.setData(
          ma.map((p) => ({
            time: p.time,
            upper: p.value + (sdByTime.get(p.time) ?? 0) * cfg.rsiBbMult,
            lower: p.value - (sdByTime.get(p.time) ?? 0) * cfg.rsiBbMult,
          })),
        );
      } else {
        rsiBbUpRef.current?.setData([]);
        rsiBbLoRef.current?.setData([]);
        rsiFillsRef.current.bb?.setData([]);
      }
    }
    rsiBbUpRef.current?.applyOptions({ visible: isBB });
    rsiBbLoRef.current?.applyOptions({ visible: isBB });
    rsiFillsRef.current.bb?.setVisible(isBB);

    // Divergencias regulares + etiquetas Bull / Bear
    if (!cfg.rsiCalcDivergence) {
      rsiFillsRef.current.divs?.setData([]);
      rsiFillsRef.current.markers?.setMarkers([]);
    } else {
      const divs = rsiDivergences(raw, c);
      // Una serie por tipo, con whitespace entre segmentos para cortarlos.
      rsiFillsRef.current.divs?.setData(
        divs.map((d) => ({
          fromTime: d.fromTime,
          fromValue: d.fromValue,
          toTime: d.toTime,
          toValue: d.toValue,
          color: d.kind === "bull" ? RSI_COLORS.bull : RSI_COLORS.bear,
        })),
      );
      rsiFillsRef.current.markers?.setMarkers(
        divs.map((d) => ({
          time: d.toTime as UTCTimestamp,
          position: d.kind === "bull" ? "belowBar" : "aboveBar",
          shape: d.kind === "bull" ? "arrowUp" : "arrowDown",
          color: d.kind === "bull" ? RSI_COLORS.bull : RSI_COLORS.bear,
          text: d.kind === "bull" ? "Bull" : "Bear",
        })),
      );
    }

    setLastValues((prev) => ({ ...prev, rsi: data.at(-1)?.value }));
  }

  function updateBB() {
    const c = candlesRef.current;
    if (c.length === 0 || !bbUpperRef.current) return;
    const cfg = configRef.current;
    const data = bollinger(c, cfg.bbPeriod, cfg.bbStdDev);
    bbUpperRef.current.setData(
      data.map((p) => ({ time: p.time as UTCTimestamp, value: p.upper })),
    );
    bbMiddleRef.current?.setData(
      data.map((p) => ({ time: p.time as UTCTimestamp, value: p.middle })),
    );
    bbLowerRef.current?.setData(
      data.map((p) => ({ time: p.time as UTCTimestamp, value: p.lower })),
    );
    const last = data.at(-1);
    setLastValues((prev) => ({
      ...prev,
      bbUpper: last?.upper,
      bbMiddle: last?.middle,
      bbLower: last?.lower,
    }));
  }

  function updateVWAP() {
    const c = candlesRef.current;
    if (c.length === 0 || !vwapRef.current) return;
    const cfg = configRef.current;
    // Pine: hideonDWM — no dibujar el VWAP en gráficos de 1D o superior.
    if (cfg.vwapHideOnDWM && DWM_TIMEFRAMES.has(timeframe)) {
      vwapRef.current.setData([]);
      for (let i = 0; i < 3; i++) {
        vwapBandsRef.current.upper[i]?.setData([]);
        vwapBandsRef.current.lower[i]?.setData([]);
        vwapBandsRef.current.fills[i]?.setData([]);
      }
      setLastValues((prev) => ({
        ...prev,
        vwap: undefined,
        vwapBands: undefined,
      }));
      return;
    }

    const data = vwapAnchored(
      c,
      cfg.vwapAnchor as VwapAnchor,
      cfg.vwapSource as VwapSource,
      cfg.vwapBandsMode as VwapBandsMode,
      [cfg.vwapMult1, cfg.vwapMult2, cfg.vwapMult3],
    );

    // Pine: offset — corre el trazado N velas. Positivo lo proyecta hacia el
    // futuro, así que extrapolamos timestamps con el paso de las velas.
    const off = Math.round(cfg.vwapOffset || 0);
    const step =
      c.length > 1 ? c[c.length - 1].time - c[c.length - 2].time : 0;
    const timeAt = (i: number): number | null => {
      const j = i + off;
      if (j >= 0 && j < c.length) return c[j].time;
      if (step <= 0) return null;
      if (j >= c.length) return c[c.length - 1].time + (j - c.length + 1) * step;
      return c[0].time + j * step; // j < 0
    };

    const shifted = data
      .map((p, i) => ({ p, t: timeAt(i) }))
      .filter((x): x is { p: (typeof data)[number]; t: number } => x.t !== null);

    vwapRef.current.setData(
      shifted.map(({ p, t }) => ({ time: t as UTCTimestamp, value: p.vwap })),
    );
    for (let i = 0; i < 3; i++) {
      vwapBandsRef.current.upper[i]?.setData(
        shifted.map(({ p, t }) => ({
          time: t as UTCTimestamp,
          value: p.upper[i],
        })),
      );
      vwapBandsRef.current.lower[i]?.setData(
        shifted.map(({ p, t }) => ({
          time: t as UTCTimestamp,
          value: p.lower[i],
        })),
      );
      vwapBandsRef.current.fills[i]?.setData(
        shifted.map(({ p, t }) => ({
          time: t,
          upper: p.upper[i],
          lower: p.lower[i],
          isNew: p.isNew,
        })),
      );
    }
    const lastPt = data.at(-1);
    setLastValues((prev) => ({
      ...prev,
      vwap: lastPt?.vwap,
      vwapBands: lastPt
        ? ([
            [lastPt.upper[0], lastPt.lower[0]],
            [lastPt.upper[1], lastPt.lower[1]],
            [lastPt.upper[2], lastPt.lower[2]],
          ] as Array<[number, number]>)
        : undefined,
    }));
  }

  function updateGLI() {
    const c = candlesRef.current;
    if (c.length === 0 || !gliRef.current) return;
    const data = globalLiquidity(c);
    gliRef.current.setData(
      data.map((p) => ({ time: p.time as UTCTimestamp, value: p.value })),
    );
    setLastValues((prev) => ({ ...prev, gli: data.at(-1)?.value }));
  }

  function updateStochastic() {
    const c = candlesRef.current;
    if (c.length === 0 || !stochKRef.current) return;
    const cfg = configRef.current;
    const data = stochastic(c, cfg.stochK, cfg.stochD, cfg.stochSmooth);
    stochKRef.current.setData(
      data.map((p) => ({ time: p.time as UTCTimestamp, value: p.k })),
    );
    stochDRef.current?.setData(
      data.map((p) => ({ time: p.time as UTCTimestamp, value: p.d })),
    );
    if (stoch20Ref.current && data.length > 0)
      stoch20Ref.current.setData([
        { time: data[0].time as UTCTimestamp, value: 20 },
        { time: data[data.length - 1].time as UTCTimestamp, value: 20 },
      ]);
    if (stoch80Ref.current && data.length > 0)
      stoch80Ref.current.setData([
        { time: data[0].time as UTCTimestamp, value: 80 },
        { time: data[data.length - 1].time as UTCTimestamp, value: 80 },
      ]);
    const last = data.at(-1);
    setLastValues((prev) => ({
      ...prev,
      stochK: last?.k,
      stochD: last?.d,
    }));
  }

  // Stoch RSI estándar (Pine v6): RSI(close, rsiLen) -> stoch(stochLen)
  // -> K = SMA(stoch, smoothK) -> D = SMA(K, smoothD). Sin escala log.
  function updateStochRsi() {
    const c = candlesRef.current;
    if (c.length === 0 || !srsiKRef.current) return;
    const cfg = configRef.current;
    const data = stochRsi(
      c,
      cfg.srsiStochLen,
      cfg.srsiRsiLen,
      cfg.srsiK,
      cfg.srsiD,
      false,
    );
    srsiKRef.current.setData(
      data.map((p) => ({ time: p.time as UTCTimestamp, value: p.k })),
    );
    srsiDRef.current?.setData(
      data.map((p) => ({ time: p.time as UTCTimestamp, value: p.d })),
    );
    if (data.length > 0) {
      const first = data[0].time as UTCTimestamp;
      const last = data[data.length - 1].time as UTCTimestamp;
      for (const [ref, level] of [
        [srsi80Ref, 80],
        [srsi50Ref, 50],
        [srsi20Ref, 20],
      ] as const) {
        ref.current?.setData([
          { time: first, value: level },
          { time: last, value: level },
        ]);
      }
    }
    const last = data.at(-1);
    setLastValues((prev) => ({ ...prev, srsiK: last?.k, srsiD: last?.d }));
  }

  function updateCipher() {
    const c = candlesRef.current;
    if (c.length === 0 || !cipherWt1Ref.current) return;
    const cfg = configRef.current;

    const wt = wavetrend(c, cfg.wtChannelLen, cfg.wtAverageLen, cfg.wtMALen);
    const mfi = mfiArea(c, cfg.mfiPeriod, cfg.mfiMultiplier, cfg.cipherMfiYPos);
    const sr = stochRsi(
      c,
      cfg.cipherStochLen,
      cfg.cipherStochRsiLen,
      cfg.cipherStochSmoothK,
      cfg.cipherStochSmoothD,
      cfg.cipherStochUseLog,
    );
    const rsiVals = rsi(c, cfg.cipherRsiLen);

    cipherWt1Ref.current.setData(
      wt.map((p) => ({ time: p.time as UTCTimestamp, value: p.wt1 })),
    );
    cipherWt2Ref.current?.setData(
      wt.map((p) => ({ time: p.time as UTCTimestamp, value: p.wt2 })),
    );
    cipherVwapRef.current?.setData(
      wt.map((p) => ({ time: p.time as UTCTimestamp, value: p.vwap })),
    );
    cipherMfiRef.current?.setData(
      mfi.map((p) => ({
        time: p.time as UTCTimestamp,
        value: p.value,
      })),
    );
    // Stoch K/D — keep native 0..100 scale (the pane auto-scales to fit -100..+100 from WT)
    cipherStochKRef.current?.setData(
      sr.map((p) => ({
        time: p.time as UTCTimestamp,
        value: cfg.cipherStochUseAvg ? (p.k + p.d) / 2 : p.k,
      })),
    );
    cipherStochDRef.current?.setData(
      sr.map((p) => ({ time: p.time as UTCTimestamp, value: p.d })),
    );
    // K/D fill — only where K >= D (Pine logic) — render K and clip the rest via D-baseline
    cipherStochFillRef.current?.setData(
      sr.map((p) => ({
        time: p.time as UTCTimestamp,
        value: Math.max(p.k, p.d),
      })),
    );
    // RSI line
    cipherRsiRef.current?.setData(
      rsiVals.map((p) => ({ time: p.time as UTCTimestamp, value: p.value })),
    );

    // OB/OS dashed horizontal lines
    if (wt.length > 0) {
      const first = wt[0].time as UTCTimestamp;
      const last = wt[wt.length - 1].time as UTCTimestamp;
      cipherObRef.current?.setData([
        { time: first, value: cfg.wtObLevel },
        { time: last, value: cfg.wtObLevel },
      ]);
      cipherOb2Ref.current?.setData([
        { time: first, value: cfg.wtObLevel2 },
        { time: last, value: cfg.wtObLevel2 },
      ]);
      cipherOb3Ref.current?.setData([
        { time: first, value: cfg.wtObLevel3 },
        { time: last, value: cfg.wtObLevel3 },
      ]);
      cipherOsRef.current?.setData([
        { time: first, value: cfg.wtOsLevel },
        { time: last, value: cfg.wtOsLevel },
      ]);
      cipherOs2Ref.current?.setData([
        { time: first, value: cfg.wtOsLevel2 },
        { time: last, value: cfg.wtOsLevel2 },
      ]);
      cipherOs3Ref.current?.setData([
        { time: first, value: cfg.wtOsLevel3 },
        { time: last, value: cfg.wtOsLevel3 },
      ]);
      cipherZeroRef.current?.setData([
        { time: first, value: 0 },
        { time: last, value: 0 },
      ]);
    }

    // Divergences — render each set as discontinuous line segments
    // (a segment per pair of consecutive divergent fractals).
    const wtPoints: IndicatorPoint[] = wt.map((p) => ({
      time: p.time,
      value: p.wt2,
    }));
    const stochPoints: IndicatorPoint[] = sr.map((p) => ({
      time: p.time,
      value: p.k,
    }));
    const hiddenObLimit = cfg.cipherNotApplyOBOSOnHidden
      ? null
      : cfg.cipherWtDivOBLevel;
    const hiddenOsLimit = cfg.cipherNotApplyOBOSOnHidden
      ? null
      : cfg.cipherWtDivOSLevel;
    const wtDivs = findDivergences(
      wtPoints,
      c,
      cfg.cipherWtDivOBLevel,
      cfg.cipherWtDivOSLevel,
    );
    const wtDivs2 = findDivergences(
      wtPoints,
      c,
      cfg.cipherWtDivOBLevel2,
      cfg.cipherWtDivOSLevel2,
    );
    const wtDivsHidden = findDivergences(
      wtPoints,
      c,
      hiddenObLimit,
      hiddenOsLimit,
    );
    const rsiDivs = findDivergences(
      rsiVals,
      c,
      cfg.cipherRsiDivOBLevel,
      cfg.cipherRsiDivOSLevel,
    );
    const rsiDivsHidden = findDivergences(
      rsiVals,
      c,
      cfg.cipherNotApplyOBOSOnHidden ? null : cfg.cipherRsiDivOBLevel,
      cfg.cipherNotApplyOBOSOnHidden ? null : cfg.cipherRsiDivOSLevel,
    );
    const stochDivs = findDivergences(stochPoints, c, null, null);

    // Convert segments to a discontinuous LineSeries dataset (whitespace gaps).
    const segmentsToLineData = (
      segs: DivergenceSegment[],
      filterKind: DivergenceSegment["kind"][],
    ) => {
      const filtered = segs
        .filter((s) => filterKind.includes(s.kind))
        .sort((a, b) => a.fromTime - b.fromTime);
      const data: Array<
        { time: UTCTimestamp; value: number } | { time: UTCTimestamp }
      > = [];
      let lastTime = -Infinity;
      for (const s of filtered) {
        // ensure strictly increasing times; skip overlapping segments
        if (s.fromTime <= lastTime) continue;
        data.push({ time: s.fromTime as UTCTimestamp, value: s.fromValue });
        data.push({ time: s.toTime as UTCTimestamp, value: s.toValue });
        lastTime = s.toTime;
      }
      return data;
    };

    wtBearDivRef.current?.setData(
      segmentsToLineData(wtDivs, ["bearRegular"]) as never,
    );
    wtBullDivRef.current?.setData(
      segmentsToLineData(wtDivs, ["bullRegular"]) as never,
    );
    wtBearHidDivRef.current?.setData(
      segmentsToLineData(wtDivsHidden, ["bearHidden"]) as never,
    );
    wtBullHidDivRef.current?.setData(
      segmentsToLineData(wtDivsHidden, ["bullHidden"]) as never,
    );
    wtBearDiv2Ref.current?.setData(
      segmentsToLineData(wtDivs2, ["bearRegular"]) as never,
    );
    wtBullDiv2Ref.current?.setData(
      segmentsToLineData(wtDivs2, ["bullRegular"]) as never,
    );
    rsiBearDivRef.current?.setData(
      segmentsToLineData(rsiDivs, ["bearRegular"]) as never,
    );
    rsiBullDivRef.current?.setData(
      segmentsToLineData(rsiDivs, ["bullRegular"]) as never,
    );
    rsiBearHidDivRef.current?.setData(
      segmentsToLineData(rsiDivsHidden, ["bearHidden"]) as never,
    );
    rsiBullHidDivRef.current?.setData(
      segmentsToLineData(rsiDivsHidden, ["bullHidden"]) as never,
    );
    stochBearDivRef.current?.setData(
      segmentsToLineData(stochDivs, ["bearRegular"]) as never,
    );
    stochBullDivRef.current?.setData(
      segmentsToLineData(stochDivs, ["bullRegular"]) as never,
    );

    // Markers — crosses + buy/sell/gold circles, placed at wt2 in the cipher pane
    if (cipherMarkersRef.current) {
      const rsiByTime = new Map(rsiVals.map((p) => [p.time, p.value]));
      // Divergence buy/sell circles: when ANY enabled divergence ends at this pivot
      const bullDivAtTime = new Set<number>();
      const bearDivAtTime = new Set<number>();
      if (cfg.cipherShowDivDots) {
        if (cfg.cipherShowWTDivergences) {
          for (const s of wtDivs) {
            if (s.kind === "bullRegular") bullDivAtTime.add(s.toTime);
            else if (s.kind === "bearRegular") bearDivAtTime.add(s.toTime);
          }
        }
        if (cfg.cipherShowWTDivergences2) {
          for (const s of wtDivs2) {
            if (s.kind === "bullRegular") bullDivAtTime.add(s.toTime);
            else if (s.kind === "bearRegular") bearDivAtTime.add(s.toTime);
          }
        }
        if (cfg.cipherShowRSIDivergences) {
          for (const s of rsiDivs) {
            if (s.kind === "bullRegular") bullDivAtTime.add(s.toTime);
            else if (s.kind === "bearRegular") bearDivAtTime.add(s.toTime);
          }
        }
      }
      const markers: SeriesMarker<Time>[] = [];
      // First: divergence circles placed at pivot times (offset -2 from detection)
      const wtByTime = new Map(wt.map((p) => [p.time, p.wt2]));
      for (const t of bullDivAtTime) {
        const oscVal = wtByTime.get(t);
        if (oscVal === undefined) continue;
        markers.push({
          time: t as UTCTimestamp,
          position: "atPriceMiddle",
          price: oscVal,
          color: "#3fff00",
          shape: "circle",
          size: 3,
        });
      }
      for (const t of bearDivAtTime) {
        const oscVal = wtByTime.get(t);
        if (oscVal === undefined) continue;
        markers.push({
          time: t as UTCTimestamp,
          position: "atPriceMiddle",
          price: oscVal,
          color: "#ff0000",
          shape: "circle",
          size: 3,
        });
      }
      for (let i = 1; i < wt.length; i++) {
        const prev = wt[i - 1];
        const cur = wt[i];
        const crossUp = prev.wt1 <= prev.wt2 && cur.wt1 > cur.wt2;
        const crossDown = prev.wt1 >= prev.wt2 && cur.wt1 < cur.wt2;
        if (!crossUp && !crossDown) continue;
        const isOversold = cur.wt2 <= cfg.wtOsLevel;
        const isOverbought = cur.wt2 >= cfg.wtObLevel;
        const rsiHere = rsiByTime.get(cur.time);
        // Gold buy — oversold extreme cross-up with RSI < 30
        if (
          cfg.cipherShowGoldDots &&
          crossUp &&
          rsiHere !== undefined &&
          rsiHere < 30 &&
          prev.wt2 <= cfg.wtOsLevel3 &&
          cur.wt2 - prev.wt2 >= 0 &&
          cur.wt2 > cfg.wtOsLevel3 - 5
        ) {
          markers.push({
            time: cur.time as UTCTimestamp,
            position: "atPriceMiddle",
            price: cur.wt2,
            color: "#e2a400",
            shape: "circle",
            size: 2,
          });
          continue;
        }
        if (cfg.cipherShowBuyDots && crossUp && isOversold) {
          markers.push({
            time: cur.time as UTCTimestamp,
            position: "atPriceMiddle",
            price: cur.wt2,
            color: "#3fff00",
            shape: "circle",
            size: 2,
          });
        } else if (cfg.cipherShowSellDots && crossDown && isOverbought) {
          markers.push({
            time: cur.time as UTCTimestamp,
            position: "atPriceMiddle",
            price: cur.wt2,
            color: "#ff0000",
            shape: "circle",
            size: 2,
          });
        } else if (cfg.cipherShowCrossDots) {
          // small neutral cross marker
          markers.push({
            time: cur.time as UTCTimestamp,
            position: "atPriceMiddle",
            price: cur.wt2,
            color: crossUp ? "#00e676" : "#ff5252",
            shape: "circle",
            size: 1,
          });
        }
      }
      // ====== Sommi flag (needs higher-TF WaveTrend VWAP) ======
      if (cfg.cipherShowSommiFlag || cfg.cipherShowSommiFastWave) {
        const htfCandles = multiTFCandlesRef.current.sommiFlag;
        if (htfCandles.length > 0) {
          const htfWT = wavetrend(
            htfCandles,
            cfg.wtChannelLen,
            cfg.wtAverageLen,
            cfg.wtMALen,
          );
          // EMA(htfVwap, 3) — replicates plot(ema(hvwap, 3)) from Pine
          const hVwapCandles: Candle[] = htfWT.map((p) => ({
            time: p.time,
            open: p.vwap,
            high: p.vwap,
            low: p.vwap,
            close: p.vwap,
            volume: 0,
          }));
          const hVwapSmoothed = ema(hVwapCandles, 3);
          if (cfg.cipherShowSommiFastWave) {
            cipherSommiHVwapRef.current?.setData(
              hVwapSmoothed.map((p) => ({
                time: p.time as UTCTimestamp,
                value: p.value,
              })),
            );
          } else {
            cipherSommiHVwapRef.current?.setData([]);
          }
          // Map current bar -> htf vwap by aligning to most-recent htf bar
          const htfVwapByTime = new Map(
            htfWT.map((p) => [p.time, p.vwap] as const),
          );
          const htfTimes = htfWT.map((p) => p.time);
          const findHtfVwap = (t: number): number | undefined => {
            // pick the latest htf time <= t (HTF bar containing or preceding `t`)
            let lo = 0;
            let hi = htfTimes.length - 1;
            let res = -1;
            while (lo <= hi) {
              const mid = (lo + hi) >> 1;
              if (htfTimes[mid] <= t) {
                res = mid;
                lo = mid + 1;
              } else hi = mid - 1;
            }
            if (res < 0) return undefined;
            return htfVwapByTime.get(htfTimes[res]);
          };
          if (cfg.cipherShowSommiFlag) {
            for (let i = 1; i < wt.length; i++) {
              const prev = wt[i - 1];
              const cur = wt[i];
              const crossDown = prev.wt1 >= prev.wt2 && cur.wt1 < cur.wt2;
              const crossUp = prev.wt1 <= prev.wt2 && cur.wt1 > cur.wt2;
              if (!crossDown && !crossUp) continue;
              const rmfi = mfi.find((p) => p.time === cur.time)?.value ?? 0;
              const hVwap = findHtfVwap(cur.time) ?? 0;
              const bear =
                crossDown &&
                rmfi < cfg.cipherSommiRSIMFIBearLevel &&
                cur.wt2 > cfg.cipherSommiFlagWTBearLevel &&
                hVwap < cfg.cipherSommiVwapBearLevel;
              const bull =
                crossUp &&
                rmfi > cfg.cipherSommiRSIMFIBullLevel &&
                cur.wt2 < cfg.cipherSommiFlagWTBullLevel &&
                hVwap > cfg.cipherSommiVwapBullLevel;
              if (bear) {
                markers.push({
                  time: cur.time as UTCTimestamp,
                  position: "aboveBar",
                  color: "#ff00f0",
                  shape: "arrowDown",
                  size: 2,
                  text: "F",
                });
              } else if (bull) {
                markers.push({
                  time: cur.time as UTCTimestamp,
                  position: "belowBar",
                  color: "#31c0ff",
                  shape: "arrowUp",
                  size: 2,
                  text: "F",
                });
              }
            }
          }
        }
      } else {
        cipherSommiHVwapRef.current?.setData([]);
      }

      // ====== Sommi diamond (needs HA on 2 higher TFs) ======
      if (cfg.cipherShowSommiDiamond) {
        const htc1 = heikinAshi(multiTFCandlesRef.current.sommiHTC1);
        const htc2 = heikinAshi(multiTFCandlesRef.current.sommiHTC2);
        const lastBodyDir = (arr: Candle[], t: number): boolean | null => {
          // Find most recent HA candle at or before t and return close>open
          let lo = 0;
          let hi = arr.length - 1;
          let res = -1;
          while (lo <= hi) {
            const mid = (lo + hi) >> 1;
            if (arr[mid].time <= t) {
              res = mid;
              lo = mid + 1;
            } else hi = mid - 1;
          }
          if (res < 0) return null;
          return arr[res].close > arr[res].open;
        };
        for (let i = 1; i < wt.length; i++) {
          const prev = wt[i - 1];
          const cur = wt[i];
          const crossDown = prev.wt1 >= prev.wt2 && cur.wt1 < cur.wt2;
          const crossUp = prev.wt1 <= prev.wt2 && cur.wt1 > cur.wt2;
          if (!crossDown && !crossUp) continue;
          const d1 = lastBodyDir(htc1, cur.time);
          const d2 = lastBodyDir(htc2, cur.time);
          if (d1 === null || d2 === null) continue;
          const bear =
            crossDown &&
            cur.wt2 >= cfg.cipherSommiDiamondWTBearLevel &&
            !d1 &&
            !d2;
          const bull =
            crossUp &&
            cur.wt2 <= cfg.cipherSommiDiamondWTBullLevel &&
            d1 &&
            d2;
          if (bear) {
            markers.push({
              time: cur.time as UTCTimestamp,
              position: "aboveBar",
              color: "#ff00f0",
              shape: "square",
              size: 2,
              text: "D",
            });
          } else if (bull) {
            markers.push({
              time: cur.time as UTCTimestamp,
              position: "belowBar",
              color: "#31c0ff",
              shape: "square",
              size: 2,
              text: "D",
            });
          }
        }
      }

      cipherMarkersRef.current.setMarkers(markers);
    }

    // ====== Schaff Trend Cycle ======
    if (cfg.cipherShowSchaff) {
      const stc = schaffTC(
        c,
        cfg.cipherSchaffLength,
        cfg.cipherSchaffFast,
        cfg.cipherSchaffSlow,
        cfg.cipherSchaffFactor,
      );
      cipherSchaffRef.current?.setData(
        stc.map((p) => ({ time: p.time as UTCTimestamp, value: p.value })),
      );
    } else {
      cipherSchaffRef.current?.setData([]);
    }

    // ====== MACD Colors override (global tint on WT areas) ======
    // Pine does per-bar colors; lightweight-charts AreaSeries is single-color,
    // so we override the global color according to the *current* macd/mfi regime.
    if (cfg.cipherShowMacdColors) {
      const htf = multiTFCandlesRef.current.macdColors;
      if (htf.length > 0) {
        const hmfi = mfiArea(
          htf,
          cfg.mfiPeriod,
          cfg.mfiMultiplier,
          cfg.cipherMfiYPos,
        );
        const hmacd = macd(htf, 28, 42, 9);
        const lastM = hmacd.at(-1);
        const lastMf = hmfi.at(-1);
        if (lastM && lastMf) {
          const macdUp = lastM.macd >= lastM.signal;
          const mfiPos = lastMf.value > 0;
          const wt1Color = macdUp
            ? mfiPos
              ? "#7ee57e"
              : "#4caf58"
            : mfiPos
              ? "#132213"
              : "#af4c4c";
          const wt2Color = macdUp
            ? mfiPos
              ? "#305630"
              : "#310101"
            : mfiPos
              ? "#132213"
              : "#770000";
          cipherWt1Ref.current?.applyOptions({
            topFillColor1: `${wt1Color}BF`,
            topFillColor2: `${wt1Color}30`,
            topLineColor: wt1Color,
            bottomFillColor1: `${wt1Color}30`,
            bottomFillColor2: `${wt1Color}BF`,
            bottomLineColor: wt1Color,
          });
          cipherWt2Ref.current?.applyOptions({
            topFillColor1: `${wt2Color}BF`,
            topFillColor2: `${wt2Color}50`,
            topLineColor: wt2Color,
            bottomFillColor1: `${wt2Color}50`,
            bottomFillColor2: `${wt2Color}BF`,
            bottomLineColor: wt2Color,
          });
        }
      }
    } else {
      // Reset to Pine defaults
      cipherWt1Ref.current?.applyOptions({
        topFillColor1: "#4994ecB3",
        topFillColor2: "#4994ec30",
        topLineColor: "#4994ec",
        bottomFillColor1: "#4994ec30",
        bottomFillColor2: "#4994ecB3",
        bottomLineColor: "#4994ec",
      });
      cipherWt2Ref.current?.applyOptions({
        topFillColor1: "#1f1559BF",
        topFillColor2: "#1f155950",
        topLineColor: "#1f1559",
        bottomFillColor1: "#1f155950",
        bottomFillColor2: "#1f1559BF",
        bottomLineColor: "#1f1559",
      });
    }

    const last = wt.at(-1);
    const lastMfi = mfi.at(-1)?.value;
    const lastSr = sr.at(-1);
    setLastValues((prev) => ({
      ...prev,
      cipherWt1: last?.wt1,
      cipherWt2: last?.wt2,
      cipherMfi: lastMfi,
      cipherStochK: lastSr?.k,
      cipherStochD: lastSr?.d,
    }));
  }

  function updateMACD() {
    const c = candlesRef.current;
    if (c.length === 0 || !macdRef.current) return;
    const cfg = configRef.current;
    const m = macd(c, cfg.macdFast, cfg.macdSlow, cfg.macdSignal);
    macdRef.current.setData(
      m.map((p) => ({ time: p.time as UTCTimestamp, value: p.macd })),
    );
    macdSignalRef.current?.setData(
      m.map((p) => ({ time: p.time as UTCTimestamp, value: p.signal })),
    );
    macdHistRef.current?.setData(
      m.map((p) => ({
        time: p.time as UTCTimestamp,
        value: p.histogram,
        color: p.histogram >= 0 ? `${TV_COLORS.green}80` : `${TV_COLORS.red}80`,
      })),
    );
    const last = m.at(-1);
    setLastValues((prev) => ({
      ...prev,
      macd: last?.macd,
      macdSignal: last?.signal,
      macdHist: last?.histogram,
    }));
  }

  // Load historical data + subscribe live
  useEffect(() => {
    let unsub: (() => void) | null = null;
    let cancelled = false;

    // Vuelca un set de velas al chart (velas + volumen). Se usa dos veces:
    // una con lo cacheado (instantáneo) y otra con lo que llega de la API.
    function paint(klines: Candle[]) {
      candlesRef.current = klines;
      if (candleSeriesRef.current) {
        candleSeriesRef.current.setData(
          klines.map((k) => ({
            time: k.time as UTCTimestamp,
            open: k.open,
            high: k.high,
            low: k.low,
            close: k.close,
          })),
        );
      }
      if (volumeSeriesRef.current) {
        volumeSeriesRef.current.setData(
          klines.map((k) => ({
            time: k.time as UTCTimestamp,
            value: k.volume,
            color:
              k.close >= k.open ? `${TV_COLORS.green}66` : `${TV_COLORS.red}66`,
          })),
        );
      }
    }

    async function load() {
      setChartLoading(true);
      try {
        const { adapter, symbol: rawSymbol } = getAdapter(symbol);

        // Pintado optimista desde localStorage: el chart aparece en el primer
        // frame en vez de esperar el round-trip completo a la API.
        const cached = readCandleCache(symbol, timeframe);
        if (cached && cached.length > 0 && !cancelled) {
          paint(cached);
          chartRef.current?.timeScale().fitContent();
        }

        const klines = await adapter.fetchKlines(rawSymbol, timeframe, 1000);
        if (cancelled) return;
        paint(klines);
        writeCandleCache(symbol, timeframe, klines);
        // Pintamos velas + EMAs y recién en el frame siguiente calculamos
        // los osciladores pesados: el chart aparece sin esperar al cómputo.
        chartRef.current?.timeScale().fitContent();
        updateEMAs();
        requestAnimationFrame(() => {
          if (cancelled) return;
          updateRSI();
          updateMACD();
          updateBB();
          updateVWAP();
          updateGLI();
          updateStochastic();
          updateStochRsi();
          updateCipher();
          // Recién acá encuadramos: fitContent() mira TODAS las series, y si
          // corre antes de recalcular los indicadores todavía quedan puntos
          // de la temporalidad anterior en la escala de tiempo. Eso dejaba el
          // gráfico comprimido contra la derecha al cambiar de temporalidad.
          chartRef.current?.timeScale().fitContent();
          requestAnimationFrame(() => recomputePaneOffsets());
        });

        if (klines.length > 0) {
          const last = klines[klines.length - 1];
          const prev = klines[klines.length - 2] ?? last;
          setLastPrice({
            value: last.close,
            pct: prev.close === 0 ? 0 : ((last.close - prev.close) / prev.close) * 100,
          });
        }

        unsub = adapter.subscribeKline({
          symbol: rawSymbol,
          interval: timeframe,
          onCandle: (k) => {
            if (!candleSeriesRef.current) return;
            const arr = candlesRef.current;
            const lastCandle = arr[arr.length - 1];
            if (lastCandle && lastCandle.time === k.time) {
              arr[arr.length - 1] = k;
            } else if (!lastCandle || k.time > lastCandle.time) {
              arr.push(k);
              if (arr.length > 2000) arr.shift();
            } else {
              return;
            }
            candleSeriesRef.current.update({
              time: k.time as UTCTimestamp,
              open: k.open,
              high: k.high,
              low: k.low,
              close: k.close,
            });
            if (volumeSeriesRef.current) {
              volumeSeriesRef.current.update({
                time: k.time as UTCTimestamp,
                value: k.volume,
                color: k.close >= k.open ? `${TV_COLORS.green}66` : `${TV_COLORS.red}66`,
              });
            }
            updateEMAs();
            updateRSI();
            updateMACD();
            scheduleHeavyUpdate();
            const prev = arr[arr.length - 2] ?? lastCandle;
            setLastPrice({
              value: k.close,
              pct: prev && prev.close !== 0 ? ((k.close - prev.close) / prev.close) * 100 : 0,
            });
          },
        });
      } catch (e) {
        console.error("Failed to load chart data:", e);
      } finally {
        if (!cancelled) setChartLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
      if (unsub) unsub();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, timeframe, refreshNonce]);

  // Recuperación automática: al volver a la pestaña (o al recuperar la red)
  // el navegador pudo haber frenado el WebSocket y quedan velas sin llegar.
  // Si el último dato está viejo para la temporalidad, se recarga solo.
  useEffect(() => {
    const stale = () => {
      const arr = candlesRef.current;
      if (arr.length === 0) return true;
      const step = TIMEFRAME_SECONDS[timeframe] ?? 900;
      const edad = Date.now() / 1000 - arr[arr.length - 1].time;
      return edad > step * 1.5;
    };
    const revisar = () => {
      if (document.visibilityState !== "visible") return;
      reconnectAllBinanceWS();
      if (stale()) refreshChart();
    };
    document.addEventListener("visibilitychange", revisar);
    window.addEventListener("online", revisar);
    return () => {
      document.removeEventListener("visibilitychange", revisar);
      window.removeEventListener("online", revisar);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeframe]);

  const greenOrRed = (n: number) =>
    n >= 0 ? "text-tv-green" : "text-tv-red";

  // Helpers for pill rendering
  const isShown = (key: IndicatorKey) =>
    indicators[key] && (key === "volume" || true); // always renderable if enabled
  void isShown;

  // Determine which pane each indicator lives in (based on current layout)
  const rsiPaneIdx = 1;
  const macdPaneIdx = indicators.rsi ? 2 : 1;
  const stochPaneIdx =
    1 + (indicators.rsi ? 1 : 0) + (indicators.macd ? 1 : 0);
  const cipherPaneIdx =
    1 +
    (indicators.rsi ? 1 : 0) +
    (indicators.macd ? 1 : 0) +
    (indicators.stoch ? 1 : 0);
  const srsiPaneIdx =
    1 +
    (indicators.rsi ? 1 : 0) +
    (indicators.macd ? 1 : 0) +
    (indicators.stoch ? 1 : 0) +
    (indicators.cipher ? 1 : 0);

  let measureRender: React.ReactNode = null;
  if (
    measure.a &&
    measure.b &&
    chartRef.current &&
    candleSeriesRef.current
  ) {
    const ts = chartRef.current.timeScale();
    const aX = ts.timeToCoordinate(measure.a.time as UTCTimestamp);
    const bX = ts.timeToCoordinate(measure.b.time as UTCTimestamp);
    const aY = candleSeriesRef.current.priceToCoordinate(measure.a.price);
    const bY = candleSeriesRef.current.priceToCoordinate(measure.b.price);

    if (aX !== null && bX !== null && aY !== null && bY !== null) {
      const priceDiff = measure.b.price - measure.a.price;
      const pctChange =
        measure.a.price === 0 ? 0 : (priceDiff / measure.a.price) * 100;
      const isUp = priceDiff >= 0;
      const start = Math.min(measure.a.time, measure.b.time);
      const end = Math.max(measure.a.time, measure.b.time);
      const inRange = candlesRef.current.filter(
        (c) => c.time >= start && c.time <= end,
      );
      const bars = inRange.length;
      const volume = inRange.reduce((s, c) => s + c.volume, 0);
      const dur = durationLabel(measure.a.time, measure.b.time);

      measureRender = (
        <MeasureOverlay
          aX={aX}
          aY={aY}
          bX={bX}
          bY={bY}
          priceDiff={priceDiff}
          pctChange={pctChange}
          bars={bars}
          volume={volume}
          durationText={dur}
          isUp={isUp}
          isPreview={measure.phase === "placing"}
        />
      );
    }
  }
  void renderTick;

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />
      {measureRender}

      {/* Top-left of main pane: symbol info + OHLC + Volume pill + EMA pills */}
      <div
        style={{ top: (paneOffsets[0]?.top ?? 0) + 12, left: 12 }}
        className="pointer-events-none absolute z-10 flex flex-col gap-1 text-xs tabular-nums"
      >
        {/* Row 1: symbol info + OHLC stats inline on hover (fixed height, never wraps) */}
        <div className="flex h-5 flex-nowrap items-center gap-x-3 overflow-hidden whitespace-nowrap">
          <div className="flex shrink-0 items-center gap-2 text-[13px] font-semibold">
            <span className="text-tv-text">{parseSymbol(symbol).symbol}</span>
            <span className="text-tv-text-muted">·</span>
            <span className="uppercase text-tv-text-muted">{timeframe}</span>
            <span className="text-tv-text-muted">·</span>
            <span className="text-tv-text-muted">
              {getAdapter(symbol).adapter.name}
            </span>
          </div>
          {hover && (
            <div className="flex items-center gap-x-3 text-[11px]">
              <span className="text-tv-text-muted">
                O <span className={greenOrRed(hover.c - hover.o)}>{formatPrice(hover.o)}</span>
              </span>
              <span className="text-tv-text-muted">
                H <span className={greenOrRed(hover.c - hover.o)}>{formatPrice(hover.h)}</span>
              </span>
              <span className="text-tv-text-muted">
                L <span className={greenOrRed(hover.c - hover.o)}>{formatPrice(hover.l)}</span>
              </span>
              <span className="text-tv-text-muted">
                C <span className={greenOrRed(hover.c - hover.o)}>{formatPrice(hover.c)}</span>
              </span>
              <span className={greenOrRed(hover.pct)}>
                {hover.pct >= 0 ? "+" : ""}
                {hover.pct.toFixed(2)}%
              </span>
              <span className="text-tv-text-muted">
                Vol <span className="text-tv-text">{formatVolume(hover.v)}</span>
              </span>
            </div>
          )}
        </div>

        {/* Row 2: big live price (always present — reserves space even while loading) */}
        <div className="flex h-7 items-center gap-2">
          {lastPrice ? (
            <>
              <span className={`text-lg font-semibold tabular-nums ${greenOrRed(lastPrice.pct)}`}>
                {formatPrice(lastPrice.value)}
              </span>
              <span className={`text-xs ${greenOrRed(lastPrice.pct)}`}>
                {lastPrice.pct >= 0 ? "+" : ""}
                {lastPrice.pct.toFixed(2)}%
              </span>
            </>
          ) : (
            <span className="text-xs text-tv-text-muted">Cargando…</span>
          )}
        </div>

        {/* Indicator pills for the main pane (fixed position below price) */}
        <div className="mt-1 flex flex-col items-start gap-1">
          {indicators.ema20 && (
            <IndicatorPill
              name={`EMA ${config.ema20}`}
              value={lastValues.ema20 !== undefined ? formatPrice(lastValues.ema20) : undefined}
              color={INDICATOR_COLORS.ema20}
              hidden={hidden.ema20}
              onToggleHide={() => toggleHidden("ema20")}
              onSettings={() => setSettingsTarget("ema20")}
              onRemove={() => removeIndicator("ema20")}
            />
          )}
          {indicators.ema50 && (
            <IndicatorPill
              name={`EMA ${config.ema50}`}
              value={lastValues.ema50 !== undefined ? formatPrice(lastValues.ema50) : undefined}
              color={INDICATOR_COLORS.ema50}
              hidden={hidden.ema50}
              onToggleHide={() => toggleHidden("ema50")}
              onSettings={() => setSettingsTarget("ema50")}
              onRemove={() => removeIndicator("ema50")}
            />
          )}
          {indicators.ema200 && (
            <IndicatorPill
              name={`EMA ${config.ema200}`}
              value={lastValues.ema200 !== undefined ? formatPrice(lastValues.ema200) : undefined}
              color={INDICATOR_COLORS.ema200}
              hidden={hidden.ema200}
              onToggleHide={() => toggleHidden("ema200")}
              onSettings={() => setSettingsTarget("ema200")}
              onRemove={() => removeIndicator("ema200")}
            />
          )}
          {indicators.volume && (
            <IndicatorPill
              name="Vol"
              value={lastValues.volume !== undefined ? formatVolume(lastValues.volume) : undefined}
              color={INDICATOR_COLORS.volume}
              hidden={hidden.volume}
              onToggleHide={() => toggleHidden("volume")}
              onSettings={() => setSettingsTarget("volume")}
              onRemove={() => removeIndicator("volume")}
            />
          )}
          {indicators.bb && (
            <IndicatorPill
              name={`BB ${config.bbPeriod}, ${config.bbStdDev}`}
              value={
                lastValues.bbMiddle !== undefined
                  ? `${formatPrice(lastValues.bbLower ?? 0)} · ${formatPrice(lastValues.bbMiddle)} · ${formatPrice(lastValues.bbUpper ?? 0)}`
                  : undefined
              }
              color={INDICATOR_COLORS.bb}
              hidden={hidden.bb}
              onToggleHide={() => toggleHidden("bb")}
              onSettings={() => setSettingsTarget("bb")}
              onRemove={() => removeIndicator("bb")}
            />
          )}
          {indicators.vwap && (
            <IndicatorPill
              name={`VWAP ${VWAP_ANCHOR_LABELS[config.vwapAnchor] ?? config.vwapAnchor}`}
              value={
                lastValues.vwap !== undefined
                  ? [
                      formatPrice(lastValues.vwap),
                      ...(
                        [
                          config.vwapShowBand1,
                          config.vwapShowBand2,
                          config.vwapShowBand3,
                        ]
                          .map((on, i) =>
                            on && lastValues.vwapBands?.[i]
                              ? `${formatPrice(lastValues.vwapBands[i][0])}/${formatPrice(lastValues.vwapBands[i][1])}`
                              : null,
                          )
                          .filter(Boolean) as string[]
                      ),
                    ].join("  ·  ")
                  : undefined
              }
              color={INDICATOR_COLORS.vwap}
              hidden={hidden.vwap}
              onToggleHide={() => toggleHidden("vwap")}
              onSettings={() => setSettingsTarget("vwap")}
              onRemove={() => removeIndicator("vwap")}
            />
          )}
          {indicators.gli && (
            <IndicatorPill
              name="Global M2"
              value={
                lastValues.gli !== undefined
                  ? `$${lastValues.gli.toFixed(1)}T`
                  : undefined
              }
              color={INDICATOR_COLORS.gli}
              hidden={hidden.gli}
              onToggleHide={() => toggleHidden("gli")}
              onSettings={() => setSettingsTarget("gli")}
              onRemove={() => removeIndicator("gli")}
            />
          )}
        </div>
      </div>

      {/* RSI pane label */}
      {indicators.rsi && paneOffsets[rsiPaneIdx] && (
        <div
          style={{ top: paneOffsets[rsiPaneIdx].top + 6, left: 12 }}
          className="pointer-events-none absolute z-10"
        >
          <IndicatorPill
            name={`RSI ${config.rsi}`}
            value={lastValues.rsi !== undefined ? lastValues.rsi.toFixed(2) : undefined}
            color={INDICATOR_COLORS.rsi}
            hidden={hidden.rsi}
            onToggleHide={() => toggleHidden("rsi")}
            onSettings={() => setSettingsTarget("rsi")}
            onRemove={() => removeIndicator("rsi")}
          />
        </div>
      )}

      {/* MACD pane label */}
      {indicators.macd && paneOffsets[macdPaneIdx] && (
        <div
          style={{ top: paneOffsets[macdPaneIdx].top + 6, left: 12 }}
          className="pointer-events-none absolute z-10"
        >
          <IndicatorPill
            name={`MACD ${config.macdFast}, ${config.macdSlow}, ${config.macdSignal}`}
            value={
              lastValues.macd !== undefined
                ? `${lastValues.macd.toFixed(2)} / ${(lastValues.macdSignal ?? 0).toFixed(2)}`
                : undefined
            }
            color={INDICATOR_COLORS.macd}
            hidden={hidden.macd}
            onToggleHide={() => toggleHidden("macd")}
            onSettings={() => setSettingsTarget("macd")}
            onRemove={() => removeIndicator("macd")}
          />
        </div>
      )}

      {/* Cipher B pane label */}
      {indicators.cipher && paneOffsets[cipherPaneIdx] && (
        <div
          style={{ top: paneOffsets[cipherPaneIdx].top + 6, left: 12 }}
          className="pointer-events-none absolute z-10"
        >
          <IndicatorPill
            name="Cipher B"
            value={
              lastValues.cipherWt2 !== undefined
                ? `WT ${lastValues.cipherWt2.toFixed(1)} · MFI ${(lastValues.cipherMfi ?? 0).toFixed(1)}`
                : undefined
            }
            color={INDICATOR_COLORS.cipher}
            hidden={hidden.cipher}
            onToggleHide={() => toggleHidden("cipher")}
            onSettings={() => setSettingsTarget("cipher")}
            onRemove={() => removeIndicator("cipher")}
          />
        </div>
      )}

      {/* Stochastic pane label */}
      {indicators.stoch && paneOffsets[stochPaneIdx] && (
        <div
          style={{ top: paneOffsets[stochPaneIdx].top + 6, left: 12 }}
          className="pointer-events-none absolute z-10"
        >
          <IndicatorPill
            name={`Stoch ${config.stochK}, ${config.stochD}, ${config.stochSmooth}`}
            value={
              lastValues.stochK !== undefined
                ? `${lastValues.stochK.toFixed(2)} / ${(lastValues.stochD ?? 0).toFixed(2)}`
                : undefined
            }
            color={INDICATOR_COLORS.stoch}
            hidden={hidden.stoch}
            onToggleHide={() => toggleHidden("stoch")}
            onSettings={() => setSettingsTarget("stoch")}
            onRemove={() => removeIndicator("stoch")}
          />
        </div>
      )}

      {/* Stoch RSI pane label */}
      {indicators.srsi && paneOffsets[srsiPaneIdx] && (
        <div
          style={{ top: paneOffsets[srsiPaneIdx].top + 6, left: 12 }}
          className="pointer-events-none absolute z-10"
        >
          <IndicatorPill
            name={`Stoch RSI ${config.srsiK}, ${config.srsiD}, ${config.srsiRsiLen}, ${config.srsiStochLen}`}
            value={
              lastValues.srsiK !== undefined
                ? `${lastValues.srsiK.toFixed(2)} / ${(lastValues.srsiD ?? 0).toFixed(2)}`
                : undefined
            }
            color={INDICATOR_COLORS.srsi}
            hidden={hidden.srsi}
            onToggleHide={() => toggleHidden("srsi")}
            onSettings={() => setSettingsTarget("srsi")}
            onRemove={() => removeIndicator("srsi")}
          />
        </div>
      )}
    </div>
  );
}
