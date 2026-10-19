import type {
  Candle,
  SymbolInfo,
  Ticker24h,
  Timeframe,
} from "@/lib/binance/types";
import { TIMEFRAME_SECONDS } from "@/lib/binance/types";
import { traerPaginado } from "@/lib/binance/paginado";
import type {
  ExchangeAdapter,
  KlineSubscription,
  MiniTick,
} from "./types";

const REST_BASE = "https://api.bitget.com/api/v2/spot";
const WS_URL = "wss://ws.bitget.com/v2/ws/public";

// Bitget supports a subset of Binance timeframes. Map each Binance-style
// label to Bitget's `granularity` value (or null if unsupported).
const TF_MAP: Record<Timeframe, string | null> = {
  "1m": "1min",
  "3m": null,
  "5m": "5min",
  "15m": "15min",
  "30m": "30min",
  "1h": "1h",
  "2h": null,
  "4h": "4h",
  "6h": "6h",
  "8h": null,
  "12h": "12h",
  "1d": "1day",
  "3d": "3day",
  "1w": "1week",
  "1M": "1M",
};

function granularityFor(tf: Timeframe): string | null {
  return TF_MAP[tf] ?? null;
}

// WS uses these granularity tokens (slightly different in some cases)
const WS_TF_MAP: Record<Timeframe, string | null> = {
  "1m": "candle1m",
  "3m": null,
  "5m": "candle5m",
  "15m": "candle15m",
  "30m": "candle30m",
  "1h": "candle1H",
  "2h": null,
  "4h": "candle4H",
  "6h": "candle6H",
  "8h": null,
  "12h": "candle12H",
  "1d": "candle1D",
  "3d": "candle3D",
  "1w": "candle1W",
  "1M": "candle1M",
};

// Cache the symbol universe so we don't re-fetch on every dialog open.
let cachedSymbols: SymbolInfo[] | null = null;

async function fetchSymbols(): Promise<SymbolInfo[]> {
  if (cachedSymbols) return cachedSymbols;
  const res = await fetch(`${REST_BASE}/public/symbols`, { cache: "force-cache" });
  if (!res.ok) throw new Error(`bitget symbols ${res.status}`);
  const json = await res.json();
  const rows = (json.data ?? []) as Array<{
    symbol: string;
    baseCoin: string;
    quoteCoin: string;
    status: string;
  }>;
  cachedSymbols = rows
    .filter((r) => r.status === "online" && r.quoteCoin === "USDT")
    .map((r) => ({
      symbol: r.symbol,
      baseAsset: r.baseCoin,
      quoteAsset: r.quoteCoin,
      status: r.status,
    }));
  return cachedSymbols;
}

async function unaPagina(
  symbol: string,
  tf: Timeframe,
  limit: number,
  finMs?: number,
): Promise<Candle[]> {
  const gran = granularityFor(tf);
  if (!gran) return []; // unsupported tf on Bitget
  const url =
    `${REST_BASE}/market/candles` +
    `?symbol=${symbol.toUpperCase()}&granularity=${gran}&limit=${Math.min(limit, 1000)}` +
    // Bitget llama "endTime" al fin de la ventana, igual que Binance.
    (finMs !== undefined ? `&endTime=${Math.floor(finMs)}` : "");
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`bitget klines ${res.status}`);
  const json = await res.json();
  const rows = (json.data ?? []) as string[][];
  // Bitget returns rows newest-first; reverse to ascending so the chart aligns
  // with how Binance returns data.
  return rows
    .map<Candle>((r) => ({
      time: Math.floor(parseInt(r[0], 10) / 1000),
      open: parseFloat(r[1]),
      high: parseFloat(r[2]),
      low: parseFloat(r[3]),
      close: parseFloat(r[4]),
      volume: parseFloat(r[5]),
      isFinal: true,
    }))
    .sort((a, b) => a.time - b.time);
}

/** Más de 1.000 velas: varias páginas en paralelo, como en Binance. */
async function fetchKlines(
  symbol: string,
  tf: Timeframe,
  limit = 1000,
): Promise<Candle[]> {
  return traerPaginado(
    (finMs, n) => unaPagina(symbol, tf, n, finMs),
    TIMEFRAME_SECONDS[tf],
    limit,
  );
}

async function fetchTickers24h(symbols: string[]): Promise<Ticker24h[]> {
  if (symbols.length === 0) return [];
  const res = await fetch(`${REST_BASE}/market/tickers`, { cache: "no-store" });
  if (!res.ok) throw new Error(`bitget tickers ${res.status}`);
  const json = await res.json();
  const rows = (json.data ?? []) as Array<{
    symbol: string;
    lastPr: string;
    change24h: string;
    changeUtc24h: string;
    high24h: string;
    low24h: string;
    baseVolume: string;
    quoteVolume: string;
    open: string;
  }>;
  const want = new Set(symbols.map((s) => s.toUpperCase()));
  const out: Ticker24h[] = [];
  for (const r of rows) {
    if (!want.has(r.symbol)) continue;
    const last = parseFloat(r.lastPr);
    const open = parseFloat(r.open || "0");
    const pct = open === 0 ? 0 : ((last - open) / open) * 100;
    out.push({
      symbol: r.symbol,
      lastPrice: last,
      priceChange: last - open,
      priceChangePercent: pct,
      highPrice: parseFloat(r.high24h),
      lowPrice: parseFloat(r.low24h),
      volume: parseFloat(r.baseVolume),
      quoteVolume: parseFloat(r.quoteVolume),
    });
  }
  return out;
}

// ---- WebSocket ----

interface BitgetCandleMsg {
  action: "snapshot" | "update";
  arg: { instType: string; channel: string; instId: string };
  data: string[][];
}

interface BitgetTickerMsg {
  action: "snapshot" | "update";
  arg: { instType: string; channel: string; instId: string };
  // Bitget V2 spot ticker WS uses `lastPr` (same as REST), NOT `last`.
  // `open24h` is the rolling 24h open; `openUtc` is the UTC-day open.
  data: Array<{
    instId: string;
    lastPr: string;
    open24h: string;
    openUtc?: string;
  }>;
}

type AnyMsg = BitgetCandleMsg | BitgetTickerMsg | { event: string };

/** Se exporta para poder probar el reparto de suscripciones sin red. */
export class BitgetWS {
  private ws: WebSocket | null = null;
  private connected = false;
  private closing = false;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  // key: `${channel}|${instId}` → CONJUNTO de handlers.
  //
  // Un conjunto, no uno solo: con dos gráficos del mismo par abiertos,
  // `.set()` pisaba al primero y lo dejaba mudo, y al cerrar cualquiera
  // de los dos el `unsubscribe` cortaba el canal para el otro. Mismo
  // defecto que tenía el multiplexor de Binance.
  private klineHandlers = new Map<string, Set<KlineSubscription>>();
  private tickerHandlers = new Map<string, Set<(t: MiniTick) => void>>();

  connect() {
    if (this.ws || this.closing) return;
    this.ws = new WebSocket(WS_URL);

    this.ws.onopen = () => {
      this.connected = true;
      this.reconnectAttempts = 0;
      // re-subscribe everything
      // Las CLAVES son los canales, así que cada uno se vuelve a pedir
      // una sola vez por más oyentes que tenga.
      for (const key of this.klineHandlers.keys()) {
        const [channel, instId] = key.split("|");
        this.send({
          op: "subscribe",
          args: [{ instType: "SPOT", channel, instId }],
        });
      }
      for (const key of this.tickerHandlers.keys()) {
        const [, instId] = key.split("|");
        this.send({
          op: "subscribe",
          args: [{ instType: "SPOT", channel: "ticker", instId }],
        });
      }
      // Bitget requires periodic pings every 30s
      if (this.pingTimer) clearInterval(this.pingTimer);
      this.pingTimer = setInterval(() => {
        try {
          this.ws?.send("ping");
        } catch {}
      }, 25_000);
    };

    this.ws.onmessage = (ev) => {
      if (typeof ev.data === "string" && ev.data === "pong") return;
      try {
        const msg = JSON.parse(ev.data) as AnyMsg;
        this.dispatch(msg);
      } catch {
        // ignore
      }
    };

    this.ws.onclose = () => {
      this.connected = false;
      this.ws = null;
      if (this.pingTimer) {
        clearInterval(this.pingTimer);
        this.pingTimer = null;
      }
      if (!this.closing) this.scheduleReconnect();
    };

    this.ws.onerror = () => {
      this.ws?.close();
    };
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    const delay = Math.min(30_000, 1000 * 2 ** this.reconnectAttempts);
    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private send(payload: object) {
    if (this.ws && this.connected) this.ws.send(JSON.stringify(payload));
  }

  private dispatch(msg: AnyMsg) {
    if ("event" in msg) return;
    const arg = msg.arg;
    if (!arg) return;
    if (arg.channel.startsWith("candle")) {
      const key = `${arg.channel}|${arg.instId}`;
      const subs = this.klineHandlers.get(key);
      if (!subs || subs.size === 0) return;
      const data = (msg as BitgetCandleMsg).data ?? [];
      // Bitget kline row: [ts, open, high, low, close, baseVol, ...]
      // For updates, the latest in-progress candle is the last element.
      for (const row of data) {
        const vela = {
          time: Math.floor(parseInt(row[0], 10) / 1000),
          open: parseFloat(row[1]),
          high: parseFloat(row[2]),
          low: parseFloat(row[3]),
          close: parseFloat(row[4]),
          volume: parseFloat(row[5]),
          isFinal: false,
        };
        // Copia: un oyente puede darse de baja desde su propio callback.
        for (const sub of [...subs]) sub.onCandle({ ...vela });
      }
    } else if (arg.channel === "ticker") {
      const key = `ticker|${arg.instId}`;
      const handlers = this.tickerHandlers.get(key);
      if (!handlers || handlers.size === 0) return;
      const rows = (msg as BitgetTickerMsg).data ?? [];
      for (const row of rows) {
        const close = parseFloat(row.lastPr);
        const open = parseFloat(row.open24h || row.openUtc || "0");
        if (!Number.isFinite(close)) continue;
        const tick = {
          symbol: row.instId,
          close,
          open,
          pct: open === 0 ? 0 : ((close - open) / open) * 100,
        };
        for (const h of [...handlers]) h(tick);
      }
    }
  }

  subscribeKline(sub: KlineSubscription): () => void {
    const channel = WS_TF_MAP[sub.interval];
    if (!channel) return () => {};
    const instId = sub.symbol.toUpperCase();
    const key = `${channel}|${instId}`;
    const previos = this.klineHandlers.get(key);
    if (previos) {
      previos.add(sub);
    } else {
      this.klineHandlers.set(key, new Set([sub]));
      if (this.connected) {
        this.send({
          op: "subscribe",
          args: [{ instType: "SPOT", channel, instId }],
        });
      }
    }
    let suelto = false;
    return () => {
      if (suelto) return;
      suelto = true;
      const actuales = this.klineHandlers.get(key);
      if (!actuales) return;
      actuales.delete(sub);
      if (actuales.size > 0) return;
      this.klineHandlers.delete(key);
      if (this.connected) {
        this.send({
          op: "unsubscribe",
          args: [{ instType: "SPOT", channel, instId }],
        });
      }
    };
  }

  subscribeMiniTickers(
    symbols: string[],
    onTick: (t: MiniTick) => void,
  ): () => void {
    const keys: string[] = [];
    for (const s of symbols) {
      const instId = s.toUpperCase();
      const key = `ticker|${instId}`;
      keys.push(key);
      const previos = this.tickerHandlers.get(key);
      if (previos) {
        previos.add(onTick);
        continue;
      }
      this.tickerHandlers.set(key, new Set([onTick]));
      if (this.connected) {
        this.send({
          op: "subscribe",
          args: [{ instType: "SPOT", channel: "ticker", instId }],
        });
      }
    }
    let suelto = false;
    return () => {
      if (suelto) return;
      suelto = true;
      for (const key of keys) {
        const instId = key.split("|")[1];
        const actuales = this.tickerHandlers.get(key);
        if (!actuales) continue;
        actuales.delete(onTick);
        if (actuales.size > 0) continue;
        this.tickerHandlers.delete(key);
        if (this.connected) {
          this.send({
            op: "unsubscribe",
            args: [{ instType: "SPOT", channel: "ticker", instId }],
          });
        }
      }
    };
  }
}

let wsSingleton: BitgetWS | null = null;
function getBitgetWS(): BitgetWS {
  if (typeof window === "undefined") return new BitgetWS();
  if (!wsSingleton) {
    wsSingleton = new BitgetWS();
    wsSingleton.connect();
  }
  return wsSingleton;
}

export const bitgetAdapter: ExchangeAdapter = {
  id: "BG",
  name: "Bitget",
  supportsTimeframe: (tf) => TF_MAP[tf] !== null,
  fetchKlines,
  fetchTickers24h,
  fetchSymbols,
  subscribeKline: (sub) => getBitgetWS().subscribeKline(sub),
  subscribeMiniTickers: (symbols, onTick) =>
    getBitgetWS().subscribeMiniTickers(symbols, onTick),
};
