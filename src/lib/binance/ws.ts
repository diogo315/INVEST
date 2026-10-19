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
  private readonly base: string;

  // Campo normal y asignación a mano, en vez de propiedad de parámetro:
  // así el archivo se puede importar con `--experimental-strip-types` y
  // probarse con un WebSocket de mentira, sin compilar nada.
  constructor(base: string = WS_SPOT) {
    this.base = base;
  }

  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private nextId = 1;
  // UN CONJUNTO DE SUSCRIPTORES POR STREAM, no uno solo.
  //
  // Antes esto era `Map<string, Sub>` y `.set()` pisaba al anterior. Con
  // tres gráficos de BTCUSDT abiertos, el tercero en montarse dejaba
  // mudos a los otros dos, que se quedaban clavados en el precio de la
  // petición REST inicial: el mismo activo mostraba tres precios
  // distintos en la misma pantalla. Y al cerrar cualquiera de ellos, el
  // `delete` más el UNSUBSCRIBE cortaban el stream para todos.
  private klineSubs = new Map<string, Set<KlineSubscription>>();
  private tickerSubs = new Map<string, Set<(m: MiniTickerMsg["data"]) => void>>();
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
      // Re-subscribe everything. Las CLAVES son los streams, así que
      // cada uno se pide una sola vez aunque lo escuchen varios.
      const streams = [...this.klineSubs.keys(), ...this.tickerSubs.keys()];
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
      const subs = this.klineSubs.get(msg.stream);
      if (!subs || subs.size === 0) return;
      const k = (msg as KlineMsg).data.k;
      const vela = {
        time: Math.floor(k.t / 1000),
        open: parseFloat(k.o),
        high: parseFloat(k.h),
        low: parseFloat(k.l),
        close: parseFloat(k.c),
        volume: parseFloat(k.v),
        isFinal: k.x,
      };
      // Copia del conjunto: un suscriptor puede darse de baja desde su
      // propio callback, y modificar el Set mientras se recorre es la
      // clase de error que aparece una vez cada mil y no se reproduce.
      [...subs].forEach((s) => s.onCandle({ ...vela }));
    } else if (msg.stream.includes("@miniTicker")) {
      const subs = this.tickerSubs.get(msg.stream);
      if (!subs) return;
      const d = (msg as MiniTickerMsg).data;
      [...subs].forEach((h) => h(d));
    }
  }

  subscribeKline(sub: KlineSubscription): () => void {
    const stream = `${sub.symbol.toLowerCase()}@kline_${sub.interval}`;
    const subs = this.klineSubs.get(stream);
    if (subs) {
      // El stream ya está pedido al exchange: solo se suma el oyente.
      subs.add(sub);
    } else {
      this.klineSubs.set(stream, new Set([sub]));
      if (this.connected) this.send({ method: "SUBSCRIBE", params: [stream], id: this.nextId++ });
    }
    let suelto = false;
    return () => {
      // Idempotente: React puede llamar a la limpieza dos veces y soltar
      // el stream de otro gráfico que se suscribió en el medio.
      if (suelto) return;
      suelto = true;
      const actuales = this.klineSubs.get(stream);
      if (!actuales) return;
      actuales.delete(sub);
      if (actuales.size > 0) return;
      this.klineSubs.delete(stream);
      if (this.connected) this.send({ method: "UNSUBSCRIBE", params: [stream], id: this.nextId++ });
    };
  }

  subscribeMiniTickers(
    symbols: string[],
    onTick: (s: { symbol: string; close: number; open: number; pct: number }) => void,
  ): () => void {
    const streams = symbols.map((s) => `${s.toLowerCase()}@miniTicker`);
    // UNA función por llamada, la misma para todos sus streams: es la
    // identidad que después se borra del conjunto.
    const handler = (d: MiniTickerMsg["data"]) => {
      const close = parseFloat(d.c);
      const open = parseFloat(d.o);
      onTick({
        symbol: d.s,
        close,
        open,
        pct: open === 0 ? 0 : ((close - open) / open) * 100,
      });
    };
    // Solo se le piden al exchange los que todavía no estaban pedidos.
    const nuevos: string[] = [];
    streams.forEach((stream) => {
      const subs = this.tickerSubs.get(stream);
      if (subs) {
        subs.add(handler);
      } else {
        this.tickerSubs.set(stream, new Set([handler]));
        nuevos.push(stream);
      }
    });
    if (this.connected && nuevos.length > 0) {
      this.send({ method: "SUBSCRIBE", params: nuevos, id: this.nextId++ });
    }
    let suelto = false;
    return () => {
      if (suelto) return;
      suelto = true;
      const vacios: string[] = [];
      streams.forEach((stream) => {
        const subs = this.tickerSubs.get(stream);
        if (!subs) return;
        subs.delete(handler);
        if (subs.size === 0) {
          this.tickerSubs.delete(stream);
          vacios.push(stream);
        }
      });
      if (this.connected && vacios.length > 0) {
        this.send({ method: "UNSUBSCRIBE", params: vacios, id: this.nextId++ });
      }
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
