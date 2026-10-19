/**
 * Mover los paneles de indicadores de sitio, en el navegador.
 *
 * Lo que importa acá no es que el botón exista, sino que el PANEL se
 * mueva de verdad: que el dibujo del Cipher B pase arriba del RSI, no
 * solo su etiqueta. Por eso todo se mide contra la posición vertical
 * real de cada chapa, que sale de la altura de los paneles del chart.
 *
 * Y que sobreviva a recargar la página, que es cuando se nota si el
 * orden no se guardó.
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

function velas(seg, n = 400) {
  const fin = Math.floor(Date.now() / 1000 / seg) * seg;
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const t = (fin - i * seg) * 1000;
    const p = 81000 + ((i * 37) % 900) + Math.sin(i / 9) * 120;
    out.push([t, String(p), String(p + 50), String(p - 50), String(p + 10),
      "100", t + seg * 1000 - 1, "0", 10, "0", "0", "0"]);
  }
  return out;
}

const browser = await chromium.launch({ executablePath: EXEC });
const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
await ctx.addInitScript(() => {
  class FakeWS {
    constructor() { this.readyState = 1; setTimeout(() => this.onopen?.({}), 0); }
    send() {}
    close() { this.readyState = 3; this.onclose?.({}); }
  }
  FakeWS.OPEN = 1;
  window.WebSocket = FakeWS;
});
await ctx.route("**/api.bitget.com/**", (r) =>
  r.fulfill({ status: 200, contentType: "application/json", body: '{"data":[]}' }));
await ctx.route("**/api/alpaca**", (r) =>
  r.fulfill({ status: 200, contentType: "application/json", body: '{"bars":{}}' }));
for (const patron of ["**/api.binance.com/**", "**/fapi.binance.com/**"]) {
  await ctx.route(patron, (r) => {
    const u = new URL(r.request().url());
    if (u.pathname.includes("klines")) {
      const itv = u.searchParams.get("interval") ?? "15m";
      return r.fulfill({ status: 200, contentType: "application/json",
        body: JSON.stringify(velas(SEG[itv] ?? 900)) });
    }
    if (u.pathname.includes("ticker")) {
      const uno = { symbol: "BTCUSDT", lastPrice: "81000.0", priceChange: "100",
        priceChangePercent: "0.12", volume: "1", quoteVolume: "1" };
      return r.fulfill({ status: 200, contentType: "application/json",
        body: JSON.stringify(u.searchParams.get("symbol") ? uno : [uno]) });
    }
    return r.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });
}

const page = await ctx.newPage();
const errores = [];
page.on("pageerror", (e) => errores.push(String(e)));

const estado = (ind) => ({
  state: {
    graficos: [{ id: "g1", symbol: "BINF:BTCUSDT", timeframe: "15m",
      indicators: ind, hidden: {}, ordenPaneles: [] }],
    graficoActivoId: "g1", distribucion: "1",
    listas: [{ id: "l1", nombre: "Pruebas", simbolos: ["BINF:BTCUSDT"] }],
    listaActivaId: "l1",
  }, version: 0,
});

await page.goto(URL_APP, { waitUntil: "domcontentloaded" });
await page.evaluate((e) => localStorage.setItem("tv-gratis-chart-state", JSON.stringify(e)),
  estado({ medias: true, rsi: true, cipher: true, srsi: true }));
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(3000);

/**
 * Los indicadores con panel, ordenados por su posición VERTICAL real en
 * pantalla. Es la medida que importa: si solo se moviera la etiqueta y
 * no el panel, esto no cambiaría.
 */
const porAltura = async () =>
  page.evaluate(() => {
    const nombres = ["RSI", "Cipher B", "Stoch RSI", "MACD"];
    const out = [];
    for (const el of document.querySelectorAll(".absolute.z-10")) {
      const t = (el.textContent ?? "").trim();
      const n = nombres.find((x) => t.startsWith(x));
      if (!n) continue;
      out.push({ nombre: n, y: el.getBoundingClientRect().top });
    }
    return out.sort((a, b) => a.y - b.y).map((x) => x.nombre);
  });

/** El botón de subir/bajar de la chapa de un indicador. */
const boton = (nombre, cual) =>
  page.locator(".absolute.z-10", { hasText: new RegExp(`^${nombre}`) })
    .first()
    .getByRole("button", { name: cual === "subir" ? "Subir un panel" : "Bajar un panel" });

console.log("1. Arrancan en el orden natural");
{
  const o = await porAltura();
  console.log(`     de arriba a abajo: ${JSON.stringify(o)}`);
  ok("se ven los tres paneles", o.length === 3, JSON.stringify(o));
  ok("en el orden de la lista", o.join(",") === "RSI,Cipher B,Stoch RSI", o.join(","));
}

console.log("2. Subir el Cipher B lo pone arriba del RSI");
{
  await boton("Cipher B", "subir").click();
  await page.waitForTimeout(700);
  const o = await porAltura();
  console.log(`     de arriba a abajo: ${JSON.stringify(o)}`);
  ok("el cipher quedó primero", o[0] === "Cipher B", o.join(","));
  ok("y el RSI segundo", o[1] === "RSI", o.join(","));
  ok("el Stoch RSI no se movió", o[2] === "Stoch RSI", o.join(","));
  await page.screenshot({ path: "shots/orden-paneles.png" });
}

console.log("3. Los bordes apagan el botón, no lo esconden");
{
  ok("el de más arriba no puede subir",
    await boton("Cipher B", "subir").isDisabled());
  ok("pero sí bajar", !(await boton("Cipher B", "bajar").isDisabled()));
  ok("el de más abajo no puede bajar",
    await boton("Stoch RSI", "bajar").isDisabled());
  ok("pero sí subir", !(await boton("Stoch RSI", "subir").isDisabled()));
}

console.log("4. Bajarlo lo devuelve");
{
  await boton("Cipher B", "bajar").click();
  await page.waitForTimeout(700);
  const o = await porAltura();
  ok("vuelve al orden de antes", o.join(",") === "RSI,Cipher B,Stoch RSI", o.join(","));
}

console.log("5. El orden sobrevive a recargar la página");
{
  await boton("Stoch RSI", "subir").click();
  await page.waitForTimeout(400);
  await boton("Stoch RSI", "subir").click();
  await page.waitForTimeout(700);
  const antes = await porAltura();
  ok("queda el Stoch RSI arriba de todo",
    antes.join(",") === "Stoch RSI,RSI,Cipher B", antes.join(","));

  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(3200);
  const despues = await porAltura();
  console.log(`     después de recargar: ${JSON.stringify(despues)}`);
  ok("y sigue igual después de recargar",
    despues.join(",") === antes.join(","), `${antes.join(",")} -> ${despues.join(",")}`);
}

console.log("6. Prender un indicador nuevo no desordena lo de arriba");
{
  const guardado = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("tv-gratis-chart-state")).state.graficos[0].ordenPaneles);
  console.log(`     orden guardado: ${JSON.stringify(guardado)}`);
  ok("el orden está guardado como lista de claves",
    Array.isArray(guardado) && guardado[0] === "srsi", JSON.stringify(guardado));

  await page.evaluate(() => {
    const g = JSON.parse(localStorage.getItem("tv-gratis-chart-state"));
    g.state.graficos[0].indicators.macd = true;
    localStorage.setItem("tv-gratis-chart-state", JSON.stringify(g));
  });
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(3200);
  const o = await porAltura();
  console.log(`     de arriba a abajo: ${JSON.stringify(o)}`);
  ok("el nuevo va al final", o[o.length - 1] === "MACD", o.join(","));
  ok("y los de arriba quedan como estaban",
    o.slice(0, 3).join(",") === "Stoch RSI,RSI,Cipher B", o.join(","));
}

ok("sin errores de JavaScript", errores.length === 0, errores.slice(0, 3).join(" | "));
await browser.close();
console.log(`\n${fallos.length === 0 ? "TODO BIEN" : `FALLARON ${fallos.length}:\n - ${fallos.join("\n - ")}`}`);
process.exit(fallos.length === 0 ? 0 : 1);
