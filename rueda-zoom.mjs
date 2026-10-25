/**
 * La rueda del mouse hace zoom, esté el cursor donde esté.
 *
 * El síntoma que lo originó: «con la rueda no pasa nada». Y era cierto a
 * medias —sobre el canvas pelado sí funcionaba—, por eso costó verlo.
 *
 * La causa: las chapas de los indicadores, la capa de dibujos y los
 * botones son HTML por encima del canvas y HERMANOS del div del chart.
 * Una rueda sobre ellos no llega al gráfico, porque el que escucha está
 * al costado y los eventos suben, no bajan. En una vista de tres
 * gráficos los paneles de indicador miden unos 60 px y la chapa ocupa
 * 21: uno le apunta a una chapa la mitad de las veces.
 *
 * Por eso esta prueba no comprueba «la rueda hace zoom» en abstracto,
 * sino sobre CADA cosa que se dibuja encima, una por una.
 */
import { chromium } from "playwright";

const EXEC = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const URL_APP = "http://127.0.0.1:3119/";
const SEG = { "1d": 86400, "4h": 14400, "15m": 900, "5m": 300 };
// La ventana de Diego cuando lo reportó. El tamaño importa: cuanto más
// chico el panel, más fracción tapa la chapa.
const ANCHO = 1338;
const ALTO = 658;

const fallos = [];
const ok = (n, c, d = "") => {
  console.log(`  ${c ? "ok " : "MAL"} ${n}${!c && d ? ` — ${d}` : ""}`);
  if (!c) fallos.push(n);
};

function velas(seg, n = 500) {
  const fin = Math.floor(Date.now() / 1000 / seg) * seg;
  return Array.from({ length: n }, (_, i) => {
    const t = (fin - (n - 1 - i) * seg) * 1000;
    const p = 81000 + ((i * 37) % 900) + Math.sin(i / 7) * 150;
    return [t, String(p), String(p + 60), String(p - 60), String(p + 15), "100",
      t + seg * 1000 - 1, "0", 10, "0", "0", "0"];
  });
}

const TODOS = { medias: true, volume: true, vwap: true, cipher: true, rsi: true, srsi: true };

const browser = await chromium.launch({ executablePath: EXEC });
const ctx = await browser.newContext({ viewport: { width: ANCHO, height: ALTO } });
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

async function montar(graficos, distribucion) {
  await page.goto(URL_APP, { waitUntil: "domcontentloaded" });
  await page.evaluate(([g, d]) => {
    localStorage.setItem("tv-gratis-chart-state", JSON.stringify({
      state: {
        graficos: g, graficoActivoId: g[0].id, distribucion: d,
        listas: [{ id: "l1", nombre: "P", simbolos: ["BINF:BTCUSDT"] }], listaActivaId: "l1",
      }, version: 0,
    }));
  }, [graficos, distribucion]);
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(3500);
}

/** Los canvas grandes, sin duplicados (la librería apila dos por panel). */
const paneles = async () =>
  page.evaluate(() => {
    const v = [];
    for (const c of document.querySelectorAll("canvas")) {
      const r = c.getBoundingClientRect();
      const caja = { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) };
      if (caja.width < 120 || caja.height < 40) continue;
      if (!v.some((o) => o.x === caja.x && o.y === caja.y)) v.push(caja);
    }
    return v.sort((a, b) => a.x - b.x || a.y - b.y);
  });

/** Gira la rueda en un punto y dice si el dibujo de `zona` cambió. */
async function rueda(x, y, zona, vueltas = 2) {
  await page.mouse.move(x, y);
  await page.waitForTimeout(250);
  const antes = await page.screenshot({ clip: zona });
  for (let i = 0; i < vueltas; i++) {
    await page.mouse.wheel(0, -500);
    await page.waitForTimeout(450);
  }
  const despues = await page.screenshot({ clip: zona });
  return Buffer.compare(antes, despues) !== 0;
}

const uno = (id, tf) => ({ id, symbol: "BINF:BTCUSDT", timeframe: tf, indicators: { ...TODOS }, hidden: {}, ordenPaneles: [] });

console.log("1. Un gráfico con todo puesto: la rueda sobre CADA chapa");
await montar([uno("g1", "1d")], "1");
{
  const zonas = await paneles();
  const precio = zonas[0];
  ok("hay panel de precio", !!precio && precio.height > 100, JSON.stringify(precio));
  ok("sobre el canvas, lejos de todo, hace zoom", await rueda(
    precio.x + precio.width / 2, precio.y + precio.height * 0.8, precio));

  const chapas = await page.evaluate(() =>
    [...document.querySelectorAll(".group\\/pill")].map((e) => {
      const r = e.getBoundingClientRect();
      return {
        t: (e.textContent ?? "").trim().slice(0, 18),
        x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2),
        w: Math.round(r.width), h: Math.round(r.height),
      };
    }));
  ok("están las seis chapas", chapas.length === 6, String(chapas.length));
  for (const c of chapas) {
    ok(`la rueda sobre «${c.t}» (${c.w}×${c.h}) hace zoom`,
      await rueda(c.x, c.y, precio));
  }
}

console.log("2. Y sobre los botones que también van encima");
{
  const zonas = await paneles();
  const precio = zonas[0];
  const botones = await page.evaluate(() =>
    [...document.querySelectorAll('button[aria-label*="antalla"], button[title*="antalla"], button[aria-label="Configurar"]')]
      .slice(0, 2).map((e) => {
        const r = e.getBoundingClientRect();
        return { t: e.getAttribute("aria-label") ?? e.getAttribute("title") ?? "", x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
      }));
  if (botones.length === 0) ok("se encontró algún botón encima del chart", false);
  for (const b of botones) {
    ok(`la rueda sobre el botón «${b.t}» hace zoom`, await rueda(b.x, b.y, precio));
  }
}

console.log("3. La disposición del reporte: tres vistas, ventana chica");
await montar([uno("g1", "1d"), uno("g2", "15m"), uno("g3", "5m")], "3v");
{
  const zonas = await paneles();
  const porVista = new Map();
  for (const z of zonas) {
    const k = z.x;
    if (!porVista.has(k)) porVista.set(k, []);
    porVista.get(k).push(z);
  }
  ok("se ven las tres vistas", porVista.size === 3, String(porVista.size));

  // Cuánto tapan las chapas de cada panel: el número que explica por qué
  // «no anda» era una conclusión razonable.
  const tapado = await page.evaluate(() => {
    const canvas = [...document.querySelectorAll("canvas")].map((c) => c.getBoundingClientRect())
      .filter((r) => r.width > 100 && r.height > 30);
    const chapas = [...document.querySelectorAll(".group\\/pill")].map((e) => e.getBoundingClientRect());
    let peor = 0;
    for (const c of canvas) {
      let a = 0;
      for (const p of chapas) {
        const w = Math.max(0, Math.min(p.right, c.right) - Math.max(p.left, c.left));
        const h = Math.max(0, Math.min(p.bottom, c.bottom) - Math.max(p.top, c.top));
        a += w * h;
      }
      peor = Math.max(peor, a / (c.width * c.height));
    }
    return Math.round(peor * 100);
  });
  console.log(`     la chapa llega a tapar el ${tapado}% de un panel`);
  ok("hay paneles donde la chapa tapa una parte seria", tapado >= 15, `${tapado}%`);

  let i = 0;
  for (const [, lista] of porVista) {
    i++;
    const principal = lista.sort((a, b) => b.height - a.height)[0];
    const chico = lista.sort((a, b) => a.height - b.height)[0];
    ok(`vista ${i}: zoom sobre el canvas`, await rueda(
      principal.x + principal.width / 2, principal.y + principal.height * 0.8, principal));
    // El panel chico es donde la chapa tapa casi todo: el caso real.
    ok(`vista ${i}: zoom con el cursor sobre el panel chico`, await rueda(
      chico.x + chico.width / 2, chico.y + 10, principal));
  }
}

console.log("4. La página no se desplaza por detrás");
{
  const antes = await page.evaluate(() => window.scrollY + (document.scrollingElement?.scrollTop ?? 0));
  const z = (await paneles())[0];
  await page.mouse.move(z.x + z.width / 2, z.y + z.height / 2);
  for (let k = 0; k < 6; k++) { await page.mouse.wheel(0, -400); await page.waitForTimeout(150); }
  await page.waitForTimeout(400);
  const despues = await page.evaluate(() => window.scrollY + (document.scrollingElement?.scrollTop ?? 0));
  ok("la ventana queda donde estaba", antes === despues, `${antes} -> ${despues}`);
  await page.screenshot({ path: "shots/rueda-zoom.png" });
}

ok("sin errores de JavaScript", errores.length === 0, errores.slice(0, 3).join(" | "));
await browser.close();
console.log(`\n${fallos.length === 0 ? "TODO BIEN" : `FALLARON ${fallos.length}:\n - ${fallos.join("\n - ")}`}`);
process.exit(fallos.length === 0 ? 0 : 1);
