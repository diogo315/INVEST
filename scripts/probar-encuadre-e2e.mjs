/**
 * El encuadre del backtest, en el navegador.
 *
 * La cuenta ya está probada aparte (verificar-encuadre.mjs). Acá se
 * comprueba lo único que esa prueba no puede ver: que en pantalla, al
 * avanzar una vela, lo ya dibujado SE QUEDE DONDE ESTÁ.
 *
 * Cómo se mide: se siembra una línea vertical en un momento fijo con el
 * sistema de dibujos que ya existe. Esa línea se posiciona convirtiendo
 * su fecha a píxeles con el mismo gráfico, así que su `x` es una regla.
 * Si el dibujo no se mueve, la línea no se mueve.
 */
import pw from "/opt/npm-tools/node_modules/playwright/index.js";
const { chromium } = pw;

const BASE = "http://127.0.0.1:3137";
const fallos = [];
const ck = (n, c, d = "") => {
  console.log(`  ${c ? "ok " : "MAL"} ${n}${!c && d ? ` -- ${d}` : ""}`);
  if (!c) fallos.push(n);
};

const TFS = { "1m": 60, "5m": 300, "15m": 900, "30m": 1800, "1h": 3600, "4h": 14400, "1d": 86400 };
const PASO = 900;
const T0 = Math.floor(Date.UTC(2025, 0, 1) / 1000);
const HOY = Math.floor(Date.now() / 1000);
const DESDE = T0 + 200 * 86400;
const MARCA = DESDE - 20 * PASO;

function velas(tf, finSeg, limite) {
  const paso = TFS[tf] ?? 900;
  const out = [];
  const ultimo = Math.floor(Math.min(finSeg, HOY) / paso) * paso;
  for (let i = limite - 1; i >= 0; i--) {
    const t = ultimo - i * paso;
    const p = 90000 + 4000 * Math.sin((t - T0) / 86400 / 3);
    out.push([t * 1000, String(p), String(p * 1.004), String(p * 0.996),
      String(p * 1.001), "1000", (t + paso) * 1000 - 1, "0", 0, "0", "0", "0"]);
  }
  return out;
}

const nav = await chromium.launch();
const pag = await nav.newPage({ viewport: { width: 1700, height: 1000 } });
pag.on("pageerror", (e) => fallos.push(`error de página: ${e.message}`));
await pag.route("**/api.binance.com/**", (r) => {
  const u = new URL(r.request().url());
  if (!u.pathname.includes("/klines")) {
    return r.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  }
  return r.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify(velas(
      u.searchParams.get("interval") || "15m",
      Number(u.searchParams.get("endTime") || Date.now()) / 1000,
      Number(u.searchParams.get("limit") || 500),
    )),
  });
});
await pag.addInitScript(([bt, ch]) => {
  if (!localStorage.getItem("tv-gratis-backtest")) {
    localStorage.setItem("tv-gratis-backtest", bt);
  }
  localStorage.setItem("tv-gratis-chart-state", ch);
}, [
  JSON.stringify({
    state: {
      backtests: [{
        id: "e1", nombre: "E", simbolo: "BIN:BTCUSDT", temporalidad: "15m",
        desde: DESDE, capitalInicial: 5000, operaciones: [], tiempoActual: DESDE,
        historiaPrevia: 365, medias: [], indicadores: [], zonaHoraria: "UTC", creado: T0,
      }],
      activoId: "e1",
      borrador: { simbolo: "BIN:BTCUSDT", desde: "", temporalidad: "15m", capital: 5000, historia: 365 },
      panelLateral: true, conComisiones: false,
    }, version: 0,
  }),
  JSON.stringify({
    state: {
      dibujos: {
        "bt:e1": [{
          id: "regla", tipo: "vertical", puntos: [{ time: MARCA, price: 0 }],
          color: "#ffffff", grosor: 2, estilo: "solida", relleno: true,
          texto: "", tamanoTexto: 14, bloqueado: false, creado: 1,
        }],
      },
    }, version: 0,
  }),
]);

await pag.goto(`${BASE}/backtesting`, { waitUntil: "networkidle" });
await pag.waitForTimeout(3500);

/** La x de la regla: dónde cae en pantalla un momento fijo. */
const reglaX = () => pag.evaluate(() => {
  const g = document.querySelector('[data-dibujo="regla"] line');
  return g ? Math.round(Number(g.getAttribute("x1"))) : null;
});
const avanzar = async (n = 1) => {
  for (let i = 0; i < n; i++) {
    await pag.getByRole("button", { name: "Una vela adelante" }).click();
    await pag.waitForTimeout(450);
  }
};

console.log("1. LO YA DIBUJADO NO SE MUEVE AL AVANZAR");
{
  const inicial = await reglaX();
  ck("la regla está en pantalla", inicial !== null && inicial > 0 && inicial < 1500,
    String(inicial));

  const posiciones = [inicial];
  for (let i = 0; i < 12; i++) {
    await avanzar();
    posiciones.push(await reglaX());
  }
  const quietas = posiciones.every((x) => x === inicial);
  ck("DOCE VELAS DESPUÉS, SIGUE EN EL MISMO PÍXEL", quietas,
    `${inicial} -> ${posiciones.join(",")}`);
}

console.log("2. Pero cuando la vela llega al borde, sí se pasa de página");
{
  const antes = await reglaX();
  // El aire es un quinto de la ventana. Con suficientes velas se acaba
  // y el gráfico tiene que correrse, o la vela nueva se dibujaría fuera.
  let movio = false;
  let pasos = 0;
  for (let i = 0; i < 60 && !movio; i++) {
    await avanzar();
    pasos++;
    if ((await reglaX()) !== antes) movio = true;
  }
  ck("SE TERMINA DESPLAZANDO, no deja la vela afuera", movio, `${pasos} pasos`);
  ck("y no fue enseguida: aguantó varias velas quieto", pasos > 5, String(pasos));

  // Y después de pasar de página, se vuelve a quedar quieto.
  const despues = await reglaX();
  const luego = [];
  for (let i = 0; i < 6; i++) {
    await avanzar();
    luego.push(await reglaX());
  }
  ck("DESPUÉS DE PASAR DE PÁGINA SE QUEDA QUIETO OTRA VEZ",
    luego.every((x) => x === despues), `${despues} -> ${luego.join(",")}`);
}

console.log("3. Al que se fue a mirar el pasado no se lo arrastra");
{
  // Se arrastra el gráfico hacia la derecha, que es irse al pasado.
  const caja = await pag.locator("canvas").first().boundingBox();
  await pag.mouse.move(caja.x + 300, caja.y + caja.height / 2);
  await pag.mouse.down();
  await pag.mouse.move(caja.x + 800, caja.y + caja.height / 2, { steps: 10 });
  await pag.mouse.up();
  await pag.waitForTimeout(700);

  const enElPasado = await reglaX();
  ck("el arrastre movió la vista", enElPasado !== null, String(enElPasado));
  await avanzar(4);
  ck("AVANZAR EL REPRODUCTOR NO LO TRAE DE VUELTA",
    (await reglaX()) === enElPasado, `${enElPasado} -> ${await reglaX()}`);
}

await pag.screenshot({ path: "shots/encuadre.png" });
await nav.close();
console.log(`\n${fallos.length === 0 ? "TODO BIEN" : `FALLARON ${fallos.length}:\n - ${fallos.join("\n - ")}`}`);
process.exit(fallos.length === 0 ? 0 : 1);
