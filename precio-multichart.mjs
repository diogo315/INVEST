/**
 * El mismo activo en tres gráficos tiene que mostrar el mismo precio.
 *
 * Síntoma que lo originó: con BTCUSDT en 1D, 15M y 5M a la vez, las tres
 * cabeceras mostraban 82.259,9 / 82.166,4 / 82.237,4. El precio sale del
 * ticker de 24 h, que es uno solo para el símbolo, así que tres números
 * distintos solo podían venir de que dos de los tres se habían quedado
 * sin recibir actualizaciones.
 *
 * Acá no hay red: el WebSocket se reemplaza por uno de mentira al que la
 * prueba le empuja un tick a mano. Es la única forma de comprobar que el
 * tick llega a los TRES y no solo al último que se suscribió.
 */
import { chromium } from "playwright";

const EXEC = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const URL_APP = "http://127.0.0.1:3119/";
const SEG = { "1d": 86400, "15m": 900, "5m": 300 };

const fallos = [];
const ok = (n, c, d = "") => {
  console.log(`  ${c ? "ok " : "MAL"} ${n}${!c && d ? ` — ${d}` : ""}`);
  if (!c) fallos.push(n);
};

// Velas sintéticas deterministas: lo que importa es la cabecera, no el dibujo.
function velas(seg, n = 400) {
  const fin = Math.floor(Date.now() / 1000 / seg) * seg;
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const t = (fin - i * seg) * 1000;
    const p = 81000 + ((i * 37) % 900);
    out.push([t, String(p), String(p + 50), String(p - 50), String(p + 10),
      "100", t + seg * 1000 - 1, "0", 10, "0", "0", "0"]);
  }
  return out;
}

const browser = await chromium.launch({ executablePath: EXEC });
const ctx = await browser.newContext({ viewport: { width: 1900, height: 1000 } });

// WebSocket de mentira, instalado antes de que corra nada de la app.
await ctx.addInitScript(() => {
  window.__ws = [];
  class FakeWS {
    constructor(url) {
      this.url = url;
      this.readyState = 1;
      window.__ws.push(this);
      setTimeout(() => this.onopen?.({}), 0);
    }
    send() {}
    close() {
      this.readyState = 3;
      this.onclose?.({});
    }
  }
  FakeWS.OPEN = 1;
  window.WebSocket = FakeWS;
  // La prueba empuja ticks por acá.
  window.__tick = (precio, apertura) => {
    const cuerpo = JSON.stringify({
      stream: "btcusdt@miniTicker",
      data: { e: "24hrMiniTicker", E: Date.now(), s: "BTCUSDT",
        c: String(precio), o: String(apertura), h: "0", l: "0", v: "0", q: "0" },
    });
    let n = 0;
    for (const w of window.__ws) {
      if (w.readyState === 1 && w.onmessage) { w.onmessage({ data: cuerpo }); n++; }
    }
    return n;
  };
});

await ctx.route("**/api.bitget.com/**", (r) =>
  r.fulfill({ status: 200, contentType: "application/json", body: '{"data":[]}' }));
await ctx.route("**/api/alpaca**", (r) =>
  r.fulfill({ status: 200, contentType: "application/json", body: '{"bars":{}}' }));
for (const patron of ["**/api.binance.com/**", "**/fapi.binance.com/**"]) {
  await ctx.route(patron, (r) => {
    const u = new URL(r.request().url());
    if (u.pathname.includes("klines")) {
      const itv = u.searchParams.get("interval") ?? "5m";
      return r.fulfill({ status: 200, contentType: "application/json",
        body: JSON.stringify(velas(SEG[itv] ?? 300)) });
    }
    if (u.pathname.includes("ticker")) {
      // El valor REST inicial, DISTINTO del que llegará por el socket:
      // así, si un gráfico se queda sin recibir el tick, se nota. Ojo:
      // pidiendo un solo símbolo, Binance devuelve un objeto, no un
      // arreglo — devolver un arreglo acá daba NaN y la prueba perdía
      // la mitad de su filo sin avisar.
      const uno = { symbol: "BTCUSDT", lastPrice: "81000.0", priceChange: "100",
        priceChangePercent: "0.12", volume: "1", quoteVolume: "1",
        openPrice: "80900", highPrice: "81500", lowPrice: "80800" };
      return r.fulfill({ status: 200, contentType: "application/json",
        body: JSON.stringify(u.searchParams.get("symbol") ? uno : [uno]) });
    }
    return r.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });
}

const page = await ctx.newPage();
const errores = [];
page.on("pageerror", (e) => errores.push(String(e)));

console.log("Tres gráficos de BTCUSDT, tres temporalidades");
await page.goto(URL_APP, { waitUntil: "domcontentloaded" });
await page.evaluate(() => {
  localStorage.setItem("tv-gratis-chart-state", JSON.stringify({
    state: {
      graficos: [
        { id: "g1", symbol: "BINF:BTCUSDT", timeframe: "1d", indicators: {}, hidden: {} },
        { id: "g2", symbol: "BINF:BTCUSDT", timeframe: "15m", indicators: {}, hidden: {} },
        { id: "g3", symbol: "BINF:BTCUSDT", timeframe: "5m", indicators: {}, hidden: {} },
      ],
      graficoActivoId: "g1",
      distribucion: "3",
      listas: [{ id: "l1", nombre: "Pruebas", simbolos: ["BINF:BTCUSDT"] }],
      listaActivaId: "l1",
    }, version: 0,
  }));
});
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(3500);

/** Los precios que se ven en las cabeceras de los gráficos. */
const precios = async () =>
  page.evaluate(() =>
    [...document.querySelectorAll("[data-precio]")].map((e) => e.getAttribute("data-precio")));

{
  const hay = await page.evaluate(() => window.__ws.length);
  ok("la app abrió al menos un socket", hay > 0, String(hay));
  const antes = await precios();
  ok("se ven tres precios, uno por gráfico", antes.length === 3, JSON.stringify(antes));
  ok("y arrancan en el valor del REST, no en NaN",
    antes.every((p) => Math.abs(Number(p) - 81000) < 0.01), JSON.stringify(antes));

  // Un tick, el mismo para todos. Si el reparto estuviera roto, solo uno
  // de los tres se movería de los 81.000 del REST.
  const entregados = await page.evaluate(() => window.__tick(82259.9, 81140));
  ok("el tick llegó a algún socket", entregados > 0, String(entregados));
  await page.waitForTimeout(900);

  const despues = await precios();
  console.log(`     cabeceras: ${JSON.stringify(despues)}`);
  ok("siguen siendo tres", despues.length === 3, JSON.stringify(despues));
  ok("los tres muestran EL MISMO precio",
    new Set(despues).size === 1, JSON.stringify(despues));
  ok("y es el del tick, no el del REST inicial",
    despues.every((p) => Math.abs(Number(p) - 82259.9) < 0.01),
    JSON.stringify(despues));

  // Un segundo tick: los tres tienen que seguir vivos.
  await page.evaluate(() => window.__tick(82500.5, 81140));
  await page.waitForTimeout(900);
  const tercero = await precios();
  ok("y se siguen moviendo juntos en el tick siguiente",
    new Set(tercero).size === 1 && tercero[0] !== despues[0],
    `${JSON.stringify(despues)} -> ${JSON.stringify(tercero)}`);

  await page.screenshot({ path: "shots/precio-multichart.png", fullPage: false });
}

ok("sin errores de JavaScript", errores.length === 0, errores.slice(0, 3).join(" | "));
await browser.close();
console.log(`\n${fallos.length === 0 ? "TODO BIEN" : `FALLARON ${fallos.length}:\n - ${fallos.join("\n - ")}`}`);
process.exit(fallos.length === 0 ? 0 : 1);
