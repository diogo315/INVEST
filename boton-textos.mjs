/**
 * El botón «Textos» de la barra de arriba.
 *
 * Lo que importa no es que las chapas desaparezcan, sino que los
 * INDICADORES sigan dibujados. Un botón que apaga los carteles y de
 * paso apaga el RSI es un bug con buena cara, así que la prueba mide
 * las dos cosas por separado: el texto se va, el dibujo se queda.
 *
 * Para «el dibujo se queda» se comparan píxeles del panel del
 * indicador fuera de donde estaba la chapa: si la línea del RSI
 * desapareciera, esa zona cambiaría.
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
  return Array.from({ length: n }, (_, i) => {
    const t = (fin - (n - 1 - i) * seg) * 1000;
    const p = 81000 + ((i * 53) % 1200) + Math.sin(i / 6) * 220;
    return [t, String(p), String(p + 70), String(p - 70), String(p + 20), "100",
      t + seg * 1000 - 1, "0", 10, "0", "0", "0"];
  });
}

const browser = await chromium.launch({ executablePath: EXEC });
const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
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
    const json = (b) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(b) });
    if (u.pathname.includes("klines")) return json(velas(SEG[u.searchParams.get("interval")] ?? 900));
    if (u.pathname.includes("ticker"))
      return json(u.searchParams.get("symbol")
        ? { symbol: "BTCUSDT", lastPrice: "81000", priceChange: "1", priceChangePercent: "0.1", volume: "1", quoteVolume: "1" }
        : []);
    return json([]);
  });
}

const page = await ctx.newPage();
const errores = [];
page.on("pageerror", (e) => errores.push(String(e)));

await page.goto(URL_APP, { waitUntil: "domcontentloaded" });
await page.evaluate(() => {
  localStorage.setItem("tv-gratis-chart-state", JSON.stringify({
    state: {
      graficos: [{
        id: "g1", symbol: "BINF:BTCUSDT", timeframe: "15m",
        indicators: { medias: true, volume: true, vwap: true, rsi: true, cipher: true },
        hidden: {}, ordenPaneles: [],
      }],
      graficoActivoId: "g1", distribucion: "1",
      listas: [{ id: "l1", nombre: "P", simbolos: ["BINF:BTCUSDT"] }], listaActivaId: "l1",
    }, version: 0,
  }));
});
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(3200);

const boton = () => page.getByRole("button", { name: /textos de los indicadores/i });
const chapas = () => page.locator(".group\\/pill").count();
/** Los paneles de indicador, de arriba a abajo. */
const paneles = async () =>
  page.evaluate(() => {
    const v = [];
    for (const c of document.querySelectorAll("canvas")) {
      const r = c.getBoundingClientRect();
      const caja = { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) };
      if (caja.width < 200 || caja.height < 40) continue;
      if (!v.some((o) => o.x === caja.x && o.y === caja.y)) v.push(caja);
    }
    return v.sort((a, b) => a.y - b.y);
  });

console.log("1. El botón está donde se pidió: en la barra de arriba");
{
  ok("existe", await boton().isVisible());
  const arriba = await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((e) =>
      /textos de los indicadores/i.test(e.getAttribute("title") ?? ""));
    return b ? Math.round(b.getBoundingClientRect().top) : -1;
  });
  ok("y está arriba del todo, no dentro de un menú", arriba >= 0 && arriba < 60, String(arriba));
  ok("dice qué hace sin abrirlo",
    /no los indicadores|se siguen dibujando/i.test(
      (await boton().getAttribute("title")) ?? ""),
    (await boton().getAttribute("title")) ?? "");
}

console.log("2. Apaga los textos y deja los indicadores dibujados");
{
  const antes = await chapas();
  ok("al principio se ven las chapas", antes >= 4, String(antes));

  const zonas = await paneles();
  const rsi = zonas[zonas.length - 1];
  // Una franja del panel del RSI POR DEBAJO de donde vive la chapa: si
  // el indicador se apagara, esta zona quedaría vacía.
  const franja = { x: rsi.x + 10, y: rsi.y + 34, width: rsi.width - 60, height: Math.max(20, rsi.height - 44) };
  const dibujo = () => page.screenshot({ clip: franja });
  const dibujoAntes = await dibujo();

  await boton().click();
  await page.waitForTimeout(800);

  ok("no queda ninguna chapa", (await chapas()) === 0, String(await chapas()));
  ok("el botón queda marcado como activo",
    (await boton().getAttribute("aria-pressed")) === "true");
  ok("y el dibujo del indicador sigue igual",
    Buffer.compare(dibujoAntes, await dibujo()) === 0);
  await page.screenshot({ path: "shots/textos-ocultos.png" });

  // CONTROL. Sin esto la afirmación de arriba podría ser hueca: si la
  // franja que se compara estuviera vacía, «sigue igual» pasaría
  // siempre, incluso con el indicador apagado. Se apaga el RSI de
  // verdad y se comprueba que esa misma franja SÍ cambia.
  await page.evaluate(() => {
    const g = JSON.parse(localStorage.getItem("tv-gratis-chart-state"));
    g.state.graficos[0].indicators.rsi = false;
    localStorage.setItem("tv-gratis-chart-state", JSON.stringify(g));
  });
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(3000);
  ok("la franja medida es DONDE VIVE el indicador, no un hueco vacío",
    Buffer.compare(dibujoAntes, await dibujo()) !== 0);
  // Se repone para lo que sigue.
  await page.evaluate(() => {
    const g = JSON.parse(localStorage.getItem("tv-gratis-chart-state"));
    g.state.graficos[0].indicators.rsi = true;
    // Se deja como estaba al final de esta sección —ocultas— para que
    // la siguiente pruebe el encendido, que es lo que le toca.
    g.state.apariencia = { ...(g.state.apariencia ?? {}), chapas: "ocultas", chapasAntes: "normal" };
    localStorage.setItem("tv-gratis-chart-state", JSON.stringify(g));
  });
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(3000);
}

console.log("3. Vuelve a encenderlos");
{
  await boton().click();
  await page.waitForTimeout(800);
  ok("vuelven las chapas", (await chapas()) >= 4, String(await chapas()));
  ok("y el botón deja de estar marcado",
    (await boton().getAttribute("aria-pressed")) === "false");
}

console.log("4. El viaje de ida y vuelta no te roba la marca de agua");
{
  // Quien tenía las chapas en «agua» tiene que recuperar «agua», no
  // quedarse en «normal».
  await page.evaluate(() => {
    const g = JSON.parse(localStorage.getItem("tv-gratis-chart-state"));
    g.state.apariencia = { ...(g.state.apariencia ?? {}), chapas: "agua" };
    localStorage.setItem("tv-gratis-chart-state", JSON.stringify(g));
  });
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(3000);
  const modo = () => page.evaluate(() =>
    JSON.parse(localStorage.getItem("tv-gratis-chart-state")).state.apariencia.chapas);
  ok("arranca en marca de agua", (await modo()) === "agua", String(await modo()));
  await boton().click();
  await page.waitForTimeout(600);
  ok("al apagar quedan ocultas", (await modo()) === "ocultas", String(await modo()));
  await boton().click();
  await page.waitForTimeout(600);
  ok("y al encender vuelve a marca de agua, no a normal",
    (await modo()) === "agua", String(await modo()));
}

console.log("5. Sobrevive a recargar la página");
{
  await boton().click();
  await page.waitForTimeout(500);
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(3000);
  ok("siguen ocultas después de recargar", (await chapas()) === 0, String(await chapas()));
  ok("y el botón lo refleja",
    (await boton().getAttribute("aria-pressed")) === "true");
}

ok("sin errores de JavaScript", errores.length === 0, errores.slice(0, 3).join(" | "));
await browser.close();
console.log(`\n${fallos.length === 0 ? "TODO BIEN" : `FALLARON ${fallos.length}:\n - ${fallos.join("\n - ")}`}`);
process.exit(fallos.length === 0 ? 0 : 1);
