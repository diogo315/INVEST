/**
 * Que se pueda LLEGAR a la tabla de operaciones.
 *
 * Con futuros desplegado, la barra de mercado y el panel de operar
 * ocupan casi todo el alto del panel lateral. Sin scroll, la tabla
 * quedaba fuera de la vista y no había forma de alcanzarla — y cerrar
 * una posición desde esa tabla es lo ÚNICO que libera capital. O sea
 * que no era un problema de estética: dejaba el backtest sin salida.
 */
import pw from "/opt/npm-tools/node_modules/playwright/index.js";
const { chromium } = pw;

const BASE = "http://127.0.0.1:3137";
const fallos = [];
const ck = (n, c, d = "") => {
  console.log(`  ${c ? "ok " : "MAL"} ${n}${!c && d ? ` -- ${d}` : ""}`);
  if (!c) fallos.push(n);
};

const DIA = 86400, T0 = Math.floor(Date.UTC(2024, 0, 1) / 1000), DESDE = T0 + 100 * DIA;
function velas(n = 400) {
  const o = []; let p = 50000;
  for (let i = 0; i < n; i++) {
    const a = p; p = p * (1 + ((i % 7) - 3) * 0.002);
    o.push([(T0 + i * DIA) * 1000, String(a), String(Math.max(a, p) * 1.004),
      String(Math.min(a, p) * 0.996), String(p), "1000",
      (T0 + (i + 1) * DIA) * 1000 - 1, "0", 0, "0", "0", "0"]);
  }
  return o;
}

const nav = await chromium.launch();
// Pantalla de portátil, que es donde el problema se ve: con una pantalla
// enorme todo entra y la prueba no probaría nada.
const pag = await nav.newPage({ viewport: { width: 1366, height: 700 } });
pag.on("pageerror", (e) => fallos.push(`error de página: ${e.message}`));
await pag.route("**/api.binance.com/**", (r) => {
  const u = new URL(r.request().url());
  return r.fulfill({ status: 200, contentType: "application/json",
    body: u.pathname.includes("/klines") ? JSON.stringify(velas()) : "[]" });
});
// Seis posiciones abiertas, futuros a 25x: el caso de Diego.
const ops = Array.from({ length: 6 }, (_, i) => ({
  id: `o${i}`, instrumento: "activo", lado: "compra", cantidad: 0.02,
  precioEntrada: 50000, tiempoEntrada: DESDE - (i + 1) * DIA, apalancamiento: 25,
}));
await pag.addInitScript((v) => {
  if (!localStorage.getItem("tv-gratis-backtest")) {
    localStorage.setItem("tv-gratis-backtest", v);
  }
}, JSON.stringify({
  state: {
    backtests: [{
      id: "p1", nombre: "P", simbolo: "BIN:BTCUSDT", temporalidad: "1d", desde: DESDE,
      capitalInicial: 5000, operaciones: ops, tiempoActual: DESDE, historiaPrevia: 365,
      medias: [], indicadores: [], zonaHoraria: "UTC", creado: T0, mercado: "futuros",
      futuros: { apalancamiento: 25, comision: 0.04, financiamiento: 0.01, mantenimiento: 0.005 },
    }],
    activoId: "p1",
    borrador: { simbolo: "BIN:BTCUSDT", desde: "", temporalidad: "1d", capital: 5000, historia: 365 },
    panelLateral: true, conComisiones: true,
  },
  version: 0,
}));
await pag.goto(`${BASE}/backtesting`, { waitUntil: "networkidle" });
await pag.waitForTimeout(2500);

console.log("Con futuros desplegado y seis posiciones abiertas");
{
  ck("la barra de futuros está desplegada",
    await pag.getByText(/te liquidan con un/).count() > 0);
  ck("hay botones de cerrar en la tabla",
    await pag.getByRole("button", { name: /Cerrar/i }).count() > 0,
    String(await pag.getByRole("button", { name: /Cerrar/i }).count()));

  const cerrar = pag.getByRole("button", { name: /Cerrar/i }).first();
  // Lo que importa: que se pueda LLEGAR. Playwright desplaza solo, así
  // que primero se comprueba si hace falta desplazar y que se pueda.
  const panel = pag.locator("aside").first();
  const medidas = await panel.evaluate((el) => ({
    alto: el.clientHeight, contenido: el.scrollHeight,
    puedeDesplazar: el.scrollHeight > el.clientHeight + 2,
  }));
  console.log(`  (panel ${medidas.alto}px, contenido ${medidas.contenido}px)`);
  ck("el contenido NO entra en el panel (si no, la prueba no prueba nada)",
    medidas.puedeDesplazar, JSON.stringify(medidas));
  ck("y el panel SE PUEDE DESPLAZAR", medidas.puedeDesplazar);

  await panel.evaluate((el) => { el.scrollTop = el.scrollHeight; });
  await pag.waitForTimeout(400);
  const visible = await cerrar.isVisible();
  const caja = await cerrar.boundingBox();
  const vp = pag.viewportSize();
  ck("tras desplazar, el botón de cerrar está en pantalla",
    visible && caja !== null && caja.y >= 0 && caja.y + caja.height <= vp.height,
    JSON.stringify(caja));

  // Y que de verdad sirva: cerrar libera capital.
  const libre = async () => Number(((await pag.getByText(/^libre \$/).first()
    .textContent().catch(() => "")) || "").replace(/[^\d.\-−]/g, "").replace("−", "-"));
  const antes = await libre();
  await cerrar.click();
  await pag.waitForTimeout(800);
  const despues = await libre();
  ck(`cerrar una posición libera capital (${antes} → ${despues})`, despues > antes,
    `${antes} → ${despues}`);
}

console.log("La cabecera «Operar» queda fija al desplazar");
{
  const panel = pag.locator("aside").first();
  await panel.evaluate((el) => { el.scrollTop = el.scrollHeight; });
  await pag.waitForTimeout(300);
  const plegar = pag.getByRole("button", { name: /Plegar el panel/i });
  const c = await plegar.boundingBox();
  ck("el botón de plegar sigue visible abajo del todo",
    c !== null && c.y >= 0 && c.y < pag.viewportSize().height, JSON.stringify(c));
}

await pag.screenshot({ path: "shots/panel-scroll.png" });
await nav.close();
console.log(`\n${fallos.length === 0 ? "TODO BIEN" : `FALLARON ${fallos.length}:\n - ${fallos.join("\n - ")}`}`);
process.exit(fallos.length === 0 ? 0 : 1);
