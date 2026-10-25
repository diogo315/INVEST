/**
 * Los tres arreglos que pidió Diego, comprobados en un navegador.
 *
 * La red a Binance está bloqueada en este contenedor, así que se
 * intercepta la petición y se sirve una serie sintética. El interceptor
 * HONRA endTime y limit igual que Binance: si no lo hiciera, la prueba de
 * la segunda gráfica pasaría por casualidad y no probaría nada.
 */
import pw from "/opt/npm-tools/node_modules/playwright/index.js";
const { chromium } = pw;

const BASE = "http://127.0.0.1:3137";
const fallos = [];
const ck = (n, c, d = "") => {
  console.log(`  ${c ? "ok " : "MAL"} ${n}${!c && d ? ` -- ${d}` : ""}`);
  if (!c) fallos.push(n);
};

const MIN = 60;
const TF_SEG = { "5m": 5 * MIN, "15m": 15 * MIN, "1h": 3600, "4h": 4 * 3600, "1d": 86400, "1w": 7 * 86400 };
// Serie larga y determinista: arranca en 2024-01-01 y llega hasta "hoy".
const INICIO = Math.floor(Date.UTC(2024, 0, 1) / 1000);
const HOY = Math.floor(Date.now() / 1000);

/** Las velas de un tramo, generadas a demanda (no se guarda la serie entera). */
function velas(tfSeg, finSeg, limite) {
  const out = [];
  const ultimo = Math.floor(Math.min(finSeg, HOY) / tfSeg) * tfSeg;
  for (let i = limite - 1; i >= 0; i--) {
    const t = ultimo - i * tfSeg;
    if (t < INICIO) continue;
    // Precio determinista en función del tiempo: una onda suave.
    const x = (t - INICIO) / 86400;
    const p = 60000 + 25000 * Math.sin(x / 40) + 60 * (x % 7);
    const o = p, c = p * 1.002;
    out.push([t * 1000, String(o), String(Math.max(o, c) * 1.004),
      String(Math.min(o, c) * 0.996), String(c), "1000",
      (t + tfSeg) * 1000 - 1, "0", 0, "0", "0", "0"]);
  }
  return out;
}

const pedidos = [];
const navegador = await chromium.launch();

async function abrir(estado) {
  const pag = await navegador.newPage({ viewport: { width: 1700, height: 1000 } });
  pag.on("pageerror", (e) => fallos.push(`error de página: ${e.message}`));
  await pag.route("**/api.binance.com/**", (ruta) => {
    const u = new URL(ruta.request().url());
    if (!u.pathname.includes("/klines")) {
      return ruta.fulfill({ status: 200, contentType: "application/json", body: "[]" });
    }
    const tf = u.searchParams.get("interval");
    const limite = Number(u.searchParams.get("limit") || 500);
    const endTime = u.searchParams.get("endTime");
    pedidos.push({ tf, limite, endTime: endTime ? Number(endTime) : null });
    const fin = endTime ? Number(endTime) / 1000 : HOY;
    return ruta.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify(velas(TF_SEG[tf], fin, limite)),
    });
  });
  await pag.addInitScript((v) => localStorage.setItem("tv-gratis-backtest", v),
    JSON.stringify(estado));
  await pag.goto(`${BASE}/backtesting`, { waitUntil: "networkidle" });
  await pag.waitForTimeout(2600);
  return pag;
}

const DESDE = Math.floor(Date.UTC(2026, 0, 1) / 1000);
const base = (extra = {}) => ({
  state: {
    backtests: [{
      id: "p1", nombre: "Prueba", simbolo: "BIN:BTCUSDT", temporalidad: "1d",
      desde: DESDE, capitalInicial: 5000, operaciones: [], tiempoActual: DESDE,
      historiaPrevia: 365, medias: [], indicadores: [], zonaHoraria: "UTC",
      creado: INICIO, ...extra,
    }],
    activoId: "p1",
    borrador: { simbolo: "BIN:BTCUSDT", desde: "", temporalidad: "1d", capital: 5000, historia: 365 },
  },
  version: 0,
});

console.log("1. Con 5.000 de capital y bitcoin caro, SE PUEDE comprar");
{
  const pag = await abrir(base());
  const precio = await pag.locator("input[type=number]").first().inputValue();
  ck("la cantidad propuesta es fraccionada", Number(precio) < 1 && Number(precio) > 0, precio);
  const comprar = pag.getByRole("button", { name: /^Comprar$/ });
  ck("el botón de comprar está habilitado", await comprar.isEnabled());
  await comprar.click();
  await pag.waitForTimeout(600);
  const ops = await pag.evaluate(() => JSON.parse(localStorage.getItem("tv-gratis-backtest")).state.backtests[0].operaciones);
  ck("quedó la operación", ops.length === 1, String(ops.length));
  ck("con cantidad fraccionada", ops[0]?.cantidad > 0 && ops[0]?.cantidad < 1, String(ops[0]?.cantidad));
  ck("y cuesta menos que el capital", ops[0].cantidad * ops[0].precioEntrada <= 5000.01,
    String((ops[0].cantidad * ops[0].precioEntrada).toFixed(2)));
  await pag.close();
}

console.log("2. Escribir el tamaño en DÓLARES y que convierta");
{
  const pag = await abrir(base());
  await pag.getByRole("button", { name: /^USD$/ }).click();
  await pag.waitForTimeout(400);
  const campo = pag.locator("input[type=number]").first();
  await campo.fill("500");
  await pag.waitForTimeout(500);
  await pag.getByRole("button", { name: /^Comprar$/ }).click();
  await pag.waitForTimeout(600);
  const op = (await pag.evaluate(() => JSON.parse(localStorage.getItem("tv-gratis-backtest")).state.backtests[0].operaciones))[0];
  const costo = op.cantidad * op.precioEntrada;
  ck("500 dólares se convirtieron a una fracción del activo",
    op.cantidad > 0 && op.cantidad < 1, String(op.cantidad));
  ck("y el costo es ~500 dólares", Math.abs(costo - 500) < 2, String(costo.toFixed(2)));
  await pag.close();
}

console.log("3. LA SEGUNDA GRÁFICA EN 15m: el bug original");
{
  pedidos.length = 0;
  const pag = await abrir(base({
    panelB: { temporalidad: "15m", indicadores: [], medias: [] },
    base: "a",
  }));
  const de15 = pedidos.filter((p) => p.tf === "15m");
  ck("se pidieron velas de 15m", de15.length > 0, String(de15.length));
  ck("y SE PIDIERON CON endTime (la ventana anclada al reloj)",
    de15.some((p) => p.endTime !== null), JSON.stringify(de15.slice(0, 2)));
  const fin = Math.max(...de15.filter((p) => p.endTime).map((p) => p.endTime / 1000));
  const ini = fin - 10000 * TF_SEG["15m"];
  ck("el reloj del backtest cae DENTRO de la ventana pedida",
    ini <= DESDE && DESDE <= fin,
    `ventana ${new Date(ini * 1000).toISOString().slice(0, 10)} → ${new Date(fin * 1000).toISOString().slice(0, 10)}`);
  // Lo que de verdad importa: que el panel dibuje VELAS, no que exista
  // un lienzo. Un lienzo vacío también cuenta como lienzo, y el bug era
  // justamente un panel en blanco. Se miran los píxeles.
  const pintado = await pag.evaluate(() => {
    const cajas = [...document.querySelectorAll("canvas")];
    // Se agrupa por la mitad de la pantalla: izquierda = gráfica A,
    // derecha = gráfica B.
    const medio = window.innerWidth / 2;
    const cuenta = (lados) => {
      let max = 0;
      for (const c of cajas) {
        const r = c.getBoundingClientRect();
        if (r.width < 200 || r.height < 200) continue;
        const centro = r.left + r.width / 2;
        if (lados === "izq" ? centro >= medio : centro < medio) continue;
        try {
          const ctx = c.getContext("2d");
          if (!ctx) continue;
          const d = ctx.getImageData(0, 0, c.width, c.height).data;
          let n = 0;
          // Se cuentan los píxeles claramente más claros que el fondo.
          for (let i = 0; i < d.length; i += 4 * 29) {
            if (d[i] + d[i + 1] + d[i + 2] > 90) n++;
          }
          max = Math.max(max, n);
        } catch {}
      }
      return max;
    };
    return { izq: cuenta("izq"), der: cuenta("der") };
  });
  // El umbral sale del control de abajo: un panel sin velas mide 0. Los
  // dos paneles no dan el mismo número porque A dibuja ~300 velas
  // diarias finas y B unas 100 de 15m anchas; lo que se afirma es que
  // ninguno está vacío, no que se parezcan.
  ck("la gráfica A tiene velas dibujadas", pintado.izq > 20, JSON.stringify(pintado));
  ck("LA GRÁFICA B TAMBIÉN (el bug era que salía en blanco)",
    pintado.der > 20, JSON.stringify(pintado));
  globalThis.__pintadoLleno = pintado;
  const aviso = await pag.getByText(/se cargan \d+ días alrededor/).count();
  ck("y explica en una línea por qué no carga el período entero", aviso > 0);
  await pag.screenshot({ path: "shots/arreglos.png" });
  await pag.close();
}

console.log("3b. Control de la medición: un panel SIN velas sí sale casi vacío");
{
  // Sin este control, «la gráfica B tiene píxeles» no prueba nada: hay
  // que enseñar que la medición distingue lleno de vacío. Se sirve una
  // respuesta vacía para 15m y se mide lo mismo.
  const pag = await navegador.newPage({ viewport: { width: 1700, height: 1000 } });
  await pag.route("**/api.binance.com/**", (ruta) => {
    const u = new URL(ruta.request().url());
    if (!u.pathname.includes("/klines")) {
      return ruta.fulfill({ status: 200, contentType: "application/json", body: "[]" });
    }
    const tf = u.searchParams.get("interval");
    if (tf === "15m") {
      return ruta.fulfill({ status: 200, contentType: "application/json", body: "[]" });
    }
    const limite = Number(u.searchParams.get("limit") || 500);
    const endTime = u.searchParams.get("endTime");
    const fin = endTime ? Number(endTime) / 1000 : HOY;
    return ruta.fulfill({ status: 200, contentType: "application/json",
      body: JSON.stringify(velas(TF_SEG[tf], fin, limite)) });
  });
  await pag.addInitScript((v) => localStorage.setItem("tv-gratis-backtest", v),
    JSON.stringify(base({ panelB: { temporalidad: "15m", indicadores: [], medias: [] }, base: "a" })));
  await pag.goto(`${BASE}/backtesting`, { waitUntil: "networkidle" });
  await pag.waitForTimeout(2600);
  const vacio = await pag.evaluate(() => {
    const cajas = [...document.querySelectorAll("canvas")];
    const medio = window.innerWidth / 2;
    let max = 0;
    for (const c of cajas) {
      const r = c.getBoundingClientRect();
      if (r.width < 200 || r.height < 200) continue;
      if (r.left + r.width / 2 < medio) continue;
      try {
        const ctx = c.getContext("2d");
        const d = ctx.getImageData(0, 0, c.width, c.height).data;
        let n = 0;
        for (let i = 0; i < d.length; i += 4 * 29) {
          if (d[i] + d[i + 1] + d[i + 2] > 90) n++;
        }
        max = Math.max(max, n);
      } catch {}
    }
    return max;
  });
  const lleno = globalThis.__pintadoLleno?.der ?? 0;
  ck(`un panel sin velas mide mucho menos que uno con velas (${vacio} vs ${lleno})`,
    vacio * 3 < lleno, `vacío=${vacio} lleno=${lleno}`);
  await pag.close();
}

console.log("4. El VWAP con sus tres bandas y sus ajustes");
{
  const pag = await abrir(base({ indicadores: ["vwap"] }));
  const gear = pag.getByRole("button", { name: /Ajustes del VWAP/i });
  ck("aparece el botón de ajustes del VWAP", await gear.count() > 0);
  await gear.first().click();
  await pag.waitForTimeout(500);
  ck("se puede elegir el anclaje", await pag.getByLabel(/Anclaje del VWAP/i).count() > 0);
  ck("se puede elegir la fuente", await pag.getByLabel(/Fuente del VWAP/i).count() > 0);
  for (const n of [1, 2, 3]) {
    ck(`está la banda ${n}`, await pag.getByLabel(new RegExp(`^Banda ${n}$`)).count() > 0);
  }
  // Encender las tres y comprobar que queda guardado en ESTE backtest.
  for (const n of [2, 3]) await pag.getByLabel(new RegExp(`^Banda ${n}$`)).check();
  await pag.waitForTimeout(600);
  const cfg = await pag.evaluate(() => JSON.parse(localStorage.getItem("tv-gratis-backtest")).state.backtests[0].config);
  ck("las tres bandas quedan guardadas con la corrida",
    cfg?.vwapShowBand2 === true && cfg?.vwapShowBand3 === true, JSON.stringify(cfg));
  // Y cambiar el anclaje se guarda también.
  await pag.getByLabel(/Anclaje del VWAP/i).selectOption("week");
  await pag.waitForTimeout(500);
  const cfg2 = await pag.evaluate(() => JSON.parse(localStorage.getItem("tv-gratis-backtest")).state.backtests[0].config);
  ck("el anclaje se guarda", cfg2?.vwapAnchor === "week", JSON.stringify(cfg2?.vwapAnchor));
  await pag.close();
}

await navegador.close();
console.log(`\n${fallos.length === 0 ? "TODO BIEN" : `FALLARON ${fallos.length}:\n - ${fallos.join("\n - ")}`}`);
process.exit(fallos.length === 0 ? 0 : 1);
