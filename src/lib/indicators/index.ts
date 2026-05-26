import type { Candle } from "@/lib/binance/types";
import gliRaw from "@/lib/data/global-m2.json";

export interface IndicatorPoint {
  time: number;
  value: number;
}

// --- Global Liquidity Index (GLI / Global M2) ---
// Monthly snapshots of US + EU + JP + CN M2 in USD trillions.
// Bundled as a static JSON; refresh with scripts/update-global-m2.mjs.

interface GliFile {
  source: string;
  unit: string;
  frequency: string;
  lastUpdated: string;
  data: [string, number][];
}

// Pre-parse once at module load: ISO date -> unix seconds (UTC).
const GLI_POINTS: IndicatorPoint[] = ((): IndicatorPoint[] => {
  const raw = gliRaw as unknown as GliFile;
  return raw.data
    .map(([date, value]) => ({
      time: Math.floor(
        new Date(`${date}T00:00:00Z`).getTime() / 1000,
      ),
      value,
    }))
    .filter((p) => Number.isFinite(p.time) && Number.isFinite(p.value))
    .sort((a, b) => a.time - b.time);
})();

export const GLI_META = {
  source: (gliRaw as unknown as GliFile).source,
  unit: (gliRaw as unknown as GliFile).unit,
  lastUpdated: (gliRaw as unknown as GliFile).lastUpdated,
};

/**
 * Global Liquidity Index (Global M2 in USD trillions).
 *
 * Interpolates the bundled monthly dataset to match each candle's timestamp
 * so the line renders smoothly on any timeframe (1m → 1W).
 *
 * For candle times outside the dataset's range the nearest boundary value
 * is used (so the line extends flat instead of disappearing).
 */
export function globalLiquidity(candles: Candle[]): IndicatorPoint[] {
  if (candles.length === 0 || GLI_POINTS.length === 0) return [];
  const out: IndicatorPoint[] = [];
  let j = 0;
  for (const c of candles) {
    while (
      j < GLI_POINTS.length - 1 &&
      GLI_POINTS[j + 1].time <= c.time
    ) {
      j++;
    }
    const a = GLI_POINTS[j];
    const b = GLI_POINTS[Math.min(j + 1, GLI_POINTS.length - 1)];
    let value: number;
    if (c.time <= a.time) {
      value = a.value;
    } else if (c.time >= b.time || a.time === b.time) {
      value = b.value;
    } else {
      const t = (c.time - a.time) / (b.time - a.time);
      value = a.value + (b.value - a.value) * t;
    }
    out.push({ time: c.time, value });
  }
  return out;
}

export interface MACDPoint {
  time: number;
  macd: number;
  signal: number;
  histogram: number;
}

export interface BollingerPoint {
  time: number;
  upper: number;
  middle: number;
  lower: number;
}

export interface StochasticPoint {
  time: number;
  k: number;
  d: number;
}

export interface WaveTrendPoint {
  time: number;
  wt1: number;
  wt2: number;
  vwap: number; // wt1 - wt2
}

export type DivergenceKind =
  | "bearRegular"
  | "bullRegular"
  | "bearHidden"
  | "bullHidden";

export interface DivergenceSegment {
  kind: DivergenceKind;
  fromTime: number;
  fromValue: number;
  toTime: number;
  toValue: number;
}

/**
 * Find regular + hidden divergences between an oscillator series and price.
 * Mirrors VuManChu's Pine logic:
 *   - Pivots are detected on `values` using a 5-bar fractal where the middle
 *     (offset -2) is the local extreme.
 *   - For a fresh top fractal, the previous top fractal is recalled and
 *     compared against the current one (osc + corresponding candle high).
 *     Bear regular: price made HH, osc made LH. Bear hidden: price LH, osc HH.
 *   - Bottom fractals analogous (with price low).
 *
 * `obLimit` / `osLimit` filter pivots by the oscillator value (set them to
 * `null` to disable the filter — equivalent to `useLimits = false` in Pine).
 *
 * Returns one segment per detected divergence, connecting the previous pivot
 * to the current pivot — ready to be plotted as discontinuous line segments.
 */
export function findDivergences(
  values: IndicatorPoint[],
  candles: Candle[],
  obLimit: number | null,
  osLimit: number | null,
): DivergenceSegment[] {
  const out: DivergenceSegment[] = [];
  if (values.length < 5) return out;
  // Align candles by time for fast lookup
  const highByTime = new Map<number, number>();
  const lowByTime = new Map<number, number>();
  for (const c of candles) {
    highByTime.set(c.time, c.high);
    lowByTime.set(c.time, c.low);
  }
  // Track the previous confirmed top / bottom pivot (osc value + candle high/low)
  let prevTop: { time: number; osc: number; price: number } | null = null;
  let prevBot: { time: number; osc: number; price: number } | null = null;
  for (let i = 4; i < values.length; i++) {
    const p0 = values[i - 4].value;
    const p1 = values[i - 3].value;
    const p2 = values[i - 2].value;
    const p3 = values[i - 1].value;
    const p4 = values[i].value;
    // Top fractal: p0 < p2 && p1 < p2 && p2 > p3 && p2 > p4
    const isTop = p0 < p2 && p1 < p2 && p2 > p3 && p2 > p4;
    const isBot = p0 > p2 && p1 > p2 && p2 < p3 && p2 < p4;
    if (isTop) {
      const pivot = values[i - 2];
      const passesLimit = obLimit === null || pivot.value >= obLimit;
      if (passesLimit) {
        const highHere = highByTime.get(pivot.time);
        if (highHere !== undefined && prevTop) {
          // Regular bear: HH price + LH osc
          if (highHere > prevTop.price && pivot.value < prevTop.osc) {
            out.push({
              kind: "bearRegular",
              fromTime: prevTop.time,
              fromValue: prevTop.osc,
              toTime: pivot.time,
              toValue: pivot.value,
            });
          }
          // Hidden bear: LH price + HH osc
          else if (highHere < prevTop.price && pivot.value > prevTop.osc) {
            out.push({
              kind: "bearHidden",
              fromTime: prevTop.time,
              fromValue: prevTop.osc,
              toTime: pivot.time,
              toValue: pivot.value,
            });
          }
        }
        if (highHere !== undefined) {
          prevTop = { time: pivot.time, osc: pivot.value, price: highHere };
        }
      }
    }
    if (isBot) {
      const pivot = values[i - 2];
      const passesLimit = osLimit === null || pivot.value <= osLimit;
      if (passesLimit) {
        const lowHere = lowByTime.get(pivot.time);
        if (lowHere !== undefined && prevBot) {
          // Regular bull: LL price + HL osc
          if (lowHere < prevBot.price && pivot.value > prevBot.osc) {
            out.push({
              kind: "bullRegular",
              fromTime: prevBot.time,
              fromValue: prevBot.osc,
              toTime: pivot.time,
              toValue: pivot.value,
            });
          }
          // Hidden bull: HL price + LL osc
          else if (lowHere > prevBot.price && pivot.value < prevBot.osc) {
            out.push({
              kind: "bullHidden",
              fromTime: prevBot.time,
              fromValue: prevBot.osc,
              toTime: pivot.time,
              toValue: pivot.value,
            });
          }
        }
        if (lowHere !== undefined) {
          prevBot = { time: pivot.time, osc: pivot.value, price: lowHere };
        }
      }
    }
  }
  return out;
}

/**
 * Simple Moving Average
 */
export function sma(candles: Candle[], period: number): IndicatorPoint[] {
  const out: IndicatorPoint[] = [];
  if (!Number.isFinite(period) || period < 1) return out;
  if (candles.length < period) return out;
  let sum = 0;
  for (let i = 0; i < candles.length; i++) {
    sum += candles[i].close;
    if (i >= period) sum -= candles[i - period].close;
    if (i >= period - 1) out.push({ time: candles[i].time, value: sum / period });
  }
  return out;
}

/**
 * Exponential Moving Average — seeded with SMA of first `period` candles.
 */
export function ema(candles: Candle[], period: number): IndicatorPoint[] {
  const out: IndicatorPoint[] = [];
  if (!Number.isFinite(period) || period < 1) return out;
  if (candles.length < period) return out;
  const k = 2 / (period + 1);
  let prev = 0;
  for (let i = 0; i < period; i++) prev += candles[i].close;
  prev /= period;
  out.push({ time: candles[period - 1].time, value: prev });
  for (let i = period; i < candles.length; i++) {
    prev = candles[i].close * k + prev * (1 - k);
    out.push({ time: candles[i].time, value: prev });
  }
  return out;
}

/**
 * RSI (Wilder) — period typically 14.
 */
export function rsi(candles: Candle[], period = 14): IndicatorPoint[] {
  const out: IndicatorPoint[] = [];
  if (candles.length <= period) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = candles[i].close - candles[i - 1].close;
    if (diff >= 0) gain += diff;
    else loss -= diff;
  }
  gain /= period;
  loss /= period;
  let rs = loss === 0 ? 100 : gain / loss;
  out.push({ time: candles[period].time, value: 100 - 100 / (1 + rs) });
  for (let i = period + 1; i < candles.length; i++) {
    const diff = candles[i].close - candles[i - 1].close;
    const g = diff > 0 ? diff : 0;
    const l = diff < 0 ? -diff : 0;
    gain = (gain * (period - 1) + g) / period;
    loss = (loss * (period - 1) + l) / period;
    rs = loss === 0 ? 100 : gain / loss;
    out.push({ time: candles[i].time, value: 100 - 100 / (1 + rs) });
  }
  return out;
}

/**
 * MACD — fast EMA, slow EMA, signal EMA of the MACD line.
 * Defaults: 12 / 26 / 9.
 */
export function macd(
  candles: Candle[],
  fast = 12,
  slow = 26,
  signal = 9,
): MACDPoint[] {
  if (candles.length < slow + signal) return [];
  const emaFast = ema(candles, fast);
  const emaSlow = ema(candles, slow);
  // align: emaSlow starts later
  const slowStartTime = emaSlow[0].time;
  const fastByTime = new Map(emaFast.map((p) => [p.time, p.value]));
  const macdLine: IndicatorPoint[] = [];
  for (const p of emaSlow) {
    const f = fastByTime.get(p.time);
    if (f !== undefined) macdLine.push({ time: p.time, value: f - p.value });
  }
  // signal = EMA of MACD line. Build synthetic candles for ema()
  const synth: Candle[] = macdLine.map((p) => ({
    time: p.time,
    open: p.value,
    high: p.value,
    low: p.value,
    close: p.value,
    volume: 0,
  }));
  const sig = ema(synth, signal);
  const sigByTime = new Map(sig.map((p) => [p.time, p.value]));
  const out: MACDPoint[] = [];
  for (const p of macdLine) {
    const s = sigByTime.get(p.time);
    if (s === undefined) continue;
    out.push({ time: p.time, macd: p.value, signal: s, histogram: p.value - s });
  }
  void slowStartTime;
  return out;
}

/**
 * Bollinger Bands — SMA(period) ± stdDev * σ of closes over `period`.
 * Defaults: period 20, stdDev 2.
 */
export function bollinger(
  candles: Candle[],
  period = 20,
  stdDev = 2,
): BollingerPoint[] {
  const out: BollingerPoint[] = [];
  if (candles.length < period) return out;
  let sum = 0;
  let sumSq = 0;
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i].close;
    sum += c;
    sumSq += c * c;
    if (i >= period) {
      const old = candles[i - period].close;
      sum -= old;
      sumSq -= old * old;
    }
    if (i >= period - 1) {
      const mean = sum / period;
      // population variance over the rolling window
      const variance = Math.max(0, sumSq / period - mean * mean);
      const sigma = Math.sqrt(variance);
      out.push({
        time: candles[i].time,
        upper: mean + stdDev * sigma,
        middle: mean,
        lower: mean - stdDev * sigma,
      });
    }
  }
  return out;
}

/**
 * Stochastic Oscillator — %K then %D.
 * Raw %K = 100 * (close - lowestLow) / (highestHigh - lowestLow) over `kPeriod`.
 * %K is then SMA-smoothed by `smoothK`; %D = SMA(%K, dPeriod).
 * Defaults: 14 / 3 / 3 (classic "slow" stochastic).
 */
export function stochastic(
  candles: Candle[],
  kPeriod = 14,
  dPeriod = 3,
  smoothK = 3,
): StochasticPoint[] {
  if (candles.length < kPeriod + smoothK + dPeriod - 2) return [];
  const raw: IndicatorPoint[] = [];
  for (let i = kPeriod - 1; i < candles.length; i++) {
    let hh = -Infinity;
    let ll = Infinity;
    for (let j = i - kPeriod + 1; j <= i; j++) {
      if (candles[j].high > hh) hh = candles[j].high;
      if (candles[j].low < ll) ll = candles[j].low;
    }
    const range = hh - ll;
    const k = range === 0 ? 0 : ((candles[i].close - ll) / range) * 100;
    raw.push({ time: candles[i].time, value: k });
  }
  // SMA helper over an IndicatorPoint array
  const smaPts = (pts: IndicatorPoint[], period: number): IndicatorPoint[] => {
    const r: IndicatorPoint[] = [];
    if (pts.length < period) return r;
    let s = 0;
    for (let i = 0; i < pts.length; i++) {
      s += pts[i].value;
      if (i >= period) s -= pts[i - period].value;
      if (i >= period - 1) r.push({ time: pts[i].time, value: s / period });
    }
    return r;
  };
  const kSmoothed = smoothK > 1 ? smaPts(raw, smoothK) : raw;
  const dLine = smaPts(kSmoothed, dPeriod);
  const dByTime = new Map(dLine.map((p) => [p.time, p.value]));
  const out: StochasticPoint[] = [];
  for (const p of kSmoothed) {
    const d = dByTime.get(p.time);
    if (d === undefined) continue;
    out.push({ time: p.time, k: p.value, d });
  }
  return out;
}

/**
 * WaveTrend Oscillator (LazyBear / VuManChu Cipher B).
 * Source: HLC3.
 * esa = EMA(hlc3, chlen); de = EMA(|hlc3 - esa|, chlen);
 * ci = (hlc3 - esa) / (0.015 * de); wt1 = EMA(ci, avg); wt2 = SMA(wt1, malen).
 * Returns { wt1, wt2, vwap = wt1 - wt2 } per candle.
 */
export function wavetrend(
  candles: Candle[],
  chlen = 9,
  avg = 12,
  malen = 3,
): WaveTrendPoint[] {
  if (candles.length < chlen + avg + malen) return [];
  const hlc3Candles: Candle[] = candles.map((c) => ({
    ...c,
    close: (c.high + c.low + c.close) / 3,
  }));
  const esa = ema(hlc3Candles, chlen);
  const esaByTime = new Map(esa.map((p) => [p.time, p.value]));
  // |hlc3 - esa| series, as synthetic candles
  const diffCandles: Candle[] = [];
  for (const c of hlc3Candles) {
    const e = esaByTime.get(c.time);
    if (e === undefined) continue;
    diffCandles.push({ ...c, close: Math.abs(c.close - e) });
  }
  const de = ema(diffCandles, chlen);
  const deByTime = new Map(de.map((p) => [p.time, p.value]));
  // ci = (hlc3 - esa) / (0.015 * de)
  const ciCandles: Candle[] = [];
  for (const c of hlc3Candles) {
    const e = esaByTime.get(c.time);
    const d = deByTime.get(c.time);
    if (e === undefined || d === undefined || d === 0) continue;
    ciCandles.push({ ...c, close: (c.close - e) / (0.015 * d) });
  }
  const wt1 = ema(ciCandles, avg);
  const wt1Candles: Candle[] = wt1.map((p) => ({
    time: p.time,
    open: p.value,
    high: p.value,
    low: p.value,
    close: p.value,
    volume: 0,
  }));
  const wt2 = sma(wt1Candles, malen);
  const wt2ByTime = new Map(wt2.map((p) => [p.time, p.value]));
  const out: WaveTrendPoint[] = [];
  for (const p of wt1) {
    const w2 = wt2ByTime.get(p.time);
    if (w2 === undefined) continue;
    out.push({ time: p.time, wt1: p.value, wt2: w2, vwap: p.value - w2 });
  }
  return out;
}

/**
 * RSI+MFI Area (VuManChu Cipher B).
 * `SMA(((close - open) / (high - low)) * multiplier, period) - posY`
 * Used to color the small area at the bottom of the Cipher pane.
 */
export function mfiArea(
  candles: Candle[],
  period = 60,
  multiplier = 150,
  posY = 2.5,
): IndicatorPoint[] {
  const out: IndicatorPoint[] = [];
  if (candles.length < period) return out;
  const raw: number[] = candles.map((c) => {
    const range = c.high - c.low;
    return range === 0 ? 0 : ((c.close - c.open) / range) * multiplier;
  });
  let sum = 0;
  for (let i = 0; i < raw.length; i++) {
    sum += raw[i];
    if (i >= period) sum -= raw[i - period];
    if (i >= period - 1)
      out.push({ time: candles[i].time, value: sum / period - posY });
  }
  return out;
}

/**
 * Stochastic RSI (VuManChu Cipher B variant — log of source by default).
 * RSI of (log(close) or close), then stochastic over `stochLen`, then SMA-smoothed K and D.
 */
export function stochRsi(
  candles: Candle[],
  stochLen = 14,
  rsiLen = 14,
  smoothK = 3,
  smoothD = 3,
  useLog = true,
): StochasticPoint[] {
  const src: Candle[] = useLog
    ? candles.map((c) => ({ ...c, close: Math.log(Math.max(c.close, 1e-12)) }))
    : candles;
  const rsiVals = rsi(src, rsiLen);
  if (rsiVals.length < stochLen) return [];
  const stochRaw: IndicatorPoint[] = [];
  for (let i = stochLen - 1; i < rsiVals.length; i++) {
    let hh = -Infinity;
    let ll = Infinity;
    for (let j = i - stochLen + 1; j <= i; j++) {
      if (rsiVals[j].value > hh) hh = rsiVals[j].value;
      if (rsiVals[j].value < ll) ll = rsiVals[j].value;
    }
    const range = hh - ll;
    const v = range === 0 ? 0 : ((rsiVals[i].value - ll) / range) * 100;
    stochRaw.push({ time: rsiVals[i].time, value: v });
  }
  const smaPts = (pts: IndicatorPoint[], p: number): IndicatorPoint[] => {
    const r: IndicatorPoint[] = [];
    if (pts.length < p) return r;
    let s = 0;
    for (let i = 0; i < pts.length; i++) {
      s += pts[i].value;
      if (i >= p) s -= pts[i - p].value;
      if (i >= p - 1) r.push({ time: pts[i].time, value: s / p });
    }
    return r;
  };
  const k = smaPts(stochRaw, smoothK);
  const d = smaPts(k, smoothD);
  const dByTime = new Map(d.map((p) => [p.time, p.value]));
  const out: StochasticPoint[] = [];
  for (const p of k) {
    const dv = dByTime.get(p.time);
    if (dv === undefined) continue;
    out.push({ time: p.time, k: p.value, d: dv });
  }
  return out;
}

/**
 * Convert regular candles to Heikin Ashi.
 * HA_close = (open + high + low + close) / 4
 * HA_open  = (prev HA_open + prev HA_close) / 2  (seed = (open + close) / 2)
 * HA_high  = max(high, HA_open, HA_close)
 * HA_low   = min(low,  HA_open, HA_close)
 */
export function heikinAshi(candles: Candle[]): Candle[] {
  if (candles.length === 0) return [];
  const out: Candle[] = [];
  let prevOpen = (candles[0].open + candles[0].close) / 2;
  let prevClose = (candles[0].open +
    candles[0].high +
    candles[0].low +
    candles[0].close) /
    4;
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const haClose = (c.open + c.high + c.low + c.close) / 4;
    const haOpen = i === 0 ? prevOpen : (prevOpen + prevClose) / 2;
    const haHigh = Math.max(c.high, haOpen, haClose);
    const haLow = Math.min(c.low, haOpen, haClose);
    out.push({
      time: c.time,
      open: haOpen,
      high: haHigh,
      low: haLow,
      close: haClose,
      volume: c.volume,
      isFinal: c.isFinal,
    });
    prevOpen = haOpen;
    prevClose = haClose;
  }
  return out;
}

/**
 * Schaff Trend Cycle (Doug Schaff). A double-smoothed stochastic of a MACD.
 * Defaults match the Pine: length 10, fast 23, slow 50, factor 0.5.
 */
export function schaffTC(
  candles: Candle[],
  length = 10,
  fastLength = 23,
  slowLength = 50,
  factor = 0.5,
): IndicatorPoint[] {
  if (candles.length < slowLength + length) return [];
  const ema1 = ema(candles, fastLength);
  const ema2 = ema(candles, slowLength);
  const e1ByTime = new Map(ema1.map((p) => [p.time, p.value]));
  // macdVal = ema1 - ema2 (aligned by time, only where both exist)
  const macdVal: IndicatorPoint[] = [];
  for (const p of ema2) {
    const e1 = e1ByTime.get(p.time);
    if (e1 === undefined) continue;
    macdVal.push({ time: p.time, value: e1 - p.value });
  }
  if (macdVal.length < length) return [];

  // gamma = stochastic-like 0..100 mapping of macdVal over rolling `length`
  const gamma: number[] = new Array(macdVal.length).fill(NaN);
  for (let i = length - 1; i < macdVal.length; i++) {
    let lo = Infinity;
    let hi = -Infinity;
    for (let j = i - length + 1; j <= i; j++) {
      const v = macdVal[j].value;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    const beta = hi - lo;
    if (beta > 0) gamma[i] = ((macdVal[i].value - lo) / beta) * 100;
    else gamma[i] = i > 0 ? gamma[i - 1] : 0;
  }
  // delta = EMA-ish smoothing with `factor`
  const delta: number[] = new Array(macdVal.length).fill(NaN);
  for (let i = 0; i < macdVal.length; i++) {
    if (Number.isNaN(gamma[i])) continue;
    if (Number.isNaN(delta[i - 1] ?? NaN)) delta[i] = gamma[i];
    else delta[i] = delta[i - 1] + factor * (gamma[i] - delta[i - 1]);
  }
  // eta = same stochastic mapping on delta
  const eta: number[] = new Array(macdVal.length).fill(NaN);
  for (let i = length - 1; i < macdVal.length; i++) {
    let lo = Infinity;
    let hi = -Infinity;
    let valid = true;
    for (let j = i - length + 1; j <= i; j++) {
      const v = delta[j];
      if (Number.isNaN(v)) {
        valid = false;
        break;
      }
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    if (!valid) continue;
    const zeta = hi - lo;
    if (zeta > 0) eta[i] = ((delta[i] - lo) / zeta) * 100;
    else eta[i] = i > 0 ? eta[i - 1] : 0;
  }
  // stcReturn = same smoothing on eta
  const stc: number[] = new Array(macdVal.length).fill(NaN);
  for (let i = 0; i < macdVal.length; i++) {
    if (Number.isNaN(eta[i])) continue;
    if (Number.isNaN(stc[i - 1] ?? NaN)) stc[i] = eta[i];
    else stc[i] = stc[i - 1] + factor * (eta[i] - stc[i - 1]);
  }
  const out: IndicatorPoint[] = [];
  for (let i = 0; i < macdVal.length; i++) {
    if (!Number.isNaN(stc[i])) out.push({ time: macdVal[i].time, value: stc[i] });
  }
  return out;
}

/**
 * VWAP — Volume Weighted Average Price, anchored to each UTC day.
 * Resets cumulative sums whenever the candle crosses 00:00 UTC.
 * TP = (high + low + close) / 3.
 */
export function vwap(candles: Candle[]): IndicatorPoint[] {
  const out: IndicatorPoint[] = [];
  let cumPV = 0;
  let cumV = 0;
  let currentDay = -1;
  for (const c of candles) {
    const day = Math.floor(c.time / 86400);
    if (day !== currentDay) {
      cumPV = 0;
      cumV = 0;
      currentDay = day;
    }
    const tp = (c.high + c.low + c.close) / 3;
    cumPV += tp * c.volume;
    cumV += c.volume;
    out.push({ time: c.time, value: cumV === 0 ? tp : cumPV / cumV });
  }
  return out;
}
