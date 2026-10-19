/**
 * Buscar macro en español, en el navegador.
 *
 * El caso que lo originó: escribir «indice del dolar» devolvía «Sin
 * resultados» aunque UUP estuviera en el catálogo, porque los atajos se
 * comparaban por igualdad exacta y nadie escribe solo «dolar».
 *
 * Y lo segundo, que importa más: que la advertencia se vea ANTES de
 * hacer clic. VIXY no es el VIX, y enterarse después de abrir el
 * gráfico no sirve de nada.
 */
import { chromium } from "playwright";

const EXEC = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const URL_APP = "http://127.0.0.1:3119/";

const fallos = [];
const ok = (n, c, d = "") => {
  console.log(`  ${c ? "ok " : "MAL"} ${n}${!c && d ? ` — ${d}` : ""}`);
  if (!c) fallos.push(n);
};

/** El catálogo de bolsa que simulamos: los papeles macro y un par más. */
const ACCIONES = [
  ["UUP", "Invesco DB US Dollar Index Bullish Fund"],
  ["UDN", "Invesco DB US Dollar Index Bearish Fund"],
  ["VIXY", "ProShares VIX Short-Term Futures ETF"],
  ["VXX", "iPath Series B S&P 500 VIX Short-Term Futures ETN"],
  ["TLT", "iShares 20+ Year Treasury Bond ETF"],
  ["IEF", "iShares 7-10 Year Treasury Bond ETF"],
  ["SHY", "iShares 1-3 Year Treasury Bond ETF"],
  ["BIL", "SPDR Bloomberg 1-3 Month T-Bill ETF"],
  ["HYG", "iShares iBoxx High Yield Corporate Bond ETF"],
  ["GLD", "SPDR Gold Shares"],
  ["AAPL", "Apple Inc"],
  ["SPY", "SPDR S&P 500 ETF Trust"],
];

function velas(n = 300) {
  const seg = 900;
  const fin = Math.floor(Date.now() / 1000 / seg) * seg;
  return Array.from({ length: n }, (_, i) => {
    const t = (fin - (n - 1 - i) * seg) * 1000;
    const p = 100 + (i % 20);
    return [t, String(p), String(p + 1), String(p - 1), String(p + 0.5), "10",
      t + seg * 1000 - 1, "0", 5, "0", "0", "0"];
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
await ctx.route("**/api/alpaca**", (r) => {
  const u = new URL(r.request().url());
  const json = (b) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(b) });
  if (u.searchParams.get("recurso") === "catalogo")
    return json({ activos: ACCIONES.map(([s, n]) => ({ s, n })) });
  if (u.searchParams.get("recurso") === "nombres")
    return json({ nombres: Object.fromEntries(ACCIONES) });
  return json({ bars: {} });
});
for (const patron of ["**/api.binance.com/**", "**/fapi.binance.com/**"]) {
  await ctx.route(patron, (r) => {
    const u = new URL(r.request().url());
    const json = (b) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(b) });
    if (u.pathname.endsWith("/exchangeInfo"))
      return json({ symbols: [{ symbol: "BTCUSDT", baseAsset: "BTC", quoteAsset: "USDT", status: "TRADING" }] });
    if (u.pathname.includes("klines")) return json(velas());
    if (u.pathname.includes("ticker")) return json([]);
    return json({});
  });
}

const page = await ctx.newPage();
const errores = [];
page.on("pageerror", (e) => errores.push(String(e)));
await page.goto(URL_APP, { waitUntil: "networkidle" });
await page.waitForTimeout(2500);

/** Abre el buscador y escribe. Devuelve lo que se ve. */
async function buscar(texto) {
  const caja = page.getByPlaceholder(/Ticker o nombre/i);
  if (!(await caja.isVisible().catch(() => false))) {
    await page.getByRole("button", { name: /BTCUSDT/ }).first().click();
    await page.waitForTimeout(500);
  }
  const c = page.getByPlaceholder(/Ticker o nombre/i);
  await c.fill("");
  await c.fill(texto);
  await page.waitForTimeout(600);
  return page.evaluate(() => {
    const raiz = document.querySelector('[role="dialog"]') ?? document.body;
    const filas = [...raiz.querySelectorAll("[data-indice]")].map((e) =>
      (e.textContent ?? "").trim());
    return { texto: (raiz.textContent ?? "").trim(), filas };
  });
}

console.log("1. «indice del dolar» — el caso que no andaba");
{
  const r = await buscar("indice del dolar");
  ok("ya no dice «sin resultados»", !/Sin resultados/i.test(r.texto));
  ok("UUP es el primero", (r.filas[0] ?? "").includes("UUP"),
     JSON.stringify(r.filas.slice(0, 3)));
  ok("explica qué es", /canasta de monedas/i.test(r.texto));
  ok("y avisa de que no es el DXY", /no es el dxy/i.test(r.texto),
     r.texto.slice(0, 200));
  await page.screenshot({ path: "shots/macro-dolar.png" });
}

console.log("2. Volatilidad: la advertencia tiene que verse antes del clic");
{
  const r = await buscar("volatilidad");
  ok("VIXY es el primero", (r.filas[0] ?? "").includes("VIXY"),
     JSON.stringify(r.filas.slice(0, 3)));
  ok("avisa de que son futuros, no el VIX", /futuros del vix/i.test(r.texto),
     r.texto.slice(0, 250));
  ok("y nombra el contango, que es el porqué", /contango/i.test(r.texto));
  await page.screenshot({ path: "shots/macro-volatilidad.png" });
}

console.log("3. Más formas de escribirlo");
{
  for (const [q, esperado] of [
    ["vix", "VIXY"], ["dxy", "UUP"], ["dolar", "UUP"],
    ["bonos del tesoro", "TLT"], ["bono 10 anos", "IEF"], ["tasas", "BIL"],
  ]) {
    const r = await buscar(q);
    ok(`«${q}» → ${esperado}`, (r.filas[0] ?? "").includes(esperado),
       JSON.stringify(r.filas.slice(0, 2)));
  }
}

console.log("4. Lo que todavía no hay, se dice en vez de callarse");
{
  const r = await buscar("desempleo");
  ok("reconoce el concepto", /desempleo de ee/i.test(r.texto), r.texto.slice(0, 200));
  ok("dice que no hay ETF", /no hay etf/i.test(r.texto));
  ok("y que llega con FRED", /FRED/.test(r.texto));
  ok("no muestra «sin resultados» a secas",
     !/Sin resultados para/i.test(r.texto));
}

console.log("5. No caza pedazos de palabra");
{
  const r = await buscar("ahorro");
  ok("«ahorro» no ofrece oro", !(r.filas[0] ?? "").includes("GLD"),
     JSON.stringify(r.filas.slice(0, 2)));
  ok("ni explica nada del oro", !/oro f[ií]sico/i.test(r.texto));
}

console.log("6. Buscar por ticker sigue igual");
{
  const r = await buscar("AAPL");
  ok("AAPL primero", (r.filas[0] ?? "").includes("AAPL"), JSON.stringify(r.filas.slice(0, 2)));
  ok("sin banderas de macro", !/canasta de monedas/i.test(r.texto));
}

ok("sin errores de JavaScript", errores.length === 0, errores.slice(0, 3).join(" | "));
await browser.close();
console.log(`\n${fallos.length === 0 ? "TODO BIEN" : `FALLARON ${fallos.length}:\n - ${fallos.join("\n - ")}`}`);
process.exit(fallos.length === 0 ? 0 : 1);
