/**
 * La red de seguridad del backtesting.
 *
 * No alcanza con escribir una pantalla de error: hay que comprobar que
 * SE MUESTRA cuando algo revienta y que sus salidas funcionan.
 *
 * Cómo se provoca el fallo: esta prueba espera que exista la variable de
 * entorno ROMPER_BACKTEST=1 en el build, que hace que la vista lance a
 * propósito. Sin ella, la prueba comprueba lo contrario —que la vista
 * carga bien— y lo dice.
 *
 * OJO con `addInitScript`: se ejecuta en CADA navegación, recarga
 * incluida, así que si siembra sin condición pisa lo que la app acaba de
 * guardar y la prueba termina comprobando el script en vez de la app.
 * Acá SIEMBRA SOLO SI NO HAY NADA, que es el patrón correcto para
 * cualquier prueba que recargue.
 */
import pw from "/opt/npm-tools/node_modules/playwright/index.js";
const { chromium } = pw;

const BASE = "http://127.0.0.1:3137";
const fallos = [];
const ck = (n, c, d = "") => {
  console.log(`  ${c ? "ok " : "MAL"} ${n}${!c && d ? ` -- ${d}` : ""}`);
  if (!c) fallos.push(n);
};

const I = Math.floor(Date.UTC(2024, 0, 1) / 1000);
const D = Math.floor(Date.UTC(2026, 0, 1) / 1000);
const bt = (id, nombre) => ({
  id, nombre, simbolo: "BIN:BTCUSDT", temporalidad: "1d", desde: D,
  capitalInicial: 5000, operaciones: [], tiempoActual: D, historiaPrevia: 365,
  medias: [], indicadores: [], zonaHoraria: "UTC", creado: I,
});

const nav = await chromium.launch();
const pag = await nav.newPage({ viewport: { width: 1400, height: 900 } });
await pag.route("**/api.binance.com/**", (r) =>
  r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
await pag.addInitScript((v) => {
  if (!localStorage.getItem("tv-gratis-backtest")) {
    localStorage.setItem("tv-gratis-backtest", v);
  }
}, JSON.stringify({
    state: {
      backtests: [bt("roto", "El que revienta"), bt("sano", "El sano")],
      activoId: "roto",
      borrador: { simbolo: "BIN:BTCUSDT", desde: "", temporalidad: "1d", capital: 5000, historia: 365 },
      panelLateral: true,
    },
    version: 0,
  }));
await pag.goto(`${BASE}/backtesting`, { waitUntil: "domcontentloaded" });
await pag.waitForTimeout(2500);

const hayError = await pag.getByText(/Se rompió algo en el backtesting/i).count();

if (!hayError) {
  console.log("La vista carga bien (build sin ROMPER_BACKTEST).");
  ck("la vista del backtest se dibuja", await pag.getByText(/Backtesting/i).first().count() > 0);
  console.log("\n  nota: para ejercitar la red, compilar con el fallo");
  console.log("        inyectado; está documentado en el commit.");
} else {
  console.log("La vista reventó: se comprueba la red");
  ck("sale la pantalla de error y no una página muerta", true);
  const detalle = await pag.locator("pre").first().textContent().catch(() => null);
  ck("muestra el mensaje del error", (detalle ?? "").length > 5, String(detalle).slice(0, 100));
  ck("ofrece reintentar", await pag.getByRole("button", { name: /Reintentar/i }).count() > 0);
  ck("ofrece copiar el error", await pag.getByRole("button", { name: /Copiar el error/i }).count() > 0);

  await pag.getByRole("button", { name: /Descartar este backtest/i }).click();
  // El botón recarga; se espera a que la página vuelva a estar lista.
  await pag.waitForLoadState("domcontentloaded");
  await pag.waitForTimeout(2000);
  const quedan = await pag.evaluate(() =>
    JSON.parse(localStorage.getItem("tv-gratis-backtest")).state.backtests.map((b) => b.id));
  ck("descarta SOLO el backtest abierto", !quedan.includes("roto"), JSON.stringify(quedan));
  ck("Y CONSERVA LOS DEMÁS", quedan.includes("sano"), JSON.stringify(quedan));
}

await pag.screenshot({ path: "shots/red-errores.png" });
await nav.close();
console.log(`\n${fallos.length === 0 ? "TODO BIEN" : `FALLARON ${fallos.length}:\n - ${fallos.join("\n - ")}`}`);
process.exit(fallos.length === 0 ? 0 : 1);
