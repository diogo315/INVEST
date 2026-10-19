/**
 * El multiplexor del WebSocket, con varios suscriptores al MISMO stream.
 *
 * Esto nació de un síntoma concreto: con tres gráficos de BTCUSDT a la
 * vez (1D, 15M y 5M), la cabecera de cada uno mostraba un precio
 * distinto —82.259,9 / 82.166,4 / 82.237,4— cuando es el mismo activo y
 * el precio sale del mismo ticker de 24 h.
 *
 * La causa: los mapas de suscripciones guardaban UN callback por stream,
 * así que el tercer gráfico en suscribirse pisaba a los otros dos, que
 * se quedaban congelados en el precio que trajo la petición REST
 * inicial. Y al desmontar cualquiera de ellos, el `delete` más el
 * UNSUBSCRIBE cortaban el stream para todos los demás.
 *
 * Acá no hay red: se enchufa un WebSocket de mentira y se le empujan
 * mensajes a mano, que es la única forma de probar el reparto sin
 * depender de Binance.
 */

const fallos = [];
const comprobar = (nombre, cond, detalle = "") => {
  console.log(`  ${cond ? "ok " : "MAL"} ${nombre}${!cond && detalle ? ` — ${detalle}` : ""}`);
  if (!cond) fallos.push(nombre);
};

// ── WebSocket de mentira ────────────────────────────────────────────
const sockets = [];
class FakeWS {
  constructor(url) {
    this.url = url;
    this.enviados = [];
    this.onopen = null;
    this.onmessage = null;
    this.onclose = null;
    this.onerror = null;
    sockets.push(this);
  }
  send(s) {
    this.enviados.push(JSON.parse(s));
  }
  close() {
    this.onclose?.();
  }
  /** Simula que el servidor acepta la conexión. */
  abrir() {
    this.onopen?.();
  }
  /** Empuja un mensaje como si viniera del exchange. */
  recibir(obj) {
    this.onmessage?.({ data: JSON.stringify(obj) });
  }
  /** Todos los streams pedidos con SUBSCRIBE, aplanados. */
  suscritos() {
    return this.enviados.filter((m) => m.method === "SUBSCRIBE").flatMap((m) => m.params);
  }
  desuscritos() {
    return this.enviados.filter((m) => m.method === "UNSUBSCRIBE").flatMap((m) => m.params);
  }
}
globalThis.WebSocket = FakeWS;

const { BinanceWS } = await import("../src/lib/binance/ws.ts");

const tickerDe = (symbol, close, open) => ({
  stream: `${symbol.toLowerCase()}@miniTicker`,
  data: { e: "24hrMiniTicker", E: 1, s: symbol, c: String(close), o: String(open), h: "0", l: "0", v: "0", q: "0" },
});
const klineDe = (symbol, interval, close) => ({
  stream: `${symbol.toLowerCase()}@kline_${interval}`,
  data: {
    e: "kline", E: 1, s: symbol,
    k: { t: 1_700_000_000_000, T: 1, s: symbol, i: interval,
      o: "1", c: String(close), h: "2", l: "0", v: "10", x: false },
  },
});

// ── el síntoma exacto: tres gráficos del mismo activo ───────────────
console.log("Tres gráficos del mismo activo reciben el MISMO precio");
{
  const ws = new BinanceWS("wss://ejemplo/stream");
  ws.connect();
  const s = sockets.at(-1);
  s.abrir();

  // Tres cabeceras: 1D, 15M y 5M, todas de BTCUSDT.
  const vistos = [[], [], []];
  const quitar = vistos.map((caja) =>
    ws.subscribeMiniTickers(["BTCUSDT"], (t) => caja.push(t.close)));

  s.recibir(tickerDe("BTCUSDT", 82259.9, 81140));

  comprobar("el primero recibe el tick", vistos[0].length === 1, JSON.stringify(vistos[0]));
  comprobar("el segundo también", vistos[1].length === 1, JSON.stringify(vistos[1]));
  comprobar("y el tercero", vistos[2].length === 1, JSON.stringify(vistos[2]));
  comprobar("los tres ven el mismo número",
    new Set(vistos.map((v) => v[0])).size === 1,
    JSON.stringify(vistos.map((v) => v[0])));

  // Un solo SUBSCRIBE: el stream ya estaba pedido.
  comprobar("no se pide el mismo stream tres veces al exchange",
    s.suscritos().filter((x) => x === "btcusdt@miniTicker").length === 1,
    JSON.stringify(s.suscritos()));

  // Cerrar UNO no puede dejar mudos a los otros dos.
  quitar[1]();
  s.recibir(tickerDe("BTCUSDT", 82300, 81140));
  comprobar("cerrar un gráfico no deja mudos a los otros",
    vistos[0].length === 2 && vistos[2].length === 2,
    JSON.stringify(vistos.map((v) => v.length)));
  comprobar("y el que se fue deja de recibir", vistos[1].length === 1, String(vistos[1].length));
  comprobar("no se manda UNSUBSCRIBE mientras quede alguien escuchando",
    s.desuscritos().length === 0, JSON.stringify(s.desuscritos()));

  // Recién cuando se van todos se suelta el stream.
  quitar[0]();
  quitar[2]();
  comprobar("cuando no queda nadie, ahí sí se suelta el stream",
    s.desuscritos().includes("btcusdt@miniTicker"), JSON.stringify(s.desuscritos()));
  s.recibir(tickerDe("BTCUSDT", 82400, 81140));
  comprobar("y ya nadie recibe nada",
    vistos.every((v) => v.length <= 2), JSON.stringify(vistos.map((v) => v.length)));
}

// ── lo mismo para las velas ─────────────────────────────────────────
console.log("Dos gráficos del mismo activo Y temporalidad reciben las mismas velas");
{
  const ws = new BinanceWS("wss://ejemplo/stream");
  ws.connect();
  const s = sockets.at(-1);
  s.abrir();

  const a = [];
  const b = [];
  const quitarA = ws.subscribeKline({ symbol: "ETHUSDT", interval: "15m", onCandle: (c) => a.push(c.close) });
  const quitarB = ws.subscribeKline({ symbol: "ETHUSDT", interval: "15m", onCandle: (c) => b.push(c.close) });

  s.recibir(klineDe("ETHUSDT", "15m", 2409.26));
  comprobar("los dos reciben la vela", a.length === 1 && b.length === 1,
    `${a.length} / ${b.length}`);
  comprobar("y con el mismo cierre", a[0] === b[0], `${a[0]} vs ${b[0]}`);

  quitarA();
  s.recibir(klineDe("ETHUSDT", "15m", 2411));
  comprobar("cerrar uno no deja mudo al otro", b.length === 2, String(b.length));
  comprobar("y no se manda UNSUBSCRIBE todavía",
    s.desuscritos().length === 0, JSON.stringify(s.desuscritos()));

  quitarB();
  comprobar("con el último sí se suelta",
    s.desuscritos().includes("ethusdt@kline_15m"), JSON.stringify(s.desuscritos()));
}

// ── al reconectar hay que volver a pedir todo, una sola vez ─────────
console.log("Al reconectar se vuelve a pedir cada stream una sola vez");
{
  const ws = new BinanceWS("wss://ejemplo/stream");
  ws.connect();
  const s1 = sockets.at(-1);
  s1.abrir();
  const cajas = [[], [], []];
  cajas.forEach((c) => ws.subscribeMiniTickers(["BTCUSDT"], (t) => c.push(t.close)));
  ws.subscribeKline({ symbol: "BTCUSDT", interval: "1h", onCandle: () => {} });
  ws.subscribeKline({ symbol: "BTCUSDT", interval: "1h", onCandle: () => {} });

  ws.reconnectNow();
  const s2 = sockets.at(-1);
  s2.abrir();
  const pedidos = s2.suscritos();
  comprobar("el ticker se pide una vez, no tres",
    pedidos.filter((x) => x === "btcusdt@miniTicker").length === 1, JSON.stringify(pedidos));
  comprobar("la vela se pide una vez, no dos",
    pedidos.filter((x) => x === "btcusdt@kline_1h").length === 1, JSON.stringify(pedidos));

  // Y después de reconectar, los tres siguen recibiendo.
  s2.recibir(tickerDe("BTCUSDT", 83000, 81140));
  comprobar("y los tres siguen recibiendo después de reconectar",
    cajas.every((c) => c.length === 1), JSON.stringify(cajas.map((c) => c.length)));
}

// ── suscribir varios símbolos de una, como hace el watchlist ────────
console.log("El watchlist pide muchos símbolos de una sola vez");
{
  const ws = new BinanceWS("wss://ejemplo/stream");
  ws.connect();
  const s = sockets.at(-1);
  s.abrir();
  const vistos = [];
  const quitar = ws.subscribeMiniTickers(["BTCUSDT", "ETHUSDT", "SOLUSDT"], (t) => vistos.push(t.symbol));
  s.recibir(tickerDe("ETHUSDT", 2409, 2380));
  s.recibir(tickerDe("SOLUSDT", 104.9, 102));
  comprobar("llegan los de todos los símbolos pedidos",
    vistos.join(",") === "ETHUSDT,SOLUSDT", vistos.join(","));
  quitar();
  comprobar("y al soltar se sueltan los tres",
    ["btcusdt@miniTicker", "ethusdt@miniTicker", "solusdt@miniTicker"]
      .every((x) => s.desuscritos().includes(x)), JSON.stringify(s.desuscritos()));
}

// ── Bitget tenía el mismo defecto, idéntico ─────────────────────────
console.log("Bitget: dos gráficos del mismo par reciben el mismo precio");
{
  const { BitgetWS } = await import("../src/lib/exchanges/bitget.ts");
  const ws = new BitgetWS();
  ws.connect();
  const s = sockets.at(-1);
  s.abrir();

  const a = [];
  const b = [];
  const quitarA = ws.subscribeMiniTickers(["BGBUSDT"], (t) => a.push(t.close));
  const quitarB = ws.subscribeMiniTickers(["BGBUSDT"], (t) => b.push(t.close));

  const tick = (p) => s.recibir({
    arg: { instType: "SPOT", channel: "ticker", instId: "BGBUSDT" },
    data: [{ instId: "BGBUSDT", lastPr: String(p), open24h: "1.86" }],
  });
  tick(1.89);
  comprobar("los dos reciben el tick", a.length === 1 && b.length === 1, `${a.length} / ${b.length}`);
  comprobar("y el mismo número", a[0] === b[0], `${a[0]} vs ${b[0]}`);

  const pedidos = s.enviados.filter((m) => m.op === "subscribe");
  comprobar("el canal se pide una sola vez", pedidos.length === 1, JSON.stringify(pedidos));

  quitarA();
  tick(1.9);
  comprobar("cerrar uno no deja mudo al otro", b.length === 2, String(b.length));
  comprobar("y no se da de baja el canal todavía",
    s.enviados.filter((m) => m.op === "unsubscribe").length === 0);
  quitarB();
  comprobar("con el último sí se da de baja",
    s.enviados.filter((m) => m.op === "unsubscribe").length === 1);
}

console.log(`\n${fallos.length === 0 ? "TODO BIEN" : `FALLARON ${fallos.length}:\n - ${fallos.join("\n - ")}`}`);
process.exit(fallos.length === 0 ? 0 : 1);
