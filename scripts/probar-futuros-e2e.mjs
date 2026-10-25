/**
 * Futuros con apalancamiento y el conmutador de comisiones.
 *
 * Lo que se comprueba no es que los botones existan, sino que los
 * NÚMEROS cambien como tienen que cambiar: que el margen sea el
 * nocional dividido por el apalancamiento, que una caída liquide la
 * posición, y que apagar las comisiones mejore el resultado en
 * exactamente lo que costaban.
 *
 * La serie es determinista y con una forma conocida: sube hasta cierta
 * vela y después se desploma, así se sabe de antemano qué debe pasar.
 */
import pw from "/opt/npm-tools/node_modules/playwright/index.js";
const { chromium } = pw;

const BASE = "http://127.0.0.1:3137";
const fallos = [];
const ck = (n, c, d = "") => {
  console.log(`  ${c ? "ok " : "MAL"} ${n}${!c && d ? ` -- ${d}` : ""}`);
  if (!c) fallos.push(n);
};
const casi = (a, b, e = 0.02) => Math.abs(a - b) < e;

const DIA = 86400;
const T0 = Math.floor(Date.UTC(2024, 0, 1) / 1000);
const DESDE = T0 + 100 * DIA;
// Sube 1 %/día hasta la vela 140; después cae 4 %/día.
function velas(n = 400) {
  const out = [];
  let p = 1000;
  for (let i = 0; i < n; i++) {
    const o = p;
    p = i < 140 ? p * 1.01 : p * 0.96;
    out.push([(T0 + i * DIA) * 1000, String(o), String(Math.max(o, p) * 1.002),
      String(Math.min(o, p) * 0.998), String(p), "1000",
      (T0 + (i + 1) * DIA) * 1000 - 1, "0", 0, "0", "0", "0"]);
  }
  return out;
}

const nav = await chromium.launch();
const estadoBase = (extra = {}) => ({
  state: {
    backtests: [{
      id: "p1", nombre: "Prueba", simbolo: "BIN:BTCUSDT", temporalidad: "1d",
      desde: DESDE, capitalInicial: 10000, operaciones: [], tiempoActual: DESDE,
      historiaPrevia: 365, medias: [], indicadores: [], zonaHoraria: "UTC",
      creado: T0, ...extra,
    }],
    activoId: "p1",
    borrador: { simbolo: "BIN:BTCUSDT", desde: "", temporalidad: "1d", capital: 10000, historia: 365 },
    panelLateral: true, conComisiones: true,
  },
  version: 0,
});

async function abrir(extra = {}, raiz = {}) {
  const pag = await nav.newPage({ viewport: { width: 1700, height: 1000 } });
  pag.on("pageerror", (e) => fallos.push(`error de página: ${e.message}`));
  await pag.route("**/api.binance.com/**", (r) => {
    const u = new URL(r.request().url());
    return r.fulfill({ status: 200, contentType: "application/json",
      body: u.pathname.includes("/klines") ? JSON.stringify(velas()) : "[]" });
  });
  const est = estadoBase(extra);
  Object.assign(est.state, raiz);
  await pag.addInitScript((v) => {
    if (!localStorage.getItem("tv-gratis-backtest")) {
      localStorage.setItem("tv-gratis-backtest", v);
    }
  }, JSON.stringify(est));
  await pag.goto(`${BASE}/backtesting`, { waitUntil: "networkidle" });
  await pag.waitForTimeout(2500);
  return pag;
}
const ops = (p) => p.evaluate(() =>
  JSON.parse(localStorage.getItem("tv-gratis-backtest")).state.backtests[0].operaciones);
const texto = async (p, re) => (await p.getByText(re).first().textContent().catch(() => "")) ?? "";

console.log("1. Elegir futuros y apalancamiento");
{
  const pag = await abrir();
  ck("hay selector de spot/futuros", await pag.getByRole("button", { name: /^Futuros$/ }).count() > 0);
  await pag.getByRole("button", { name: /^Futuros$/ }).click();
  await pag.waitForTimeout(500);
  ck("aparecen los apalancamientos", await pag.getByRole("button", { name: /^Apalancamiento 10x$/ }).count() > 0);
  await pag.getByRole("button", { name: /^Apalancamiento 10x$/ }).click();
  await pag.waitForTimeout(500);
  const aviso = await texto(pag, /te liquidan con un/);
  ck("avisa cuánto se aguanta en contra", /9\.50 %/.test(aviso), aviso.slice(0, 90));
  await pag.getByRole("button", { name: /^Apalancamiento 20x$/ }).click();
  await pag.waitForTimeout(400);
  const aviso20 = await texto(pag, /te liquidan con un/);
  ck("a 20× avisa 4,50 % y advierte", /4\.50 %/.test(aviso20) && /un día cualquiera/.test(aviso20),
    aviso20.slice(0, 120));
  await pag.close();
}

console.log("2. EL MARGEN: a 10× inmoviliza la décima parte");
{
  const pag = await abrir({ mercado: "futuros", futuros: { apalancamiento: 10, comision: 0.04, financiamiento: 0.01, mantenimiento: 0.005 } });
  const campo = pag.getByLabel(/^(Cantidad|Monto en dólares)$/);
  await campo.click();
  await pag.keyboard.press("Control+a"); await pag.keyboard.press("Delete");
  await campo.pressSequentially("10", { delay: 60 });   // 10 unidades
  await pag.keyboard.press("Enter");
  await pag.waitForTimeout(600);
  const precio = Number((await texto(pag, /× \$/)).match(/× \$?([\d.,]+)/)?.[1].replace(/\./g, "").replace(",", ".") ?? 0);
  await pag.getByRole("button", { name: /^Comprar$/ }).click();
  await pag.waitForTimeout(700);
  const o = (await ops(pag))[0];
  ck("la operación guarda el apalancamiento", o?.apalancamiento === 10, String(o?.apalancamiento));
  const nocional = o.cantidad * o.precioEntrada;
  const libre = Number((await texto(pag, /^libre \$/)).replace(/[^\d.]/g, ""));
  const esperado = 10000 - nocional / 10;
  ck(`el efectivo libre baja solo el margen (${nocional.toFixed(0)}/10)`,
    casi(libre, esperado, 2), `libre ${libre}, esperado ${esperado.toFixed(0)}`);
  ck("y NO el nocional completo", !casi(libre, 10000 - nocional, 2));
  await pag.close();
}

console.log("3. LIQUIDACIÓN: la caída cierra la posición sola");
{
  // Se arranca justo antes del desplome (vela 140) con 20×: aguanta
  // 4,5 % y la serie cae 4 % por vela, así que liquida en dos velas.
  const pag = await abrir({
    mercado: "futuros",
    futuros: { apalancamiento: 20, comision: 0.04, financiamiento: 0.01, mantenimiento: 0.005 },
    tiempoActual: T0 + 139 * DIA, desde: T0 + 100 * DIA,
  });
  await pag.getByRole("button", { name: /^Comprar$/ }).click();
  await pag.waitForTimeout(700);
  ck("se abrió la posición", (await ops(pag)).length === 1);
  for (let i = 0; i < 5; i++) {
    try { await pag.getByRole("button", { name: /Una vela adelante/i }).click({ timeout: 2500 }); } catch {}
    await pag.waitForTimeout(250);
  }
  await pag.waitForTimeout(700);
  const o = (await ops(pag))[0];
  ck("la posición se cerró sola", o?.precioSalida !== undefined, JSON.stringify(o)?.slice(0, 160));
  ck("y el motivo es LIQUIDACIÓN", o?.motivo === "liquidacion", String(o?.motivo));
  const caida = (o.precioEntrada - o.precioSalida) / o.precioEntrada * 100;
  ck("liquidó al 4,5 % en contra, no en el cierre de la vela",
    casi(caida, 4.5, 0.01), `${caida.toFixed(3)} %`);
  ck("la tabla la marca", await pag.getByText(/LIQUIDADA/).count() > 0);
  await pag.close();
}

console.log("4. EL CONMUTADOR DE COMISIONES cambia los números");
{
  const pag = await abrir({
    mercado: "futuros",
    futuros: { apalancamiento: 5, comision: 0.1, financiamiento: 0, mantenimiento: 0.005 },
  });
  await pag.getByRole("button", { name: /^Comprar$/ }).click();
  await pag.waitForTimeout(500);
  for (let i = 0; i < 4; i++) {
    await pag.getByRole("button", { name: /Una vela adelante/i }).click();
    await pag.waitForTimeout(200);
  }
  await pag.waitForTimeout(600);
  const leerResultado = async () => {
    const t = await pag.locator("text=/^[+−]\\d+\\.\\d+ %$/").first().textContent();
    return Number((t ?? "0").replace("−", "-").replace(" %", ""));
  };
  const conCom = await leerResultado();
  const costos = await texto(pag, /comisión −\$/);
  ck("muestra cuánto se pagó de comisión", /comisión −\$\d/.test(costos), costos);
  ck("y dice que ya está descontado", (await texto(pag, /Ya descontado/)).length > 0);

  await pag.getByLabel(/Con comisiones/i).uncheck();
  await pag.waitForTimeout(700);
  const sinCom = await leerResultado();
  ck(`sin comisiones el resultado MEJORA (${conCom} → ${sinCom})`, sinCom > conCom,
    `${conCom} vs ${sinCom}`);
  ck("y avisa que estás viendo el bruto", (await texto(pag, /estás viendo el bruto/)).length > 0);

  // Y la diferencia tiene que ser la comisión, no un número cualquiera.
  const pagado = Number(costos.match(/−\$([\d.]+)/)?.[1] ?? 0);
  const difPct = (sinCom - conCom) / 100 * 10000;   // de % a dólares
  ck(`la diferencia es exactamente lo pagado (${pagado} ≈ ${difPct.toFixed(2)})`,
    casi(pagado, difPct, 0.5), `${pagado} vs ${difPct.toFixed(2)}`);

  await pag.getByLabel(/Con comisiones/i).check();
  await pag.waitForTimeout(600);
  ck("al volver a encenderlo, vuelve el número de antes",
    casi(await leerResultado(), conCom, 0.01));
  await pag.screenshot({ path: "shots/futuros.png" });
  await pag.close();
}

console.log("5. En SPOT no hay apalancamiento ni liquidación");
{
  const pag = await abrir({ mercado: "spot" });
  ck("no se ofrecen apalancamientos", await pag.getByRole("button", { name: /^Apalancamiento 10x$/ }).count() === 0);
  await pag.getByRole("button", { name: /^Comprar$/ }).click();
  await pag.waitForTimeout(600);
  const o = (await ops(pag))[0];
  const nocional = o.cantidad * o.precioEntrada;
  const libre = Number((await texto(pag, /^libre \$/)).replace(/[^\d.]/g, ""));
  ck("el efectivo libre baja el NOCIONAL COMPLETO",
    casi(libre, 10000 - nocional, 2), `libre ${libre}, nocional ${nocional.toFixed(0)}`);
  await pag.close();
}

await nav.close();
console.log(`\n${fallos.length === 0 ? "TODO BIEN" : `FALLARON ${fallos.length}:\n - ${fallos.join("\n - ")}`}`);
process.exit(fallos.length === 0 ? 0 : 1);
