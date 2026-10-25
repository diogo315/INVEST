/**
 * El panel lateral plegable.
 *
 * Lo que importa de verdad no es que el botón exista: es que al plegar
 * las gráficas se hagan MÁS ANCHAS, que es para lo que sirve. Se mide el
 * ancho antes y después.
 */
import pw from "/opt/npm-tools/node_modules/playwright/index.js";
const { chromium } = pw;

const BASE = "http://127.0.0.1:3137";
const fallos = [];
const ck = (n, c, d = "") => {
  console.log(`  ${c ? "ok " : "MAL"} ${n}${!c && d ? ` -- ${d}` : ""}`);
  if (!c) fallos.push(n);
};

const TF = { "5m": 300, "15m": 900, "1h": 3600, "4h": 14400, "1d": 86400, "1w": 604800 };
const INICIO = Math.floor(Date.UTC(2024, 0, 1) / 1000);
const HOY = Math.floor(Date.now() / 1000);
function velas(tfSeg, finSeg, limite) {
  const out = [];
  const ultimo = Math.floor(Math.min(finSeg, HOY) / tfSeg) * tfSeg;
  for (let i = limite - 1; i >= 0; i--) {
    const t = ultimo - i * tfSeg;
    if (t < INICIO) continue;
    const x = (t - INICIO) / 86400;
    const p = 60000 + 25000 * Math.sin(x / 40);
    out.push([t * 1000, String(p), String(p * 1.006), String(p * 0.994), String(p * 1.002),
      "1000", (t + tfSeg) * 1000 - 1, "0", 0, "0", "0", "0"]);
  }
  return out;
}

const DESDE = Math.floor(Date.UTC(2026, 0, 1) / 1000);
const estado = {
  state: {
    backtests: [{
      id: "p1", nombre: "Prueba", simbolo: "BIN:BTCUSDT", temporalidad: "1d",
      desde: DESDE, capitalInicial: 5000, operaciones: [], tiempoActual: DESDE,
      historiaPrevia: 365, medias: [], indicadores: [], zonaHoraria: "UTC", creado: INICIO,
    }],
    activoId: "p1",
    borrador: { simbolo: "BIN:BTCUSDT", desde: "", temporalidad: "1d", capital: 5000, historia: 365 },
  },
  version: 0,
};

const navegador = await chromium.launch();
async function abrir() {
  const pag = await navegador.newPage({ viewport: { width: 1600, height: 950 } });
  pag.on("pageerror", (e) => fallos.push(`error de página: ${e.message}`));
  await pag.route("**/api.binance.com/**", (ruta) => {
    const u = new URL(ruta.request().url());
    if (!u.pathname.includes("/klines")) {
      return ruta.fulfill({ status: 200, contentType: "application/json", body: "[]" });
    }
    const tf = u.searchParams.get("interval");
    const limite = Number(u.searchParams.get("limit") || 500);
    const end = u.searchParams.get("endTime");
    return ruta.fulfill({ status: 200, contentType: "application/json",
      body: JSON.stringify(velas(TF[tf], end ? Number(end) / 1000 : HOY, limite)) });
  });
  await pag.addInitScript((v) => localStorage.setItem("tv-gratis-backtest", v), JSON.stringify(estado));
  await pag.goto(`${BASE}/backtesting`, { waitUntil: "networkidle" });
  await pag.waitForTimeout(2400);
  return pag;
}
const anchoGrafica = (p) => p.evaluate(() => {
  const c = [...document.querySelectorAll("canvas")]
    .map((x) => x.getBoundingClientRect())
    .filter((r) => r.width > 200 && r.height > 200);
  return c.length ? Math.max(...c.map((r) => r.width)) : 0;
});

console.log("Plegar y desplegar");
{
  const pag = await abrir();
  const plegar = pag.getByRole("button", { name: /Plegar el panel/i });
  ck("arranca desplegado y hay botón de plegar", await plegar.count() > 0);
  ck("se ve el botón de comprar", await pag.getByRole("button", { name: /^Comprar$/ }).count() > 0);
  const antes = await anchoGrafica(pag);

  await plegar.click();
  await pag.waitForTimeout(900);
  ck("al plegar desaparece el panel de operar",
    await pag.getByRole("button", { name: /^Comprar$/ }).count() === 0);
  const despues = await anchoGrafica(pag);
  ck(`LA GRÁFICA SE HACE MÁS ANCHA (${Math.round(antes)} → ${Math.round(despues)} px)`,
    despues > antes + 200, `${antes} → ${despues}`);

  // Plegado sigue mostrando lo que uno mira de reojo.
  ck("plegado sigue mostrando el resultado", await pag.getByText(/^\+?0\.00 %$/).count() > 0);
  ck("y el efectivo libre", await pag.getByTitle(/Efectivo libre/i).count() > 0);

  const desplegar = pag.getByRole("button", { name: /Desplegar el panel/i });
  ck("hay botón de desplegar", await desplegar.count() > 0);
  await desplegar.click();
  await pag.waitForTimeout(900);
  ck("al desplegar vuelve el botón de comprar",
    await pag.getByRole("button", { name: /^Comprar$/ }).count() > 0);
  const vuelta = await anchoGrafica(pag);
  ck("y la gráfica vuelve a su ancho", Math.abs(vuelta - antes) < 5, `${antes} vs ${vuelta}`);
  await pag.screenshot({ path: "shots/panel-desplegado.png" });
  await pag.close();
}

console.log("El estado se recuerda entre sesiones");
{
  // Ojo con cómo se prueba esto: `addInitScript` reescribe localStorage
  // en CADA navegación, recarga incluida, así que recargar la página no
  // probaría la persistencia sino el init script. Se comprueba en dos
  // pasos: que al plegar quede guardado, y que al arrancar con ese
  // mismo guardado la vista abra plegada.
  const pag = await abrir();
  await pag.getByRole("button", { name: /Plegar el panel/i }).click();
  await pag.waitForTimeout(700);
  const guardado = await pag.evaluate(() => localStorage.getItem("tv-gratis-backtest"));
  const leido = JSON.parse(guardado);
  ck("al plegar, queda guardado panelLateral = false",
    leido?.state?.panelLateral === false, JSON.stringify(leido?.state?.panelLateral));
  await pag.close();

  // Y ahora, una sesión nueva que arranca con ESE estado guardado.
  const otra = await navegador.newPage({ viewport: { width: 1600, height: 950 } });
  await otra.route("**/api.binance.com/**", (ruta) => {
    const u = new URL(ruta.request().url());
    if (!u.pathname.includes("/klines")) {
      return ruta.fulfill({ status: 200, contentType: "application/json", body: "[]" });
    }
    const tf = u.searchParams.get("interval");
    const limite = Number(u.searchParams.get("limit") || 500);
    const end = u.searchParams.get("endTime");
    return ruta.fulfill({ status: 200, contentType: "application/json",
      body: JSON.stringify(velas(TF[tf], end ? Number(end) / 1000 : HOY, limite)) });
  });
  await otra.addInitScript((v) => localStorage.setItem("tv-gratis-backtest", v), guardado);
  await otra.goto(`${BASE}/backtesting`, { waitUntil: "networkidle" });
  await otra.waitForTimeout(2400);
  ck("una sesión nueva con ese guardado abre PLEGADA",
    await otra.getByRole("button", { name: /Desplegar el panel/i }).count() > 0);
  ck("y no aparece el panel de operar",
    await otra.getByRole("button", { name: /^Comprar$/ }).count() === 0);
  await otra.screenshot({ path: "shots/panel-plegado.png" });
  await otra.close();

  // Control: si lo guardado dice desplegado, tiene que abrir desplegado.
  // Sin esto, «abre plegada» podría ser el valor por defecto y no el
  // guardado, y la prueba no probaría nada.
  const tercera = await navegador.newPage({ viewport: { width: 1600, height: 950 } });
  await tercera.route("**/api.binance.com/**", (ruta) => {
    const u = new URL(ruta.request().url());
    if (!u.pathname.includes("/klines")) {
      return ruta.fulfill({ status: 200, contentType: "application/json", body: "[]" });
    }
    const tf = u.searchParams.get("interval");
    const limite = Number(u.searchParams.get("limit") || 500);
    const end = u.searchParams.get("endTime");
    return ruta.fulfill({ status: 200, contentType: "application/json",
      body: JSON.stringify(velas(TF[tf], end ? Number(end) / 1000 : HOY, limite)) });
  });
  const abierto = JSON.parse(guardado);
  abierto.state.panelLateral = true;
  await tercera.addInitScript((v) => localStorage.setItem("tv-gratis-backtest", v),
    JSON.stringify(abierto));
  await tercera.goto(`${BASE}/backtesting`, { waitUntil: "networkidle" });
  await tercera.waitForTimeout(2400);
  ck("CONTROL: con el guardado en desplegado, abre desplegada",
    await tercera.getByRole("button", { name: /^Comprar$/ }).count() > 0);
  await tercera.close();
}

await navegador.close();
console.log(`\n${fallos.length === 0 ? "TODO BIEN" : `FALLARON ${fallos.length}:\n - ${fallos.join("\n - ")}`}`);
process.exit(fallos.length === 0 ? 0 : 1);
