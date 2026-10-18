/**
 * La pestaña de Estrategias, en el navegador. No se sube.
 *
 * Los datos son falsos pero DETERMINISTAS, y el mismo motor se corre
 * acá fuera para saber qué tiene que salir en la tabla. Así la prueba
 * no comprueba "que aparezca algo", sino que aparezca EXACTAMENTE lo
 * que el motor calcula.
 */
import { chromium } from "playwright";
import { correrEstrategia, CONFIG_POR_DEFECTO } from "./src/lib/estrategia/motor.ts";
import { correrDosFvg, DOSFVG_POR_DEFECTO } from "./src/lib/estrategia/dosfvg.ts";
import { resumir } from "./src/lib/estrategia/estadistica.ts";

const EXEC = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const URL_APP = "http://127.0.0.1:3119/estrategias";
const M5 = 300, M15 = 900, H4 = 14400;
const T0 = Math.floor(Date.now() / 1000 / H4) * H4 - 20000 * M5;

const vela = (t, o, h, l, c, v = 1000) => ({ time: t, open: o, high: h, low: l, close: c, volume: v });

/** Serie con ciclos: da montajes de sobra. Cada símbolo, su semilla. */
function serie(semilla, n = 20000) {
  let s = semilla;
  const r = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648 - 0.5);
  let p = 100;
  const m5 = [];
  for (let i = 0; i < n; i++) {
    const d = Math.sin(i / 2200) * 0.0010 + Math.sin(i / 260) * 0.0012;
    p = Math.max(1, p * (1 + d + r() * 0.005));
    const o = p / (1 + r() * 0.001);
    m5.push(vela(T0 + i * M5, o, Math.max(o, p) * 1.0015, Math.min(o, p) * 0.9985, p, 1000 + (i % 500)));
  }
  const ag = (f, k) => {
    const out = [];
    for (let i = 0; i < f.length; i += k) {
      const t = f.slice(i, i + k);
      if (!t.length) break;
      out.push(vela(t[0].time, t[0].open, Math.max(...t.map((x) => x.high)),
        Math.min(...t.map((x) => x.low)), t.at(-1).close, t.reduce((a, x) => a + x.volume, 0)));
    }
    return out;
  };
  return { m5, m15: ag(m5, 3), h4: ag(m5, 48) };
}

const SIMBOLOS = { BTCUSDT: 11, ETHUSDT: 222, SOLUSDT: 3333 };
const MUNDOS = Object.fromEntries(Object.entries(SIMBOLOS).map(([s, sem]) => [s, serie(sem)]));

// Lo que TIENE que salir, calculado acá con el mismo motor.
const esperado = {};
const esperado2 = {};
for (const [sym, W] of Object.entries(MUNDOS)) {
  const r = correrEstrategia(W.h4, W.m15, W.m5, M5, CONFIG_POR_DEFECTO);
  esperado[sym] = { ops: r.operaciones.length, res: resumir(r.operaciones.map((o) => o.erres)) };
  const d = correrDosFvg(W.h4, W.m15, DOSFVG_POR_DEFECTO);
  esperado2[sym] = { ops: d.operaciones.length, res: resumir(d.operaciones.map((o) => o.erres)) };
}
console.log("Esperado por el motor:");
for (const [s, e] of Object.entries(esperado)) {
  console.log(`  ${s}: ${e.ops} ops, ${e.res.n ? (100 * e.res.aciertos).toFixed(0) : 0}% aciertos, ${e.res.esperanza.toFixed(2)}R por op`);
}

const fallos = [];
const ok = (n, c, d = "") => {
  console.log(`  ${c ? "ok " : "MAL"} ${n}${!c && d ? ` — ${d}` : ""}`);
  if (!c) fallos.push(n);
};

const browser = await chromium.launch({ executablePath: EXEC });
const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
await ctx.route("**/api.bitget.com/**", (r) =>
  r.fulfill({ status: 200, contentType: "application/json", body: '{"data":[]}' }));
await ctx.route("**/api/alpaca**", (r) =>
  r.fulfill({ status: 200, contentType: "application/json", body: '{"bars":{}}' }));
for (const patron of ["**/api.binance.com/**", "**/fapi.binance.com/**"]) {
  await ctx.route(patron, (r) => {
    const u = new URL(r.request().url());
    if (!u.pathname.includes("klines")) {
      return r.fulfill({ status: 200, contentType: "application/json", body: "[]" });
    }
    const sym = (u.searchParams.get("symbol") ?? "").toUpperCase();
    const itv = u.searchParams.get("interval") ?? "5m";
    const W = MUNDOS[sym];
    if (!W) return r.fulfill({ status: 200, contentType: "application/json", body: "[]" });
    const fuente = itv === "4h" ? W.h4 : itv === "15m" ? W.m15 : W.m5;
    const seg = itv === "4h" ? H4 : itv === "15m" ? M15 : M5;
    // La app pagina hacia atrás con endTime: se respeta.
    const fin = Number(u.searchParams.get("endTime") ?? 0) || Infinity;
    const lim = Math.min(1000, Number(u.searchParams.get("limit") ?? 500));
    const hasta = fuente.filter((v) => v.time * 1000 < fin);
    const tramo = hasta.slice(Math.max(0, hasta.length - lim));
    r.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify(tramo.map((v) => [
        v.time * 1000, String(v.open), String(v.high), String(v.low), String(v.close),
        String(v.volume), v.time * 1000 + seg * 1000 - 1, "0", 10, "0", "0", "0",
      ])),
    });
  });
}

const page = await ctx.newPage();
const errores = [];
page.on("pageerror", (e) => errores.push(String(e)));

console.log("\n1. La pestaña existe y está separada");
await page.goto(URL_APP, { waitUntil: "domcontentloaded" });
await page.evaluate((syms) => {
  localStorage.setItem("tv-gratis-chart-state", JSON.stringify({
    state: {
      graficos: [{ id: "g1", symbol: "BIN:BTCUSDT", timeframe: "1d", indicators: {}, hidden: {} }],
      graficoActivoId: "g1", distribucion: "1",
      listas: [{ id: "l1", nombre: "Pruebas", simbolos: syms.map((s) => `BIN:${s}`) }],
      listaActivaId: "l1",
    }, version: 0,
  }));
}, Object.keys(SIMBOLOS));
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(1500);
{
  const txt = await page.locator("body").innerText();
  ok("se ve el título de la estrategia", txt.includes("Estrategia SMC"));
  ok("está la pestaña marcada como activa",
     await page.locator("span", { hasText: /^Estrategias$/ }).first().isVisible());
  ok("y las otras tres siguen ahí",
     ["Gráfico", "Opciones", "Backtesting"].every((x) => txt.includes(x)));
  ok("avisa que mide UNA codificación, no «la estrategia»",
     /una codificación/i.test(txt));
  ok("avisa del supuesto dentro de la vela", /se cobra el stop/i.test(txt));
  ok("y del problema de la muestra chica", /cien operaciones/i.test(txt));
}

console.log("\n2. Elegir activos y correr");
{
  // El nombre del grupo sale de la lista guardada, que el store sanea;
  // lo que importa es que los símbolos estén como botones.
  const grupos = await page.evaluate(() =>
    [...document.querySelectorAll("p")].map((x) => x.textContent.trim()).filter(Boolean));
  console.log(`     grupos: ${JSON.stringify(grupos.filter((g) => g.length < 30).slice(0, 8))}`);
  for (const s of Object.keys(SIMBOLOS)) {
    ok(`${s} aparece como botón para elegir`,
       await page.getByRole("button", { name: s, exact: true }).isVisible());
  }
  for (const s of Object.keys(SIMBOLOS)) {
    await page.getByRole("button", { name: s, exact: true }).click();
  }
  await page.waitForTimeout(300);
  ok("el botón dice cuántos hay elegidos",
     (await page.getByRole("button", { name: /Correr sobre/ }).innerText()).includes("3"));
  await page.getByRole("button", { name: /Correr sobre/ }).click();
  // La corrida baja tres series por activo; se le da tiempo.
  for (let i = 0; i < 120; i++) {
    await page.waitForTimeout(500);
    if (await page.locator("table").count()) break;
  }
  ok("sale la tabla de resultados", (await page.locator("table").count()) > 0);
}

console.log("\n3. Los números son los del motor, no otros");
{
  const filas = await page.evaluate(() =>
    [...document.querySelectorAll("table tbody tr")].map((tr) =>
      [...tr.querySelectorAll("td")].map((td) => td.textContent.trim())));
  ok("hay una fila por activo", filas.length === 3, String(filas.length));
  for (const [sym, e] of Object.entries(esperado)) {
    const fila = filas.find((f) => f[0] === sym);
    ok(`${sym}: está en la tabla`, !!fila, JSON.stringify(filas.map((f) => f[0])));
    if (!fila) continue;
    ok(`${sym}: el número de operaciones coincide con el motor`,
       Number(fila[1]) === e.ops, `tabla ${fila[1]} vs motor ${e.ops}`);
    if (e.ops > 0) {
      const porOp = parseFloat(fila[3].replace("R", "").replace("+", ""));
      ok(`${sym}: la esperanza coincide`,
         Math.abs(porOp - e.res.esperanza) < 0.011,
         `tabla ${porOp} vs motor ${e.res.esperanza.toFixed(2)}`);
      ok(`${sym}: lleva su margen de error al lado`, /…/.test(fila[4]), fila[4]);
    }
  }
  // El total global tiene que ser la suma, no un promedio de promedios.
  const totalOps = Object.values(esperado).reduce((s, e) => s + e.ops, 0);
  ok("el resumen de arriba suma todas las operaciones",
     (await page.locator("body").innerText()).includes(String(totalOps)),
     String(totalOps));
  await page.screenshot({ path: "shots/estrategias.png", fullPage: true });
}

console.log("\n4. Dice honestamente qué se puede concluir");
{
  const txt = await page.locator("body").innerText();
  ok("o bien afirma que hay ventaja, o bien que no alcanza",
     /Hay ventaja medible/i.test(txt) || /no se puede concluir/i.test(txt));
  const filas = await page.evaluate(() =>
    [...document.querySelectorAll("table tbody tr")].map((tr) =>
      [...tr.querySelectorAll("td")].map((td) => td.textContent.trim())));
  ok("cada fila dice qué se puede decir de ella",
     filas.every((f) => f[6] && f[6].length > 3), JSON.stringify(filas.map((f) => f[6])));
  ok("con pocas operaciones marca que la muestra no alcanza",
     filas.some((f) => /insuficiente|ruido|Nunca/i.test(f[6])),
     JSON.stringify(filas.map((f) => f[6])));
}

console.log("\n5. Los costos cambian el resultado");
{
  const antes = await page.evaluate(() =>
    [...document.querySelectorAll("table tbody tr")].map((tr) => tr.querySelectorAll("td")[5].textContent.trim()));
  // Comisión y spread a cero.
  const nums = page.locator('input[type="number"]');
  await nums.nth(0).fill("0");
  await nums.nth(1).fill("0");
  await page.waitForTimeout(300);
  await page.getByRole("button", { name: /Correr sobre/ }).click();
  for (let i = 0; i < 120; i++) {
    await page.waitForTimeout(500);
    if (await page.locator("table").count()) break;
  }
  await page.waitForTimeout(1500);
  const despues = await page.evaluate(() =>
    [...document.querySelectorAll("table tbody tr")].map((tr) => tr.querySelectorAll("td")[5].textContent.trim()));
  ok("sin costos el resultado mejora", JSON.stringify(antes) !== JSON.stringify(despues),
     `${JSON.stringify(antes)} -> ${JSON.stringify(despues)}`);
  const sum = (a) => a.reduce((s, x) => s + (parseFloat(x) || 0), 0);
  ok("y mejora para arriba, nunca para abajo", sum(despues) > sum(antes),
     `${sum(antes).toFixed(1)}R -> ${sum(despues).toFixed(1)}R`);
}

console.log("\n6. La segunda estrategia es OTRA, no una variante");
{
  console.log("     Esperado por el motor de dos FVG:");
  for (const [s, e] of Object.entries(esperado2)) {
    console.log(`       ${s}: ${e.ops} ops, ${e.res.esperanza.toFixed(2)}R por op`);
  }
  await page.getByRole("button", { name: /Dos FVG/ }).click();
  await page.waitForTimeout(400);
  const txt = await page.locator("body").innerText();
  ok("cambia el título", /dos FVG/i.test(txt), txt.slice(0, 120));
  ok("avisa que el planteo no dice dónde va el stop",
     /no dice dónde va el stop/i.test(txt));
  ok("cambiar de estrategia tira la tabla de la otra",
     (await page.locator("table").count()) === 0);
  ok("desaparece la temporalidad de entrada, que esta no usa",
     !/Temporalidad de entrada/i.test(txt));
  ok("y aparece el stop como decisión explícita", /Dónde va el stop/i.test(txt));

  // Los costos quedaron en 0 de la sección 5; se reponen para que los
  // números sean los del motor con su configuración por defecto.
  const nums = page.locator('input[type="number"]');
  await nums.nth(0).fill(String(DOSFVG_POR_DEFECTO.comision));
  await nums.nth(1).fill(String(DOSFVG_POR_DEFECTO.spread));
  await page.waitForTimeout(300);
  await page.getByRole("button", { name: /Correr sobre/ }).click();
  for (let i = 0; i < 120; i++) {
    await page.waitForTimeout(500);
    if (await page.locator("table").count()) break;
  }
  await page.waitForTimeout(1200);
  const filas = await page.evaluate(() =>
    [...document.querySelectorAll("table tbody tr")].map((tr) =>
      [...tr.querySelectorAll("td")].map((td) => td.textContent.trim())));
  ok("sale la tabla de la estrategia nueva", filas.length === 3, String(filas.length));
  for (const [sym, e] of Object.entries(esperado2)) {
    const fila = filas.find((f) => f[0] === sym);
    if (!fila) { ok(`${sym}: está en la tabla`, false, JSON.stringify(filas.map((f) => f[0]))); continue; }
    ok(`${sym}: las operaciones son las del motor de dos FVG`,
       Number(fila[1]) === e.ops, `tabla ${fila[1]} vs motor ${e.ops}`);
    if (e.ops > 0) {
      const porOp = parseFloat(fila[3].replace("R", "").replace("+", ""));
      ok(`${sym}: la esperanza coincide`, Math.abs(porOp - e.res.esperanza) < 0.011,
         `tabla ${porOp} vs motor ${e.res.esperanza.toFixed(2)}`);
    }
  }
  // Y lo que importa de verdad: que no esté mostrando los de la otra.
  const distinta = Object.keys(SIMBOLOS).some(
    (s) => esperado[s].ops !== esperado2[s].ops);
  ok("los dos motores dan resultados distintos, así que la prueba discrimina", distinta,
     `${JSON.stringify(Object.fromEntries(Object.keys(SIMBOLOS).map((s) => [s, [esperado[s].ops, esperado2[s].ops]])))}`);
  await page.screenshot({ path: "shots/estrategias-dosfvg.png", fullPage: true });

  // Volver a la primera no debe dejar la tabla de la segunda puesta.
  await page.getByRole("button", { name: /SMC de tres tiempos/ }).click();
  await page.waitForTimeout(400);
  ok("y volver atrás también tira la tabla", (await page.locator("table").count()) === 0);
}

ok("sin errores de JavaScript", errores.length === 0, errores.slice(0, 3).join(" | "));
await browser.close();
console.log(`\n${fallos.length === 0 ? "TODO BIEN" : `FALLARON ${fallos.length}:\n - ${fallos.join("\n - ")}`}`);
process.exit(fallos.length === 0 ? 0 : 1);
