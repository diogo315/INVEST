/**
 * El SMC en el navegador: que se dibuje, que se configure y que las
 * señales se conviertan en operaciones del backtest.
 *
 * El motor ya está probado aparte (verificar-smc.mjs). Acá se comprueba
 * lo que esa prueba no puede ver: que lo calculado llegue a la pantalla,
 * que los interruptores del menú apaguen lo que dicen apagar, y que
 * «correr todas» deje operaciones de verdad en la tabla.
 */
import pw from "/opt/npm-tools/node_modules/playwright/index.js";
const { chromium } = pw;

const BASE = "http://127.0.0.1:3137";
const fallos = [];
const ck = (n, c, d = "") => {
  console.log(`  ${c ? "ok " : "MAL"} ${n}${!c && d ? ` -- ${d}` : ""}`);
  if (!c) fallos.push(n);
};

const DIA = 86400;
const T0 = Math.floor(Date.UTC(2024, 0, 1) / 1000);
const DESDE = T0 + 300 * DIA;

/**
 * Velas con estructura de verdad: tramos que suben y bajan, para que el
 * SMC tenga pivotes que romper. Una caminata al azar pura casi no da
 * BOS y la prueba quedaría comprobando que no se dibuja nada.
 */
function velas(n = 900) {
  let s = 12345;
  const r = () => ((s = (s * 1664525 + 1013904223) >>> 0), s / 4294967296);
  const o = [];
  let p = 50000;
  for (let i = 0; i < n; i++) {
    const a = p;
    const onda = Math.sin(i / 30) * 220 + Math.sin(i / 7) * 60;
    p = a + onda * 0.35 + (r() - 0.5) * 180;
    const hi = Math.max(a, p) + r() * 120;
    const lo = Math.min(a, p) - r() * 120;
    o.push([
      (T0 + i * DIA) * 1000, String(a), String(hi), String(lo), String(p),
      "1000", (T0 + (i + 1) * DIA) * 1000 - 1, "0", 0, "0", "0", "0",
    ]);
  }
  return o;
}

const nav = await chromium.launch();
const pag = await nav.newPage({ viewport: { width: 1700, height: 1000 } });
pag.on("pageerror", (e) => fallos.push(`error de página: ${e.message}`));
await pag.route("**/api.binance.com/**", (r) => {
  const u = new URL(r.request().url());
  return r.fulfill({
    status: 200,
    contentType: "application/json",
    body: u.pathname.includes("/klines") ? JSON.stringify(velas()) : "[]",
  });
});
// Sembrar solo si está vacío: `addInitScript` corre en CADA navegación,
// recarga incluida, y pisar el estado después de operar daría falsos
// negativos. Ya pasó dos veces en este repo.
await pag.addInitScript((v) => {
  if (!localStorage.getItem("tv-gratis-backtest")) {
    localStorage.setItem("tv-gratis-backtest", v);
  }
}, JSON.stringify({
  state: {
    backtests: [{
      id: "s1", nombre: "SMC", simbolo: "BIN:BTCUSDT", temporalidad: "1d",
      desde: DESDE, capitalInicial: 10000, operaciones: [],
      tiempoActual: T0 + 820 * DIA, historiaPrevia: 365, medias: [],
      indicadores: [], zonaHoraria: "UTC", creado: T0,
    }],
    activoId: "s1",
    borrador: { simbolo: "BIN:BTCUSDT", desde: "", temporalidad: "1d", capital: 10000, historia: 365 },
    panelLateral: true, conComisiones: false,
  },
  version: 0,
}));

await pag.goto(`${BASE}/backtesting`, { waitUntil: "networkidle" });
await pag.waitForTimeout(3000);

const menu = () => pag.getByRole("button", { name: "Indicador SMC" }).first();
const abrirMenu = async () => {
  await menu().click();
  await pag.waitForTimeout(500);
};
const cerrarMenu = async () => {
  await pag.keyboard.press("Escape");
  await pag.waitForTimeout(400);
};
/** Cuántos elementos dibuja la capa del SMC. */
const piezas = () =>
  pag.evaluate(() => {
    const capa = document.querySelector('svg[data-capa="smc"]');
    if (!capa) return { total: 0, rects: 0, lineas: 0, textos: [] };
    // La firma incluye las coordenadas: contar elementos no alcanza
    // para ver si el dibujo cambió, porque dos configuraciones distintas
    // pueden dejar la misma cantidad de cosas en otros lugares.
    const h = capa.innerHTML;
    let firma = 0;
    for (let i = 0; i < h.length; i++) firma = (firma * 31 + h.charCodeAt(i)) | 0;
    return {
      total: capa.querySelectorAll("rect,line,text,path").length,
      rects: capa.querySelectorAll("rect").length,
      lineas: capa.querySelectorAll("line").length,
      textos: [...capa.querySelectorAll("text")].map((t) => t.textContent),
      firma,
    };
  });

console.log("1. Apagado por defecto, y el menú está");
{
  ck("el menú SMC aparece en la barra", (await menu().count()) > 0);
  const p = await piezas();
  ck("NO DIBUJA NADA MIENTRAS ESTÉ APAGADO", p.total === 0, JSON.stringify(p).slice(0, 120));
}

console.log("2. Encenderlo dibuja");
{
  await abrirMenu();
  await pag.getByRole("switch", { name: "Mostrar el indicador SMC" }).click();
  await pag.waitForTimeout(400);
  await cerrarMenu();
  await pag.waitForTimeout(1200);
  const p = await piezas();
  ck("al encenderlo aparece el dibujo", p.total > 5, JSON.stringify(p).slice(0, 160));
  ck("hay etiquetas de estructura (BOS o CHoCH)",
    p.textos.some((t) => /BOS|CHoCH/.test(t ?? "")),
    (p.textos ?? []).slice(0, 10).join(" | "));
  ck("y cajas de bloques de órdenes", p.rects > 0, String(p.rects));
  // Las señales se calculan pero NO se dibujan. Se dibujaban, y una que
  // todavía no tocó su stop ni su objetivo se extiende hasta la última
  // vela: la caja tapaba media pantalla. Esta comprobación está para
  // que no vuelvan sin que alguien lo decida.
  ck("LAS SEÑALES DE ENTRADA NO SE DIBUJAN",
    !p.textos.some((t) => /B\/R|^Compra |^Venta /.test(t ?? "")),
    (p.textos ?? []).join(" | "));
  ck("ni hay botones de operar sobre el gráfico",
    (await pag.getByRole("button", { name: "Operar" }).count()) === 0);
}

console.log("3. Los interruptores apagan lo que dicen");
{
  const antes = await piezas();
  await abrirMenu();
  await pag.getByRole("switch", { name: "Estructura interna" }).click();
  await pag.waitForTimeout(300);
  await pag.getByRole("switch", { name: "Estructura de swing" }).click();
  await pag.waitForTimeout(300);
  await cerrarMenu();
  await pag.waitForTimeout(900);
  const sin = await piezas();
  ck("SIN ESTRUCTURA DESAPARECEN SUS ETIQUETAS",
    !sin.textos.some((t) => /BOS|CHoCH/.test(t ?? "")),
    (sin.textos ?? []).slice(0, 8).join(" | "));
  ck("y queda menos dibujado que antes", sin.total < antes.total,
    `${sin.total} vs ${antes.total}`);

  // Volver a encenderlas y prender algo nuevo.
  await abrirMenu();
  await pag.getByRole("switch", { name: "Estructura interna" }).click();
  await pag.waitForTimeout(250);
  await pag.getByRole("switch", { name: "Estructura de swing" }).click();
  await pag.waitForTimeout(250);
  await pag.getByRole("switch", { name: "Zonas premium/descuento" }).click();
  await pag.waitForTimeout(300);
  await cerrarMenu();
  await pag.waitForTimeout(900);
  const con = await piezas();
  ck("ENCENDER LAS ZONAS LAS DIBUJA",
    con.textos.some((t) => /Premium|Descuento|Equilibrio/.test(t ?? "")),
    (con.textos ?? []).slice(0, 10).join(" | "));
  await abrirMenu();
  await pag.getByRole("switch", { name: "Zonas premium/descuento" }).click();
  await pag.waitForTimeout(250);
  await cerrarMenu();
}

console.log("4. Los ajustes de cálculo cambian el dibujo");
{
  await abrirMenu();
  const largo = pag.getByLabel("Largo del swing");
  ck("está el ajuste del largo de swing", (await largo.count()) > 0);
  const antes = await piezas();
  // Se baja a 8 y no a un valor cercano. Medido sobre esta serie: entre
  // 15 y 120 el detector encuentra EXACTAMENTE los mismos pivotes, así
  // que probar con 120 habría dado un dibujo idéntico y la prueba
  // habría acusado al código de no actualizarse cuando el que no
  // cambiaba era el resultado. Esa meseta es real y conviene saberla:
  // mover este número de a poco muchas veces no cambia nada.
  await largo.fill("8");
  await pag.waitForTimeout(900);
  await cerrarMenu();
  await pag.waitForTimeout(900);
  const despues = await piezas();
  // Se compara la FIRMA del dibujo y no la cantidad de elementos: dos
  // configuraciones distintas pueden dejar el mismo número de cosas en
  // otros lugares, y contar diría que no pasó nada.
  ck("CAMBIAR EL LARGO DEL SWING CAMBIA EL DIBUJO",
    despues.firma !== antes.firma, `${antes.firma} -> ${despues.firma}`);
  await abrirMenu();
  await pag.getByLabel("Largo del swing").fill("50");
  await pag.waitForTimeout(700);
  await cerrarMenu();
  await pag.waitForTimeout(800);
  ck("y volver al valor anterior devuelve el dibujo de antes",
    (await piezas()).firma === antes.firma);
}

console.log("5. El panel de señales");
{
  const panel = pag.getByText(/Señales SMC/).first();
  ck("el panel aparece en la barra de la derecha", (await panel.count()) > 0);
  const boton = pag.getByRole("button", { name: /Correr la|Correr las/ });
  ck("y el botón de correrlas todas", (await boton.count()) > 0);
  const riesgo = pag.getByLabel("Riesgo por operación");
  ck("con su riesgo por operación", (await riesgo.count()) > 0);
  ck("que viene en 1 %", (await riesgo.inputValue()) === "1");
}

console.log("6. CORRER LAS SEÑALES DEJA OPERACIONES DE VERDAD");
{
  const filas = () =>
    pag.evaluate(() => document.querySelectorAll("tbody tr").length);
  const antes = await filas();

  // 0,2 % en vez de 1 %: con 1 % y stops de medio punto porcentual, el
  // tamaño que pide el riesgo supera lo que 10.000 de efectivo aguantan
  // al contado, el tope recorta y el riesgo real queda por debajo. Eso
  // es correcto —no se puede comprar 18.000 con 10.000— pero tapa lo que
  // esta prueba quiere ver. El tope se comprueba aparte, abajo.
  await pag.getByLabel("Riesgo por operación").fill("0.2");
  await pag.waitForTimeout(600);

  const boton = pag.getByRole("button", { name: /Correr la|Correr las/ });
  const texto = await boton.textContent();
  const cuantas = Number((texto ?? "").match(/\d+/)?.[0] ?? 0);
  ck("el botón dice cuántas señales hay", cuantas > 0, texto ?? "");

  await boton.click();
  await pag.waitForTimeout(1500);
  const despues = await filas();
  ck("LA TABLA DE OPERACIONES CRECIÓ", despues > antes, `${antes} -> ${despues}`);
  ck("y crecieron tantas como señales había", despues - antes === cuantas,
    `${despues - antes} filas nuevas, ${cuantas} señales`);

  const guardadas = await pag.evaluate(() => {
    const g = JSON.parse(localStorage.getItem("tv-gratis-backtest") || "{}");
    const bt = g?.state?.backtests?.find((b) => b.id === "s1");
    return (bt?.operaciones ?? []).map((o) => ({
      lado: o.lado, cant: o.cantidad, e: o.precioEntrada,
      sl: o.stopLoss, tp: o.takeProfit, s: o.precioSalida, m: o.motivo,
    }));
  });
  ck("quedaron guardadas", guardadas.length === cuantas, String(guardadas.length));
  ck("TODAS LLEVAN SU STOP Y SU OBJETIVO",
    guardadas.every((o) => Number.isFinite(o.sl) && Number.isFinite(o.tp)),
    JSON.stringify(guardadas[0]));
  ck("el stop está del lado que corresponde",
    guardadas.every((o) => (o.lado === "compra" ? o.sl < o.e : o.sl > o.e)),
    JSON.stringify(guardadas.filter((o) => (o.lado === "compra" ? o.sl >= o.e : o.sl <= o.e))));
  ck("y el objetivo del otro",
    guardadas.every((o) => (o.lado === "compra" ? o.tp > o.e : o.tp < o.e)));
  ck("ninguna con cantidad cero", guardadas.every((o) => o.cant > 0));

  const riesgos = guardadas.map((o) => Math.abs(o.e - o.sl) * o.cant);
  const maxR = Math.max(...riesgos);
  const minR = Math.min(...riesgos);
  ck("CADA OPERACIÓN ARRIESGA LO MISMO: 0,2 % de 10.000 = $20",
    maxR <= 20.01 && minR > 19.9,
    `entre ${minR.toFixed(2)} y ${maxR.toFixed(2)}`);
  ck("y el tamaño es distinto en cada una, porque el stop está a otra distancia",
    new Set(guardadas.map((o) => o.cant)).size > 1,
    guardadas.map((o) => o.cant).join(","));

  // EL TOPE: ninguna operación puede valer más que el efectivo al contado.
  ck("NINGUNA PIDE MÁS NOCIONAL QUE EL EFECTIVO que había",
    guardadas.every((o) => o.cant * o.e <= 10000.01),
    guardadas.map((o) => (o.cant * o.e).toFixed(0)).join(","));

  const cerradas = guardadas.filter((o) => o.m);
  ck("las señales ya resueltas vienen cerradas", cerradas.length > 0,
    String(cerradas.length));
  ck("y solo con motivo de stop u objetivo",
    cerradas.every((o) => o.m === "stop" || o.m === "objetivo"),
    cerradas.map((o) => o.m).join(","));
}

console.log("7. No se opera dos veces la misma señal");
{
  const boton = pag.getByRole("button", { name: /Correr la|Correr las/ });
  const quedan = Number((await boton.textContent() ?? "").match(/\d+/)?.[0] ?? -1);
  ck("DESPUÉS DE CORRERLAS NO QUEDA NINGUNA PENDIENTE", quedan === 0,
    String(quedan));
  const antes = await pag.evaluate(() => document.querySelectorAll("tbody tr").length);
  await boton.click({ force: true }).catch(() => {});
  await pag.waitForTimeout(800);
  const despues = await pag.evaluate(() => document.querySelectorAll("tbody tr").length);
  ck("y volver a apretar no duplica nada", despues === antes, `${antes} -> ${despues}`);
}

console.log("8. El indicador sobrevive a recargar la página");
{
  await pag.reload({ waitUntil: "networkidle" });
  await pag.waitForTimeout(3000);
  const p = await piezas();
  ck("sigue encendido y dibujando", p.total > 5, String(p.total));
  await abrirMenu();
  ck("y el largo de swing quedó como se dejó",
    (await pag.getByLabel("Largo del swing").inputValue()) === "50");
  await cerrarMenu();
}

await pag.screenshot({ path: "shots/smc-backtest.png" });

console.log("9. También está en la pestaña Gráfico");
{
  await pag.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await pag.waitForTimeout(3500);
  ck("el menú SMC está en la barra de arriba",
    (await pag.getByRole("button", { name: "Indicador SMC" }).count()) > 0);
  const p = await piezas();
  ck("Y DIBUJA EN EL GRÁFICO EN VIVO, con los mismos ajustes", p.total > 5,
    JSON.stringify(p).slice(0, 140));
  await pag.screenshot({ path: "shots/smc-grafico.png" });
}

await nav.close();
console.log(`\n${fallos.length === 0 ? "TODO BIEN" : `FALLARON ${fallos.length}:\n - ${fallos.join("\n - ")}`}`);
process.exit(fallos.length === 0 ? 0 : 1);
