/**
 * El error que vio Diego:
 *
 *   Failed to execute 'insertBefore' on 'Node': The node before which
 *   the new node is to be inserted is not a child of this node.
 *
 * Aparece cuando algo escribe en el DOM que React administra. La capa de
 * niveles lo hacía: actualizaba el texto de los rótulos con
 * `textContent` durante el arrastre, para no re-renderizar. React lleva
 * su propio modelo de los hijos de cada nodo, así que al volver a
 * renderizar busca nodos que ya no existen y la aplicación entera se cae.
 *
 * La receta para provocarlo, que es lo que hacía Diego sin saberlo:
 * ARRASTRAR UNA LÍNEA y después forzar un render de esa zona (avanzar el
 * reproductor). Repetido unas cuantas veces.
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
    const p = 60000 + 20000 * Math.sin(x / 50) + 400 * Math.sin(x * 2.3);
    out.push([t * 1000, String(p), String(p * 1.006), String(p * 0.994), String(p * 1.002),
      "1000", (t + tfSeg) * 1000 - 1, "0", 0, "0", "0", "0"]);
  }
  return out;
}

const DESDE = Math.floor(Date.UTC(2026, 0, 1) / 1000);
const nav = await chromium.launch();
const pag = await nav.newPage({ viewport: { width: 1600, height: 950 } });

const errores = [];
pag.on("pageerror", (e) => errores.push(e.message));
pag.on("console", (m) => { if (m.type() === "error") errores.push("consola: " + m.text()); });

await pag.route("**/api.binance.com/**", (r) => {
  const u = new URL(r.request().url());
  if (!u.pathname.includes("/klines")) {
    return r.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  }
  const tf = u.searchParams.get("interval");
  const lim = Number(u.searchParams.get("limit") || 500);
  const end = u.searchParams.get("endTime");
  return r.fulfill({ status: 200, contentType: "application/json",
    body: JSON.stringify(velas(TF[tf], end ? Number(end) / 1000 : HOY, lim)) });
});
await pag.addInitScript((v) => {
  if (!localStorage.getItem("tv-gratis-backtest")) {
    localStorage.setItem("tv-gratis-backtest", v);
  }
}, JSON.stringify({
  state: {
    backtests: [{
      id: "p1", nombre: "Prueba", simbolo: "BIN:BTCUSDT", temporalidad: "1d",
      desde: DESDE, capitalInicial: 50000, operaciones: [], tiempoActual: DESDE,
      historiaPrevia: 365, medias: [], indicadores: [], zonaHoraria: "UTC", creado: INICIO,
    }],
    activoId: "p1",
    borrador: { simbolo: "BIN:BTCUSDT", desde: "", temporalidad: "1d", capital: 50000, historia: 365 },
    panelLateral: true,
  },
  version: 0,
}));

await pag.goto(`${BASE}/backtesting`, { waitUntil: "networkidle" });
await pag.waitForTimeout(2500);

await pag.getByLabel(/Stop y objetivo/i).first().check();
await pag.waitForTimeout(700);

const arrastrar = async (clave, dy) => {
  // La línea puede no estar: si el precio se fue de la vista, el nodo se
  // desmonta (es lo correcto), y si la operación tocó su stop, se cerró.
  // No es un fallo de la prueba: simplemente no hay nada que arrastrar.
  const et = pag.locator(`[data-clave="${clave}"] >> div`).last();
  let c = null;
  try { c = await et.boundingBox({ timeout: 1500 }); } catch { return false; }
  if (!c) return false;
  await pag.mouse.move(c.x + c.width / 2, c.y + c.height / 2);
  await pag.mouse.down();
  // En varios pasos: cada uno es un movimiento que actualiza el rótulo,
  // que es justo donde estaba el fallo.
  for (let k = 1; k <= 8; k++) {
    await pag.mouse.move(c.x + c.width / 2, c.y + c.height / 2 + (dy * k) / 8);
    await pag.waitForTimeout(40);
  }
  await pag.mouse.up();
  await pag.waitForTimeout(250);
  return true;
};

console.log("Arrastrar y re-renderizar, muchas veces");
{
  let vueltas = 0;
  for (let i = 0; i < 10; i++) {
    const ok = await arrastrar("plan:stop", i % 2 === 0 ? 40 : -40);
    if (!ok) break;
    await arrastrar("plan:objetivo", i % 2 === 0 ? -30 : 30);
    // Forzar renders de la zona: avanzar el reproductor.
    //
    // Con try/catch a propósito: si la app se muere, el botón desaparece
    // y un `click` sin red tumba la PRUEBA con un timeout en vez de
    // informar el fallo. Lo que se quiere es medir, no reventar.
    for (let k = 0; k < 3; k++) {
      try {
        await pag.getByRole("button", { name: /Una vela adelante/i })
          .click({ timeout: 2500 });
      } catch {
        errores.push("la app dejó de responder: desapareció el reproductor");
        break;
      }
      await pag.waitForTimeout(120);
    }
    vueltas++;
    if (errores.some((e) => /insertBefore|dejó de responder/i.test(e))) break;
  }
  console.log(`  (${vueltas} vueltas de arrastrar + avanzar)`);

  const insert = errores.filter((e) => /insertBefore/i.test(e));
  ck("NINGÚN error de insertBefore", insert.length === 0, insert[0]?.slice(0, 180));
  ck("la app nunca dejó de responder",
    !errores.some((e) => /dejó de responder/i.test(e)));
  ck("no apareció la pantalla de error",
    await pag.getByText(/Se rompió algo en el backtesting/i).count() === 0);
  ck("las líneas siguen en pantalla",
    await pag.locator("[data-clave]").count() >= 3,
    String(await pag.locator("[data-clave]").count()));
  ck("el panel sigue vivo",
    await pag.getByRole("button", { name: /^Comprar$/ }).count() > 0);
}

console.log("Y con una operación abierta, que también tiene líneas");
{
  // Tras tanto arrastrar, el plan puede haber quedado inválido (stop al
  // otro lado de la entrada) y el botón apagado: es el comportamiento
  // correcto. Se recalcula antes de operar.
  const rec = pag.getByRole("button", { name: /^Recalcular$/ });
  if (await rec.count()) {
    try { await rec.click({ timeout: 2500 }); } catch {}
    await pag.waitForTimeout(500);
  }
  let abrio = false;
  try {
    await pag.getByRole("button", { name: /^Comprar$/ }).click({ timeout: 3000 });
    abrio = true;
  } catch {
    errores.push("la app dejó de responder: no se pudo operar");
  }
  await pag.waitForTimeout(700);
  ck("se pudo abrir una operación", abrio);
  const claves = await pag.locator("[data-clave]").evaluateAll((e) => e.map((x) => x.dataset.clave));
  const deOp = claves.find((c) => c.endsWith(":stop") && !c.startsWith("plan"));
  ck("la operación abierta dibuja su stop", !!deOp, claves.join(","));
  if (deOp) {
    let movidos = 0;
    for (let i = 0; i < 6; i++) {
      if (await arrastrar(deOp, i % 2 === 0 ? 35 : -35)) movidos++;
      try {
        await pag.getByRole("button", { name: /Diez velas adelante/i }).click({ timeout: 2000 });
      } catch {}
      await pag.waitForTimeout(200);
    }
    console.log(`  (${movidos} arrastres sobre la operación abierta)`);
  }
  const insert = errores.filter((e) => /insertBefore/i.test(e));
  ck("sigue sin errores de insertBefore", insert.length === 0, insert[0]?.slice(0, 180));
  ck("y la app sigue en pie",
    await pag.getByText(/Se rompió algo en el backtesting/i).count() === 0);
}

const otros = [...new Set(errores)].filter((e) => !/favicon|ERR_|net::/i.test(e));
if (otros.length) {
  console.log(`\n  otros mensajes (${otros.length}):`);
  for (const e of otros.slice(0, 4)) console.log("    - " + e.slice(0, 160));
}

await pag.screenshot({ path: "shots/arrastre-dom.png" });
await nav.close();
console.log(`\n${fallos.length === 0 ? "TODO BIEN" : `FALLARON ${fallos.length}:\n - ${fallos.join("\n - ")}`}`);
process.exit(fallos.length === 0 ? 0 : 1);
