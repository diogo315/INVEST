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

const dibujos = (clave = "bt:p1") => pag.evaluate((k) => {
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
  ck("se guardan bajo la clave del backtest", claves.includes("bt:p1"), claves.join(","));
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

console.log("7. CON DOS GRÁFICAS: CADA UNA SU CAJA, Y LOS DIBUJOS COMPARTIDOS");
{
  // Esto es lo que se escapó la primera vez: la prueba abría UNA gráfica,
  // así que nunca miró si la segunda recibía su caja de herramientas.
  await pag.getByRole("button", { name: /Dos gráficas/ }).click();
  await pag.waitForTimeout(2800);

  ck("hay DOS cajas de herramientas",
    await pag.getByRole("button", { name: /^Rectángulo$/ }).count() === 2,
    String(await pag.getByRole("button", { name: /^Rectángulo$/ }).count()));
  ck("y dos botones de borrar, uno por gráfica",
    await pag.getByRole("button", { name: /Borrar todos los dibujos/i }).count() === 2);

  // Qué dibujos muestra cada capa, por su data-dibujo.
  const porCapa = () => pag.evaluate(() =>
    [...document.querySelectorAll("svg")]
      .filter((s) => s.querySelector("[data-dibujo]") || s.closest(".z-10"))
      .map((s) => [...s.querySelectorAll("[data-dibujo]")].map((g) => g.dataset.dibujo))
      .filter((l) => l.length > 0));

  const lienzos = [];
  const n = await pag.locator("canvas").count();
  for (let i = 0; i < n; i++) {
    const c = await pag.locator("canvas").nth(i).boundingBox();
    if (c && c.width > 300 && c.height > 200) lienzos.push(c);
  }
  lienzos.sort((p, q) => p.x - q.x);
  const izq = lienzos[0], der = lienzos[lienzos.length - 1];
  ck("las dos gráficas están separadas en pantalla", der.x > izq.x + izq.width - 20,
    `izq ${izq.x.toFixed(0)}+${izq.width.toFixed(0)}, der ${der.x.toFixed(0)}`);

  // Dibujar en la de la IZQUIERDA.
  await pag.getByRole("button", { name: /^Rectángulo$/ }).first().click();
  await pag.waitForTimeout(300);
  await pag.mouse.click(izq.x + 150, izq.y + 150);
  await pag.waitForTimeout(250);
  await pag.mouse.click(izq.x + 350, izq.y + 300);
  await pag.waitForTimeout(800);

  const guardados = await dibujos("bt:p1");
  ck("se guarda bajo la clave compartida bt:p1", guardados.length === 1,
    `${guardados.length}, claves=${(await todas()).join(",")}`);
  ck("y NO quedan claves por gráfica (:a / :b)",
    !(await todas()).some((k) => /^bt:p1:(a|b)$/.test(k)), (await todas()).join(","));

  const capas = await porCapa();
  ck("LO DIBUJADO EN UNA APARECE EN LAS DOS GRÁFICAS",
    capas.length === 2 && capas.every((l) => l.includes(guardados[0].id)),
    JSON.stringify(capas));

  // Y al revés: dibujar en la de la DERECHA también se ve en la izquierda.
  await pag.getByRole("button", { name: /^Rectángulo$/ }).last().click();
  await pag.waitForTimeout(300);
  await pag.mouse.click(der.x + 120, der.y + 180);
  await pag.waitForTimeout(250);
  await pag.mouse.click(der.x + 300, der.y + 320);
  await pag.waitForTimeout(800);
  const dos = await dibujos("bt:p1");
  ck("ahora son dos dibujos, en la misma clave", dos.length === 2, String(dos.length));
  const capas2 = await porCapa();
  ck("Y AL REVÉS: lo de la derecha se ve en la izquierda",
    capas2.length === 2 && capas2.every((l) => l.length === 2), JSON.stringify(capas2));

  await pag.screenshot({ path: "shots/dibujos-bt-dos.png" });
}

console.log("8. ESTIRAR EL RECTÁNGULO DE UN LADO, SIN CAMBIARLE LA ALTURA");
{
  // Dejar un solo rectángulo para no pelear con la selección.
  pag.once("dialog", (d) => d.accept());
  await pag.getByRole("button", { name: /Borrar todos los dibujos/i }).first().click();
  await pag.waitForTimeout(500);

  const lienzos = [];
  const n = await pag.locator("canvas").count();
  for (let i = 0; i < n; i++) {
    const c = await pag.locator("canvas").nth(i).boundingBox();
    if (c && c.width > 300 && c.height > 200) lienzos.push(c);
  }
  lienzos.sort((p, q) => p.x - q.x);
  const c = lienzos[0];

  await pag.getByRole("button", { name: /^Rectángulo$/ }).first().click();
  await pag.waitForTimeout(300);
  await pag.mouse.click(c.x + 150, c.y + 200);
  await pag.waitForTimeout(250);
  await pag.mouse.click(c.x + 320, c.y + 340);
  await pag.waitForTimeout(800);

  const antes = (await dibujos("bt:p1"))[0];
  ck("hay un rectángulo para estirar", antes?.tipo === "rectangulo", String(antes?.tipo));

  // Seleccionarlo: clic encima con el cursor.
  await pag.mouse.click(c.x + 240, c.y + 270);
  await pag.waitForTimeout(500);

  const lado = pag.getByRole("button", { name: "Lado derecho" }).first();
  ck("aparece el tirador del lado derecho", await lado.count() > 0);
  const t = await lado.boundingBox();
  ck("el tirador es una barrita VERTICAL, no un cuadradito",
    !!t && t.height > t.width, t ? `${t.width}x${t.height}` : "sin caja");

  const altoAntes = Math.abs(antes.puntos[0].price - antes.puntos[1].price);
  const anchoAntes = Math.abs(antes.puntos[0].time - antes.puntos[1].time);

  // Arrastrarlo 180 px a la derecha y 90 px hacia ARRIBA a la vez: si el
  // tirador respetara el eje Y, la altura cambiaría.
  await pag.mouse.move(t.x + t.width / 2, t.y + t.height / 2);
  await pag.mouse.down();
  await pag.mouse.move(t.x + t.width / 2 + 90, t.y + t.height / 2 - 45, { steps: 6 });
  await pag.mouse.move(t.x + t.width / 2 + 180, t.y + t.height / 2 - 90, { steps: 6 });
  await pag.mouse.up();
  await pag.waitForTimeout(600);

  const despues = (await dibujos("bt:p1"))[0];
  const altoDespues = Math.abs(despues.puntos[0].price - despues.puntos[1].price);
  const anchoDespues = Math.abs(despues.puntos[0].time - despues.puntos[1].time);
  ck("LA ALTURA NO CAMBIÓ", Math.abs(altoDespues - altoAntes) < 1e-6,
    `${altoAntes.toFixed(2)} -> ${altoDespues.toFixed(2)}`);
  ck("Y EL ANCHO SÍ CRECIÓ", anchoDespues > anchoAntes * 1.1,
    `${anchoAntes} -> ${anchoDespues}`);

  // El espejo: el lado de arriba mueve el precio y deja el ancho.
  const arriba = pag.getByRole("button", { name: "Lado superior" }).first();
  ck("también está el tirador de arriba", await arriba.count() > 0);
  const ta = await arriba.boundingBox();
  ck("y ese es una barrita HORIZONTAL", !!ta && ta.width > ta.height,
    ta ? `${ta.width}x${ta.height}` : "sin caja");
  await pag.mouse.move(ta.x + ta.width / 2, ta.y + ta.height / 2);
  await pag.mouse.down();
  await pag.mouse.move(ta.x + ta.width / 2 + 120, ta.y + ta.height / 2 - 60, { steps: 8 });
  await pag.mouse.up();
  await pag.waitForTimeout(600);

  const final = (await dibujos("bt:p1"))[0];
  const anchoFinal = Math.abs(final.puntos[0].time - final.puntos[1].time);
  const altoFinal = Math.abs(final.puntos[0].price - final.puntos[1].price);
  ck("EL ANCHO NO CAMBIÓ al estirar por arriba",
    Math.abs(anchoFinal - anchoDespues) < 1e-6, `${anchoDespues} -> ${anchoFinal}`);
  ck("y la altura sí creció", altoFinal > altoDespues * 1.05,
    `${altoDespues.toFixed(2)} -> ${altoFinal.toFixed(2)}`);

  await pag.screenshot({ path: "shots/dibujos-bt-lados.png" });
}

console.log("9. LOS DIBUJOS VIEJOS (guardados por gráfica) NO SE PIERDEN");
{
  // Quien ya venía usando la versión anterior tiene sus dibujos bajo
  // `bt:<id>:a` y `bt:<id>:b`. Al recargar tienen que VERSE, en las dos
  // gráficas. Se comprueba en la pantalla y no en localStorage: la
  // mudanza pasa al rehidratar el store, y lo guardado en disco recién
  // se reescribe en el siguiente guardado. Mirar el disco daría un falso
  // negativo —y de hecho lo dio.
  const linea = (id, price, color) => ({
    id, tipo: "horizontal", puntos: [{ time: 0, price }],
    color, grosor: 2, estilo: "solida", relleno: true,
    texto: "", tamanoTexto: 14, bloqueado: false, creado: 1,
  });
  await pag.evaluate((ls) => {
    const g = JSON.parse(localStorage.getItem("tv-gratis-chart-state") || "{}");
    g.state = g.state || {};
    g.state.dibujos = {
      "bt:p1:a": [ls[0]],
      "bt:p1:b": [ls[1]],
      "BTCUSDT": [ls[2]],
    };
    localStorage.setItem("tv-gratis-chart-state", JSON.stringify(g));
  }, [linea("viejo-a", 50200, "#2962ff"), linea("viejo-b", 49800, "#26a69a"),
      linea("del-mercado", 60000, "#ffffff")]);

  await pag.reload({ waitUntil: "networkidle" });
  await pag.waitForTimeout(3000);

  const porCapa = () => pag.evaluate(() =>
    [...document.querySelectorAll("svg")]
      .map((s) => [...s.querySelectorAll("[data-dibujo]")].map((g) => g.dataset.dibujo))
      .filter((l) => l.length > 0));

  const capas = await porCapa();
  ck("LOS DOS DIBUJOS VIEJOS SE VEN, en las dos gráficas",
    capas.length === 2 &&
      capas.every((l) => l.includes("viejo-a") && l.includes("viejo-b")),
    JSON.stringify(capas));
  ck("y el del MERCADO no se coló en el backtest",
    capas.every((l) => !l.includes("del-mercado")), JSON.stringify(capas));
  ck("el dibujo del mercado sigue guardado aparte",
    (await dibujos("BTCUSDT")).length === 1, (await todas()).join(","));

  // Al dibujar algo nuevo, lo guardado en disco queda ya en la clave nueva.
  await pag.getByRole("button", { name: /^Línea horizontal$/ }).first().click();
  await pag.waitForTimeout(300);
  const c = await pag.locator("canvas").first().boundingBox();
  await pag.mouse.click(c.x + 200, c.y + 220);
  await pag.waitForTimeout(800);
  const claves = await todas();
  ck("y el disco se ordena solo en el siguiente guardado",
    claves.includes("bt:p1") && !claves.some((k) => /^bt:p1:(a|b)$/.test(k)),
    claves.join(","));
  ck("sin perder ninguno de los tres",
    (await dibujos("bt:p1")).length === 3, String((await dibujos("bt:p1")).length));
}

await nav.close();
console.log(`\n${fallos.length === 0 ? "TODO BIEN" : `FALLARON ${fallos.length}:\n - ${fallos.join("\n - ")}`}`);
process.exit(fallos.length === 0 ? 0 : 1);
