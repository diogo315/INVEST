import type { Candle, Timeframe } from "./types";

const WS_SPOT = "wss://stream.binance.com:9443/stream";
const WS_FUTURES = "wss://fstream.binance.com/stream";

interface KlineMsg {
  stream: string;
  data: {
    e: string;
    E: number;
    s: string;
    k: {
      t: number; // open time
      T: number; // close time
      s: string;
      i: string;
      o: string;
      c: string;
      h: string;
      l: string;
      v: string;
      x: boolean; // is closed
    };
  };
}

interface MiniTickerMsg {
  stream: string;
  data: {
    e: string;
    E: number;
    s: string;
    c: string; // close
    o: string; // open
    h: string;
    l: string;
    v: string;
    q: string;
  };
}

type WSMsg = KlineMsg | MiniTickerMsg;

export interface KlineSubscription {
  symbol: string;
  interval: Timeframe;
  onCandle: (c: Candle) => void;
}

export interface TickerSubscription {
  symbols: string[];
  onTick: (s: { symbol: string; close: number; open: number; pct: number }) => void;
}

/**
 * Single multiplexed WS connection to Binance, with auto-reconnect.
 * Subscriptions can be added/removed at runtime via SUBSCRIBE/UNSUBSCRIBE.
 */
export class BinanceWS {
  /** Spot y futuros hablan el mismo protocolo; solo cambia el host. */
  constructor(private readonly base: string = WS_SPOT) {}

  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private nextId = 1;
  private klineSubs = new Map<string, KlineSubscription>();
  private tickerSubs = new Map<string, (m: MiniTickerMsg["data"]) => void>();
  private connected = false;
  private closing = false;
  /** Último mensaje recibido. Un socket abierto pero mudo es un zombi. */
  private lastMessageAt = 0;
  private watchdog: ReturnType<typeof setInterval> | null = null;

  connect() {
    if (this.ws || this.closing) return;
    this.ws = new WebSocket(this.base);

    this.ws.onopen = () => {
      this.connected = true;
      this.reconnectAttempts = 0;
      this.lastMessageAt = Date.now();
      this.startWatchdog();
      // Re-subscribe everything
      const streams: string[] = [];
      this.klineSubs.forEach((s) => {
        streams.push(`${s.symbol.toLowerCase()}@kline_${s.interval}`);
      });
      this.tickerSubs.forEach((_v, k) => streams.push(k));
      if (streams.length > 0) this.send({ method: "SUBSCRIBE", params: streams, id: this.nextId++ });
    };

    this.ws.onmessage = (ev) => {
      this.lastMessageAt = Date.now();
      try {
        const msg = JSON.parse(ev.data) as WSMsg | { result: unknown; id: number };
        if ("stream" in msg) this.dispatch(msg);
      } catch {
        // ignore
      }
    };

    this.ws.onclose = () => {
      this.connected = false;
      this.ws = null;
      if (!this.closing) this.scheduleReconnect();
    };

    this.ws.onerror = () => {
      this.ws?.close();
    };
  }

  /**
   * Si la pestaña estuvo en segundo plano, el navegador frena los timers y
   * el socket puede quedar abierto pero sin recibir nada. Cada 20 s se
   * comprueba y, si hay suscripciones y no llega nada hace 45 s, se fuerza
   * la reconexión.
   */
  private startWatchdog() {
    if (this.watchdog) return;
    this.watchdog = setInterval(() => {
      if (this.closing) return;
      const haySubs = this.klineSubs.size > 0 || this.tickerSubs.size > 0;
      if (!haySubs) return;
      if (Date.now() - this.lastMessageAt > 45_000) this.reconnectNow();
    }, 20_000);
  }

  /** Tira la conexión actual y reconecta enseguida (re-suscribe todo). */
  reconnectNow() {
    if (this.closing) return;
    this.reconnectAttempts = 0;
    const old = this.ws;
    this.ws = null;
    this.connected = false;
    if (old) {
      old.onclose = null;
      old.onerror = null;
      try {
        old.close();
      } catch {
        // ya estaba cerrado
      }
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.connect();
  }

  /** Segundos desde el último dato recibido (Infinity si nunca llegó nada). */
  secondsSinceLastMessage(): number {
    if (this.lastMessageAt === 0) return Infinity;
    return (Date.now() - this.lastMessageAt) / 1000;
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    const delay = Math.min(30000, 1000 * 2 ** this.reconnectAttempts);
    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private send(payload: object) {
    if (this.ws && this.connected) this.ws.send(JSON.stringify(payload));
  }

  private dispatch(msg: WSMsg) {
    if (msg.stream.includes("@kline_")) {
      const sub = this.klineSubs.get(msg.stream);
      if (!sub) return;
      const k = (msg as KlineMsg).data.k;
      sub.onCandle({
        time: Math.floor(k.t / 1000),
        open: parseFloat(k.o),
        high: parseFloat(k.h),
        low: parseFloat(k.l),
        close: parseFloat(k.c),
        volume: parseFloat(k.v),
        isFinal: k.x,
      });
    } else if (msg.stream.includes("@miniTicker")) {
      const handler = this.tickerSubs.get(msg.stream);
      if (handler) handler((msg as MiniTickerMsg).data);
    }
  }

  subscribeKline(sub: KlineSubscription): () => void {
    const stream = `${sub.symbol.toLowerCase()}@kline_${sub.interval}`;
    this.klineSubs.set(stream, sub);
    if (this.connected) this.send({ method: "SUBSCRIBE", params: [stream], id: this.nextId++ });
    return () => {
      this.klineSubs.delete(stream);
      if (this.connected) this.send({ method: "UNSUBSCRIBE", params: [stream], id: this.nextId++ });
    };
  }

  subscribeMiniTickers(
    symbols: string[],
    onTick: (s: { symbol: string; close: number; open: number; pct: number }) => void,
  ): () => void {
    const streams = symbols.map((s) => `${s.toLowerCase()}@miniTicker`);
    streams.forEach((stream) => {
      this.tickerSubs.set(stream, (d) => {
        const close = parseFloat(d.c);
        const open = parseFloat(d.o);
        onTick({
          symbol: d.s,
          close,
          open,
          pct: open === 0 ? 0 : ((close - open) / open) * 100,
        });
      });
    });
    if (this.connected) this.send({ method: "SUBSCRIBE", params: streams, id: this.nextId++ });
    return () => {
      streams.forEach((s) => this.tickerSubs.delete(s));
      if (this.connected) this.send({ method: "UNSUBSCRIBE", params: streams, id: this.nextId++ });
    };
  }

  close() {
    this.closing = true;
    if (this.watchdog) {
      clearInterval(this.watchdog);
      this.watchdog = null;
    }
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this.ws = null;
  }
}

// Singletons — una conexión por host (spot y futuros son WS distintos)
let spotSingleton: BinanceWS | null = null;
let futuresSingleton: BinanceWS | null = null;

export function getBinanceWS(): BinanceWS {
  if (typeof window === "undefined") return new BinanceWS(WS_SPOT); // SSR
  if (!spotSingleton) {
    spotSingleton = new BinanceWS(WS_SPOT);
    spotSingleton.connect();
  }
  return spotSingleton;
}

export function getBinanceFuturesWS(): BinanceWS {
  if (typeof window === "undefined") return new BinanceWS(WS_FUTURES); // SSR
  if (!futuresSingleton) {
    futuresSingleton = new BinanceWS(WS_FUTURES);
    futuresSingleton.connect();
  }
  return futuresSingleton;
}

/** Fuerza la reconexión de todas las conexiones vivas (spot y futuros). */
export function reconnectAllBinanceWS(): void {
  spotSingleton?.reconnectNow();
  futuresSingleton?.reconnectNow();
}
