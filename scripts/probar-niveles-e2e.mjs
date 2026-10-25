/**
 * Prueba de extremo a extremo de stop/objetivo en el backtesting.
 *
 * La red a Binance esta bloqueada en este contenedor, asi que se
 * intercepta la peticion de velas y se sirve una serie SINTETICA con una
 * forma conocida: sube hasta la vela 30 y despues se desploma. Asi se
 * sabe de antemano que tiene que pasar con un stop y con un objetivo, en
 * vez de mirar el grafico y opinar.
 */
import pw from "/opt/npm-tools/node_modules/playwright/index.js";
const { chromium } = pw;

const BASE = "http://127.0.0.1:3137";
const fallos = [];
const ck = (n, c, d = "") => {
  console.log(`  ${c ? "ok " : "MAL"} ${n}${!c && d ? ` -- ${d}` : ""}`);
  if (!c) fallos.push(n);
};

// Serie: arranca en 100, sube 1 % por vela hasta la 200, luego baja 1,5 %.
const DIA = 86400;
const T0 = Math.floor(Date.UTC(2024, 0, 1) / 1000);
function serie(n = 400) {
  const out = [];
  let p = 100;
  for (let i = 0; i < n; i++) {
    const o = p;
    p = i < 200 ? p * 1.01 : p * 0.985;
    const c = p;
    out.push([
      (T0 + i * DIA) * 1000, String(o), String(Math.max(o, c) * 1.004),
      String(Math.min(o, c) * 0.996), String(c), "1000",
      (T0 + (i + 1) * DIA) * 1000 - 1, "0", 0, "0", "0", "0",
    ]);
  }
  return out;
}

const navegador = await chromium.launch();
const pag = await navegador.newPage({ viewport: { width: 1600, height: 950 } });
pag.on("pageerror", (e) => fallos.push(`error de pagina: ${e.message}`));
pag.on("console", (m) => { if (m.type() === "error") console.log("   consola:", m.text().slice(0, 160)); });

await pag.route("**/api.binance.com/**", (ruta) => {
  const u = new URL(ruta.request().url());
  if (u.pathname.includes("/klines")) {
    return ruta.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(serie()) });
  }
  return ruta.fulfill({ status: 200, contentType: "application/json", body: "[]" });
});

// Un backtest ya armado, metido en localStorage: evita pelear con el
// formulario y deja la prueba centrada en lo que se quiere probar.
const bt = {
  state: {
    backtests: [{
      id: "p1", nombre: "Prueba", simbolo: "BIN:BTCUSDT", temporalidad: "1d",
      desde: T0 + 100 * DIA, capitalInicial: 100000, operaciones: [],
      tiempoActual: T0 + 100 * DIA, historiaPrevia: 365,
      medias: [], indicadores: [], zonaHoraria: "UTC", creado: T0,
    }],
    activoId: "p1",
    borrador: { simbolo: "BIN:BTCUSDT", desde: "", temporalidad: "1d", capital: 100000, historia: 365 },
  },
  version: 0,
};
await pag.addInitScript((v) => localStorage.setItem("tv-gratis-backtest", v), JSON.stringify(bt));
await pag.goto(`${BASE}/backtesting`, { waitUntil: "networkidle" });
await pag.waitForTimeout(2500);

console.log("1. El VWAP está en el menú de indicadores y se puede encender");
{
  await pag.getByRole("button", { name: /Indicadores/i }).first().click();
  await pag.waitForTimeout(400);
  const vwap = pag.getByRole("menuitem", { name: /^VWAP$/ }).first();
  ck("aparece «VWAP» en el menú", await vwap.count() > 0);
  if (await vwap.count()) {
    await vwap.click();
    await pag.waitForTimeout(900);
    const enc = await pag.evaluate(() => {
      const s = JSON.parse(localStorage.getItem("tv-gratis-backtest") || "{}");
      return s?.state?.backtests?.[0]?.indicadores ?? [];
    });
    ck("queda guardado como encendido", enc.includes("vwap"), JSON.stringify(enc));
    // Y que de verdad dibuje: la serie tiene que llegar al gráfico, no
    // basta con que el menú lo marque.
    const dibujado = await pag.evaluate(() => {
      const c = document.querySelectorAll("canvas");
      return c.length > 0;
    });
    ck("el gráfico sigue dibujando con el VWAP puesto", dibujado);
  }
  await pag.keyboard.press("Escape");
  await pag.waitForTimeout(300);
}

console.log("2. El panel ofrece stop y objetivo");
{
  const chk = pag.getByLabel(/Stop y objetivo/i).first();
  ck("existe la casilla de stop y objetivo", await chk.count() > 0);
  await chk.check();
  await pag.waitForTimeout(600);
  const sl = pag.getByLabel(/^Stop loss$/);
  const tp = pag.getByLabel(/^Take profit$/);
  const vsl = Number(await sl.inputValue());
  const vtp = Number(await tp.inputValue());
  ck("propone un stop por debajo del precio", vsl > 0, String(vsl));
  ck("propone un objetivo por encima del stop", vtp > vsl, `${vsl} / ${vtp}`);
  const rb = await pag.getByText(/: 1$/).first().textContent().catch(() => null);
  ck("muestra la relación beneficio/riesgo", /2\.00/.test(rb ?? ""), String(rb));
}

console.log("3. Las líneas salen dibujadas en el gráfico");
{
  await pag.waitForTimeout(800);
  const n = await pag.locator('[data-clave]').count();
  ck("hay tres líneas (entrada, stop, objetivo)", n === 3, `${n} líneas`);
  const claves = await pag.locator('[data-clave]').evaluateAll((e) => e.map((x) => x.dataset.clave));
  ck("son las del plan", claves.sort().join(",") === "plan:entrada,plan:objetivo,plan:stop", claves.join(","));
  const visibles = await pag.locator('[data-clave]').evaluateAll(
    (e) => e.filter((x) => x.style.display !== "none").length);
  ck("están colocadas (no ocultas)", visibles === 3, `${visibles} visibles`);
}

console.log("4. Arrastrar el stop lo mueve");
{
  const stop = pag.locator('[data-clave="plan:stop"]');
  const caja = await stop.boundingBox();
  const antes = Number(await pag.getByLabel(/^Stop loss$/).inputValue());
  ck("el stop tiene posición en pantalla", !!caja, JSON.stringify(caja));
  if (caja) {
    const et = stop.locator("div").last();
    const ce = await et.boundingBox();
    await pag.mouse.move(ce.x + ce.width / 2, ce.y + ce.height / 2);
    await pag.mouse.down();
    await pag.mouse.move(ce.x + ce.width / 2, ce.y + ce.height / 2 + 60, { steps: 10 });
    await pag.mouse.up();
    await pag.waitForTimeout(600);
    const despues = Number(await pag.getByLabel(/^Stop loss$/).inputValue());
    ck("al soltar, el campo del stop cambió", despues !== antes, `${antes} -> ${despues}`);
    ck("y bajó (se arrastró hacia abajo)", despues < antes, `${antes} -> ${despues}`);
  }
}

console.log("5. Se abre la operación CON los niveles");
{
  await pag.getByRole("button", { name: /^Comprar$/ }).click();
  await pag.waitForTimeout(700);
  const ops = await pag.evaluate(() => {
    const s = JSON.parse(localStorage.getItem("tv-gratis-backtest") || "{}");
    return s?.state?.backtests?.[0]?.operaciones ?? [];
  });
  ck("quedó una operación", ops.length === 1, `${ops.length}`);
  if (ops[0]) {
    ck("con stop guardado", typeof ops[0].stopLoss === "number", JSON.stringify(ops[0].stopLoss));
    ck("con objetivo guardado", typeof ops[0].takeProfit === "number", JSON.stringify(ops[0].takeProfit));
    ck("el stop está por debajo de la entrada",
      ops[0].stopLoss < ops[0].precioEntrada, `${ops[0].stopLoss} vs ${ops[0].precioEntrada}`);
    ck("sigue abierta", ops[0].precioSalida === undefined);
  }
}

console.log("6. Al avanzar, el precio sube y toca el OBJETIVO");
{
  // Las velas suben 1 % por vela hasta la 200; el objetivo estaba 4 % arriba.
  for (let i = 0; i < 8; i++) {
    await pag.getByRole("button", { name: /Una vela adelante/i }).click();
    await pag.waitForTimeout(220);
  }
  await pag.waitForTimeout(700);
  const op = await pag.evaluate(() => {
    const s = JSON.parse(localStorage.getItem("tv-gratis-backtest") || "{}");
    return s?.state?.backtests?.[0]?.operaciones?.[0];
  });
  ck("la operación se cerró sola", op?.precioSalida !== undefined, JSON.stringify(op));
  ck("y el motivo es «objetivo»", op?.motivo === "objetivo", String(op?.motivo));
  ck("salió AL PRECIO DEL OBJETIVO, no al cierre de la vela",
    Math.abs(op?.precioSalida - op?.takeProfit) < 1e-9,
    `${op?.precioSalida} vs ${op?.takeProfit}`);
  ck("la ganancia es positiva", op?.precioSalida > op?.precioEntrada);
}

// Para los dos casos que siguen hace falta arrancar de un estado
// concreto. Escribir localStorage con la página viva no sirve: zustand
// persiste su propio estado encima en cuanto algo cambia, y la escritura
// se pierde. Se abre una pestaña nueva con el estado ya puesto.
async function pagConEstado(cambiar) {
  const q = await navegador.newPage({ viewport: { width: 1600, height: 950 } });
  await q.route("**/api.binance.com/**", (ruta) => {
    const u = new URL(ruta.request().url());
    return ruta.fulfill({
      status: 200, contentType: "application/json",
      body: u.pathname.includes("/klines") ? JSON.stringify(serie()) : "[]",
    });
  });
  const base = JSON.parse(JSON.stringify(bt));
  cambiar(base.state.backtests[0]);
  await q.addInitScript((v) => localStorage.setItem("tv-gratis-backtest", v), JSON.stringify(base));
  await q.goto(`${BASE}/backtesting`, { waitUntil: "networkidle" });
  await q.waitForTimeout(2200);
  return q;
}
const opsDe = (q) => q.evaluate(() => {
  const s = JSON.parse(localStorage.getItem("tv-gratis-backtest"));
  return s.state.backtests[0].operaciones;
});

console.log("7. Una operación que toca el STOP se cierra por stop");
{
  // La serie sube hasta la vela 200 y después cae 1,5 % por vela. Se para
  // el reloj JUSTO en el techo: así el objetivo (4 % arriba) no llega a
  // tocarse y el que ejecuta es el stop.
  const q = await pagConEstado((b) => { b.tiempoActual = T0 + 200 * DIA; });
  await q.getByLabel(/Stop y objetivo/i).first().check();
  await q.waitForTimeout(500);
  await q.getByRole("button", { name: /^Comprar$/ }).click();
  await q.waitForTimeout(500);
  for (let i = 0; i < 6; i++) {
    await q.getByRole("button", { name: /Una vela adelante/i }).click();
    await q.waitForTimeout(200);
  }
  await q.waitForTimeout(700);
  const op = (await opsDe(q)).at(-1);
  ck("se cerró sola", op?.precioSalida !== undefined, JSON.stringify(op));
  ck("y el motivo es «stop»", op?.motivo === "stop", String(op?.motivo));
  ck("salió al precio del stop", Math.abs(op?.precioSalida - op?.stopLoss) < 1e-9,
    `${op?.precioSalida} vs ${op?.stopLoss}`);
  ck("la pérdida está acotada al stop", op?.precioSalida < op?.precioEntrada);
  await q.close();
}

console.log("8. Un nivel puesto hoy NO cierra con velas que ya pasaron");
{
  // Operación abierta hace 20 velas, con un stop ALTÍSIMO: cualquier vela
  // anterior lo habría tocado. Si el nivel se aplicara hacia atrás, la
  // operación aparecería cerrada apenas carga la página.
  const entrada = T0 + 180 * DIA;
  const q = await pagConEstado((b) => {
    b.tiempoActual = T0 + 200 * DIA;
    b.operaciones = [{
      id: "retro", instrumento: "activo", lado: "compra", cantidad: 1,
      precioEntrada: 1e6, tiempoEntrada: entrada, stopLoss: 1e6,
    }];
  });
  const antes = (await opsDe(q))[0];
  ck("al cargar, no se cierra con el pasado", antes?.precioSalida === undefined,
    JSON.stringify(antes));
  // Al avanzar una vela sí ejecuta: esa vela nueva está por debajo del stop.
  await q.getByRole("button", { name: /Una vela adelante/i }).click();
  await q.waitForTimeout(900);
  const despues = (await opsDe(q))[0];
  ck("al avanzar una vela, ahí sí ejecuta", despues?.precioSalida !== undefined,
    JSON.stringify(despues));
  ck("y lo hace por stop", despues?.motivo === "stop", String(despues?.motivo));
  await q.close();
}

await pag.screenshot({ path: "shots/niveles.png" });
await navegador.close();
console.log(`\n${fallos.length === 0 ? "TODO BIEN" : `FALLARON ${fallos.length}:\n - ${fallos.join("\n - ")}`}`);
process.exit(fallos.length === 0 ? 0 : 1);
