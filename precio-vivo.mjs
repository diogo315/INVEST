/**
 * El precio de la cabecera se mueve con la vela, no solo con el ticker.
 *
 * El síntoma: «quiero ver en tiempo real cómo varía el valor, no
 * esperar a que se cumpla el tiempo de la vela». Y era literal. La vela
 * y los indicadores sí seguían cada tick; el número grande no, porque
 * colgaba de otro stream —el ticker de 24 h— que llega a su propio
 * ritmo. Resultado: la vela bajaba a la vista y el precio seguía
 * marcando el valor con el que se cargó la página.
 *
 * Lo peor no era el retraso sino la contradicción: con tres
 * temporalidades a la vista, cada cabecera podía decir algo distinto de
 * la vela que tiene debajo.
 *
 * Acá no hay red: el WebSocket se reemplaza por uno de mentira y la
 * prueba empuja ticks a mano. Es la única forma de separar «el precio
 * sigue a la vela» de «el precio sigue al ticker», que con datos
 * reales llegan casi a la vez y no se distinguen.
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

// El ticker de 24 h dice esto al cargar. La apertura sale de acá:
// 80.598 / (1 + 0,5/100) = 80.197,0…
const PRECIO_REST = 80598;
const PCT_REST = 0.5;
const APERTURA = PRECIO_REST / (1 + PCT_REST / 100);

function velas(seg, n = 300) {
  const fin = Math.floor(Date.now() / 1000 / seg) * seg;
  return Array.from({ length: n }, (_, i) => {
    const t = (fin - (n - 1 - i) * seg) * 1000;
    const p = 80500 + ((i * 31) % 400);
    return [t, String(p), String(p + 40), String(p - 40), String(p + 10), "100",
      t + seg * 1000 - 1, "0", 10, "0", "0", "0"];
  });
}

const browser = await chromium.launch({ executablePath: EXEC });
const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 } });
await ctx.addInitScript(() => {
  window.__ws = [];
  class FakeWS {
    constructor(url) { this.url = url; this.readyState = 1; window.__ws.push(this); setTimeout(() => this.onopen?.({}), 0); }
    send() {}
    close() { this.readyState = 3; this.onclose?.({}); }
  }
  FakeWS.OPEN = 1;
  window.WebSocket = FakeWS;
  const empujar = (cuerpo) => {
    let n = 0;
    for (const w of window.__ws) if (w.readyState === 1 && w.onmessage) { w.onmessage({ data: cuerpo }); n++; }
    return n;
  };
  /** Un tick de la vela EN FORMACIÓN (x: false). */
  window.__kline = (tf, abre, cierre) =>
    empujar(JSON.stringify({
      stream: `btcusdt@kline_${tf}`,
      data: {
        e: "kline", E: Date.now(), s: "BTCUSDT",
        k: { t: abre * 1000, T: 0, s: "BTCUSDT", i: tf, o: String(cierre - 5),
          c: String(cierre), h: String(cierre + 30), l: String(cierre - 30), v: "500", x: false },
      },
    }));
  /** Un tick del ticker de 24 h. */
  window.__ticker = (cierre, apertura) =>
    empujar(JSON.stringify({
      stream: "btcusdt@miniTicker",
      data: { e: "24hrMiniTicker", E: Date.now(), s: "BTCUSDT",
        c: String(cierre), o: String(apertura), h: "0", l: "0", v: "0", q: "0" },
    }));
});
await ctx.route("**/api.bitget.com/**", (r) =>
  r.fulfill({ status: 200, contentType: "application/json", body: '{"data":[]}' }));
await ctx.route("**/api/alpaca**", (r) =>
  r.fulfill({ status: 200, contentType: "application/json", body: '{"bars":{}}' }));
for (const patron of ["**/api.binance.com/**", "**/fapi.binance.com/**"]) {
  await ctx.route(patron, (r) => {
    const u = new URL(r.request().url());
    const json = (b) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(b) });
    if (u.pathname.includes("klines")) return json(velas(SEG[u.searchParams.get("interval")] ?? 300));
    if (u.pathname.includes("ticker"))
      return json(u.searchParams.get("symbol")
        ? { symbol: "BTCUSDT", lastPrice: String(PRECIO_REST), priceChange: "400",
            priceChangePercent: String(PCT_REST), volume: "1", quoteVolume: "1" }
        : []);
    return json([]);
  });
}

const page = await ctx.newPage();
const errores = [];
page.on("pageerror", (e) => errores.push(String(e)));

const uno = (id, tf) => ({
  id, symbol: "BINF:BTCUSDT", timeframe: tf,
  indicators: { medias: true, volume: true, rsi: true }, hidden: {}, ordenPaneles: [],
});

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
  await page.waitForTimeout(3200);
}

/** Los precios que muestran las cabeceras, como números. */
const precios = async () =>
  page.evaluate(() =>
    [...document.querySelectorAll("[data-precio]")].map((e) => Number(e.getAttribute("data-precio"))));
/** Los porcentajes que se ven al lado. */
const pcts = async () =>
  page.evaluate(() =>
    [...document.querySelectorAll("[data-precio]")].map((e) => {
      const t = e.parentElement?.textContent ?? "";
      const m = t.match(/([+-]?\d+\.\d\d)\s*%/);
      return m ? parseFloat(m[1]) : null;
    }));

const abre = (tf) => Math.floor(Date.now() / 1000 / SEG[tf]) * SEG[tf];

console.log("1. Un tick de vela mueve el precio, sin esperar a que cierre");
await montar([uno("g1", "5m")], "1");
{
  ok("arranca en el precio del ticker", (await precios())[0] === PRECIO_REST,
    JSON.stringify(await precios()));

  const n = await page.evaluate(([t]) => window.__kline("5m", t, 80900), [abre("5m")]);
  ok("el tick llegó a algún socket", n > 0, String(n));
  await page.waitForTimeout(900);
  ok("el precio siguió a la vela", (await precios())[0] === 80900,
    JSON.stringify(await precios()));

  // Varios ticks seguidos: tiene que ir detrás de cada uno.
  for (const p of [80750, 80810, 80680]) {
    await page.evaluate(([t, c]) => window.__kline("5m", t, c), [abre("5m"), p]);
    await page.waitForTimeout(500);
    ok(`sigue al tick de ${p}`, (await precios())[0] === p, JSON.stringify(await precios()));
  }
}

console.log("2. El porcentaje sigue siendo el de 24 h, no el de la vela");
{
  // Con apertura de 24 h en ~80.197 y precio 80.680, el cambio es ~0,60 %.
  const esperado = ((80680 - APERTURA) / APERTURA) * 100;
  const visto = (await pcts())[0];
  ok("el porcentaje se recalcula contra la apertura de 24 h",
    visto !== null && Math.abs(visto - esperado) < 0.02,
    `visto ${visto} vs esperado ${esperado.toFixed(2)}`);
  // Y NO es el de la vela, que sería (80680-80675)/80675 ≈ 0,006 %.
  ok("y no es el cambio de la vela, que sería casi cero",
    visto !== null && Math.abs(visto) > 0.1, String(visto));
}

console.log("3. El ticker de 24 h sigue mandando cuando llega");
{
  await page.evaluate(() => window.__ticker(81000, 80000));
  await page.waitForTimeout(700);
  ok("un tick del ticker también mueve el precio", (await precios())[0] === 81000,
    JSON.stringify(await precios()));
  const visto = (await pcts())[0];
  ok("con su propio porcentaje", visto !== null && Math.abs(visto - 1.25) < 0.02, String(visto));
}

console.log("4. Tres temporalidades: ninguna contradice a su propia vela");
await montar([uno("g1", "1d"), uno("g2", "15m"), uno("g3", "5m")], "3v");
{
  ok("se ven las tres cabeceras", (await precios()).length === 3, JSON.stringify(await precios()));
  // Un tick por temporalidad, todos al mismo precio: es el mismo activo.
  for (const tf of ["1d", "15m", "5m"]) {
    await page.evaluate(([t, c, f]) => window.__kline(f, t, c), [abre(tf), 80777, tf]);
    await page.waitForTimeout(400);
  }
  await page.waitForTimeout(600);
  const p = await precios();
  ok("las tres marcan el mismo precio", new Set(p).size === 1, JSON.stringify(p));
  ok("y es el del tick", p[0] === 80777, JSON.stringify(p));
  await page.screenshot({ path: "shots/precio-vivo.png" });
}

console.log("5. En replay el precio NO salta al de ahora");
{
  // El gráfico está en el pasado: un tick de ahora pintaría el futuro.
  const antes = (await precios())[0];
  await page.evaluate(() => {
    const g = JSON.parse(localStorage.getItem("tv-gratis-chart-state"));
    g.state.graficos = g.state.graficos.slice(0, 1);
    g.state.distribucion = "1";
    localStorage.setItem("tv-gratis-chart-state", JSON.stringify(g));
  });
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(3000);
  const botonReplay = page.getByRole("button", { name: /replay/i }).first();
  if (await botonReplay.isVisible().catch(() => false)) {
    await botonReplay.click();
    await page.waitForTimeout(600);
    const z = await page.evaluate(() => {
      const c = [...document.querySelectorAll("canvas")].map((x) => x.getBoundingClientRect())
        .filter((r) => r.width > 300 && r.height > 100)[0];
      return c ? { x: Math.round(c.x + c.width * 0.4), y: Math.round(c.y + c.height / 2) } : null;
    });
    if (z) {
      await page.mouse.click(z.x, z.y);
      await page.waitForTimeout(900);
      const enReplay = (await precios())[0];
      await page.evaluate(([t]) => window.__kline("1d", t, 99999), [abre("1d")]);
      await page.waitForTimeout(800);
      ok("un tick de ahora no mueve el precio del replay",
        (await precios())[0] === enReplay, `${enReplay} -> ${(await precios())[0]}`);
    } else ok("se pudo entrar al replay", false);
  } else {
    ok("hay botón de replay", false, "no se encontró");
  }
  void antes;
}

ok("sin errores de JavaScript", errores.length === 0, errores.slice(0, 3).join(" | "));
await browser.close();
console.log(`\n${fallos.length === 0 ? "TODO BIEN" : `FALLARON ${fallos.length}:\n - ${fallos.join("\n - ")}`}`);
process.exit(fallos.length === 0 ? 0 : 1);
