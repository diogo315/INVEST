/**
 * La caja de herramientas del backtesting.
 *
 * Lo que se comprueba no es que los botones existan, sino que dibujar
 * funcione de punta a punta: que el dibujo se guarde con las
 * coordenadas del mercado, que vaya a la clave DEL BACKTEST y no al
 * símbolo, y que la herramienta de posición nazca con sus tres niveles
 * y una relación de 1:1.
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
    const a = p; p = p * (1 + ((i % 9) - 4) * 0.003);
    o.push([(T0 + i * DIA) * 1000, String(a), String(Math.max(a, p) * 1.005),
      String(Math.min(a, p) * 0.995), String(p), "1000",
      (T0 + (i + 1) * DIA) * 1000 - 1, "0", 0, "0", "0", "0"]);
  }
  return o;
}

const nav = await chromium.launch();
const pag = await nav.newPage({ viewport: { width: 1700, height: 1000 } });
pag.on("pageerror", (e) => fallos.push(`error de página: ${e.message}`));
await pag.route("**/api.binance.com/**", (r) => {
  const u = new URL(r.request().url());
  return r.fulfill({ status: 200, contentType: "application/json",
    body: u.pathname.includes("/klines") ? JSON.stringify(velas()) : "[]" });
});
await pag.addInitScript((v) => {
  if (!localStorage.getItem("tv-gratis-backtest")) {
    localStorage.setItem("tv-gratis-backtest", v);
  }
}, JSON.stringify({
  state: {
    backtests: [{
      id: "p1", nombre: "P", simbolo: "BIN:BTCUSDT", temporalidad: "1d", desde: DESDE,
      capitalInicial: 10000, operaciones: [], tiempoActual: DESDE + 60 * DIA,
      historiaPrevia: 365, medias: [], indicadores: [], zonaHoraria: "UTC", creado: T0,
    }],
    activoId: "p1",
    borrador: { simbolo: "BIN:BTCUSDT", desde: "", temporalidad: "1d", capital: 10000, historia: 365 },
    panelLateral: true, conComisiones: true,
  },
  version: 0,
}));
await pag.goto(`${BASE}/backtesting`, { waitUntil: "networkidle" });
await pag.waitForTimeout(2800);

const dibujos = (clave = "bt:p1:a") => pag.evaluate((k) => {
  const g = JSON.parse(localStorage.getItem("tv-gratis-chart-state") || "{}");
  return g?.state?.dibujos?.[k] ?? [];
}, clave);
const todas = () => pag.evaluate(() => {
  const g = JSON.parse(localStorage.getItem("tv-gratis-chart-state") || "{}");
  return Object.keys(g?.state?.dibujos ?? {});
});
const lienzo = async () => {
  const c = await pag.locator("canvas").first().boundingBox();
  return c;
};

console.log("1. La caja de herramientas está");
{
  for (const n of ["Cursor", "Rectángulo", "Línea horizontal", "Línea vertical",
                   "Línea de tendencia", "Posición larga", "Posición corta"]) {
    ck(`está «${n}»`, await pag.getByRole("button", { name: new RegExp(`^${n}$`) }).count() > 0);
  }
}

console.log("2. Dibujar un rectángulo");
{
  await pag.getByRole("button", { name: /^Rectángulo$/ }).click();
  await pag.waitForTimeout(300);
  const c = await lienzo();
  await pag.mouse.click(c.x + 200, c.y + 150);
  await pag.waitForTimeout(250);
  await pag.mouse.click(c.x + 400, c.y + 300);
  await pag.waitForTimeout(600);
  const d = await dibujos();
  ck("quedó guardado un dibujo", d.length === 1, String(d.length));
  ck("y es un rectángulo", d[0]?.tipo === "rectangulo", String(d[0]?.tipo));
  ck("con dos puntos en coordenadas del mercado",
    d[0]?.puntos?.length === 2 && d[0].puntos[0].time > 1e9 && d[0].puntos[0].price > 1000,
    JSON.stringify(d[0]?.puntos));
  ck("la herramienta vuelve sola al cursor",
    await pag.getByRole("button", { name: /^Cursor$/ }).getAttribute("aria-pressed") === "true");
}

console.log("3. LOS DIBUJOS SON DEL BACKTEST, no del símbolo");
{
  const claves = await todas();
  ck("se guardan bajo la clave del backtest", claves.includes("bt:p1:a"), claves.join(","));
  ck("y NO bajo el símbolo (no ensucian el gráfico en vivo)",
    !claves.includes("BTCUSDT"), claves.join(","));
}

console.log("4. LA HERRAMIENTA DE POSICIÓN");
{
  await pag.getByRole("button", { name: /^Posición larga$/ }).click();
  await pag.waitForTimeout(300);
  const c = await lienzo();
  // Entrada abajo, objetivo arriba (en pantalla, arriba = menos Y).
  await pag.mouse.click(c.x + 500, c.y + 400);
  await pag.waitForTimeout(250);
  await pag.mouse.click(c.x + 700, c.y + 250);
  await pag.waitForTimeout(700);
  const d = (await dibujos()).find((x) => x.tipo === "posicionLarga");
  ck("se creó la posición larga", !!d, JSON.stringify((await dibujos()).map((x) => x.tipo)));
  ck("NACE CON TRES PUNTOS (entrada, objetivo y stop)", d?.puntos?.length === 3,
    String(d?.puntos?.length));
  if (d?.puntos?.length === 3) {
    const [e, o, s] = d.puntos.map((p) => p.price);
    ck("el objetivo está por encima de la entrada", o > e, `${e} / ${o}`);
    ck("y el stop por debajo", s < e, `${e} / ${s}`);
    ck("a la misma distancia: relación 1:1",
      Math.abs((o - e) - (e - s)) < 1e-6, `premio ${(o - e).toFixed(2)}, riesgo ${(e - s).toFixed(2)}`);
  }
  // Se dibuja de verdad: tiene que haber un rótulo con la relación.
  const txt = await pag.locator("svg text").allTextContents();
  ck("se dibuja el rótulo con la relación beneficio/riesgo",
    txt.some((t) => /B\/R 1\.00 : 1/.test(t)), txt.filter((t) => /B\/R/.test(t)).join(" | "));
  ck("y los rótulos de objetivo y stop",
    txt.some((t) => /^Objetivo /.test(t)) && txt.some((t) => /^Stop /.test(t)),
    txt.slice(0, 6).join(" | "));
}

console.log("5. La posición corta nace al revés");
{
  await pag.getByRole("button", { name: /^Posición corta$/ }).click();
  await pag.waitForTimeout(300);
  const c = await lienzo();
  await pag.mouse.click(c.x + 250, c.y + 250);
  await pag.waitForTimeout(250);
  await pag.mouse.click(c.x + 420, c.y + 400);   // objetivo ABAJO
  await pag.waitForTimeout(700);
  const d = (await dibujos()).find((x) => x.tipo === "posicionCorta");
  ck("se creó la posición corta", !!d);
  if (d?.puntos?.length === 3) {
    const [e, o, s] = d.puntos.map((p) => p.price);
    ck("el objetivo va por DEBAJO de la entrada", o < e, `${e} / ${o}`);
    ck("y el stop por ENCIMA", s > e, `${e} / ${s}`);
  }
}

await pag.screenshot({ path: "shots/dibujos-bt.png" });

console.log("6. Borrar todo");
{
  const antes = (await dibujos()).length;
  ck("hay varios dibujos", antes >= 3, String(antes));
  pag.once("dialog", (d) => d.accept());
  await pag.getByRole("button", { name: /Borrar todos los dibujos/i }).click();
  await pag.waitForTimeout(600);
  ck("quedan cero", (await dibujos()).length === 0, String((await dibujos()).length));
}

console.log("7. CON DOS GRÁFICAS, CADA UNA TIENE SU CAJA Y SU PROPIA CLAVE");
{
  // Esto es lo que se escapó la primera vez: la prueba abría UNA gráfica,
  // así que nunca miró si la segunda recibía su clave de dibujos. Con una
  // sola gráfica, un panel B sin caja de herramientas pasa invisible.
  await pag.getByRole("button", { name: /Dos gráficas/ }).click();
  await pag.waitForTimeout(2500);

  ck("ahora hay DOS cajas de herramientas",
    await pag.getByRole("button", { name: /^Rectángulo$/ }).count() === 2,
    String(await pag.getByRole("button", { name: /^Rectángulo$/ }).count()));
  ck("y dos botones de borrar, uno por gráfica",
    await pag.getByRole("button", { name: /Borrar todos los dibujos/i }).count() === 2);

  // El lienzo de la gráfica B es el que está más a la derecha.
  const cajas = [];
  const n = await pag.locator("canvas").count();
  for (let i = 0; i < n; i++) {
    const c = await pag.locator("canvas").nth(i).boundingBox();
    if (c && c.width > 300 && c.height > 200) cajas.push(c);
  }
  cajas.sort((p, q) => p.x - q.x);
  const der = cajas[cajas.length - 1];
  const izq = cajas[0];
  ck("las dos gráficas están separadas en pantalla", der.x > izq.x + izq.width - 20,
    `izq ${izq.x.toFixed(0)}+${izq.width.toFixed(0)}, der ${der.x.toFixed(0)}`);

  await pag.getByRole("button", { name: /^Rectángulo$/ }).first().click();
  await pag.waitForTimeout(300);
  await pag.mouse.click(der.x + 150, der.y + 150);
  await pag.waitForTimeout(250);
  await pag.mouse.click(der.x + 320, der.y + 300);
  await pag.waitForTimeout(700);

  const enB = await dibujos("bt:p1:b");
  ck("DIBUJAR EN LA SEGUNDA GRÁFICA GUARDA EN bt:p1:b", enB.length === 1,
    `b=${enB.length}, claves=${(await todas()).join(",")}`);
  ck("y no se coló en la primera", (await dibujos("bt:p1:a")).length === 0,
    String((await dibujos("bt:p1:a")).length));

  await pag.screenshot({ path: "shots/dibujos-bt-dos.png" });
}

await nav.close();
console.log(`\n${fallos.length === 0 ? "TODO BIEN" : `FALLARON ${fallos.length}:\n - ${fallos.join("\n - ")}`}`);
process.exit(fallos.length === 0 ? 0 : 1);
