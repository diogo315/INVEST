/**
 * Los campos numéricos con conversión.
 *
 * El error que esto cubre: el monto en dólares se recalculaba a partir
 * del valor convertido en CADA TECLA. Escribir «1» daba 0,00001 BTC y
 * el campo se repintaba con «0,89» antes del segundo dígito, así que
 * «100» era imposible de escribir y borrar tampoco se podía.
 *
 * Por eso se teclea de a una letra (`pressSequentially`) y no con
 * `fill`: `fill` escribe todo de golpe y NO habría detectado el bug.
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
const PRECIO = 88637.03;
function velas(tfSeg, finSeg, limite) {
  const out = [];
  const ultimo = Math.floor(Math.min(finSeg, HOY) / tfSeg) * tfSeg;
  for (let i = limite - 1; i >= 0; i--) {
    const t = ultimo - i * tfSeg;
    if (t < INICIO) continue;
    out.push([t * 1000, String(PRECIO), String(PRECIO * 1.002), String(PRECIO * 0.998),
      String(PRECIO), "1000", (t + tfSeg) * 1000 - 1, "0", 0, "0", "0", "0"]);
  }
  return out;
}

const DESDE = Math.floor(Date.UTC(2026, 0, 1) / 1000);
const estado = {
  state: {
    backtests: [{
      id: "p1", nombre: "Prueba", simbolo: "BIN:BTCUSDT", temporalidad: "1d",
      desde: DESDE, capitalInicial: 5000, operaciones: [], tiempoActual: DESDE,
      historiaPrevia: 365, medias: [], indicadores: [], zonaHoraria: "UTC", creado: INICIO,
    }],
    activoId: "p1",
    borrador: { simbolo: "BIN:BTCUSDT", desde: "", temporalidad: "1d", capital: 5000, historia: 365 },
  },
  version: 0,
};

const navegador = await chromium.launch();
const pag = await navegador.newPage({ viewport: { width: 1600, height: 950 } });
pag.on("pageerror", (e) => fallos.push(`error de página: ${e.message}`));
await pag.route("**/api.binance.com/**", (ruta) => {
  const u = new URL(ruta.request().url());
  if (!u.pathname.includes("/klines")) {
    return ruta.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  }
  const tf = u.searchParams.get("interval");
  const limite = Number(u.searchParams.get("limit") || 500);
  const end = u.searchParams.get("endTime");
  return ruta.fulfill({ status: 200, contentType: "application/json",
    body: JSON.stringify(velas(TF[tf], end ? Number(end) / 1000 : HOY, limite)) });
});
await pag.addInitScript((v) => localStorage.setItem("tv-gratis-backtest", v), JSON.stringify(estado));
await pag.goto(`${BASE}/backtesting`, { waitUntil: "networkidle" });
await pag.waitForTimeout(2400);

const campo = () => pag.getByLabel(/^(Monto en dólares|Cantidad)$/);

console.log("EL BUG: escribir 100 en dólares, tecla por tecla");
{
  await pag.getByRole("button", { name: /^USD$/ }).click();
  await pag.waitForTimeout(400);
  await campo().click();
  await pag.keyboard.press("Control+a");
  await pag.keyboard.press("Delete");
  await campo().pressSequentially("100", { delay: 120 });
  const visto = await campo().inputValue();
  ck("el campo dice exactamente «100»", visto === "100", `dice «${visto}»`);
}

console.log("Y 1000 también");
{
  await campo().click();
  await pag.keyboard.press("Control+a");
  await pag.keyboard.press("Delete");
  await campo().pressSequentially("1000", { delay: 120 });
  ck("el campo dice «1000»", (await campo().inputValue()) === "1000",
    `dice «${await campo().inputValue()}»`);
}

console.log("Se puede borrar");
{
  await campo().click();
  await pag.keyboard.press("Control+a");
  await pag.keyboard.press("Delete");
  const vacio = await campo().inputValue();
  ck("el campo queda VACÍO (antes se repintaba solo)", vacio === "", `dice «${vacio}»`);
  // Y borrando de a un carácter tampoco se repinta.
  await campo().pressSequentially("250", { delay: 100 });
  await pag.keyboard.press("Backspace");
  ck("borrar un carácter deja «25»", (await campo().inputValue()) === "25",
    `dice «${await campo().inputValue()}»`);
}

console.log("Al salir del campo, muestra lo que realmente quedó guardado");
{
  await campo().click();
  await pag.keyboard.press("Control+a");
  await pag.keyboard.press("Delete");
  await campo().pressSequentially("500", { delay: 80 });
  await pag.keyboard.press("Enter");
  await pag.waitForTimeout(500);
  const tras = Number((await campo().inputValue()).replace(",", "."));
  ck("al confirmar queda ~500 (redondeado al salto del activo)",
    Math.abs(tras - 500) < 2, `dice «${await campo().inputValue()}»`);
  // Y la conversión a BTC es la correcta.
  const btc = await pag.getByText(/BTC$/).first().textContent();
  ck("y muestra el equivalente en BTC", /0\.0/.test(btc ?? ""), String(btc));
}

console.log("Lo mismo en modo BTC: se puede escribir una fracción entera");
{
  await pag.getByRole("button", { name: /^BTC$/ }).click();
  await pag.waitForTimeout(400);
  await campo().click();
  await pag.keyboard.press("Control+a");
  await pag.keyboard.press("Delete");
  await campo().pressSequentially("0.025", { delay: 100 });
  ck("el campo dice «0.025»", (await campo().inputValue()) === "0.025",
    `dice «${await campo().inputValue()}»`);
  await pag.keyboard.press("Enter");
  await pag.waitForTimeout(400);
  await pag.getByRole("button", { name: /^Comprar$/ }).click();
  await pag.waitForTimeout(600);
  const op = (await pag.evaluate(() =>
    JSON.parse(localStorage.getItem("tv-gratis-backtest")).state.backtests[0].operaciones))[0];
  ck("y se opera esa cantidad exacta", Math.abs(op.cantidad - 0.025) < 1e-9, String(op?.cantidad));
}

console.log("La coma como separador decimal (teclado en español)");
{
  await campo().click();
  await pag.keyboard.press("Control+a");
  await pag.keyboard.press("Delete");
  await campo().pressSequentially("0,05", { delay: 100 });
  ck("deja escribir «0,05»", (await campo().inputValue()) === "0,05",
    `dice «${await campo().inputValue()}»`);
  await pag.keyboard.press("Enter");
  await pag.waitForTimeout(400);
  const v = Number((await campo().inputValue()).replace(",", "."));
  ck("y lo entiende como 0,05", Math.abs(v - 0.05) < 1e-9, `dice «${await campo().inputValue()}»`);
}

console.log("Stop y objetivo: también se pueden escribir y borrar");
{
  await pag.getByLabel(/Stop y objetivo/i).first().check();
  await pag.waitForTimeout(500);
  const sl = pag.getByLabel(/^Stop loss$/);
  await sl.click();
  await pag.keyboard.press("Control+a");
  await pag.keyboard.press("Delete");
  ck("el stop se puede vaciar", (await sl.inputValue()) === "", `dice «${await sl.inputValue()}»`);
  await sl.pressSequentially("87500", { delay: 60 });
  ck("y se puede escribir 87500", (await sl.inputValue()) === "87500",
    `dice «${await sl.inputValue()}»`);
}

await pag.screenshot({ path: "shots/campos.png" });
await navegador.close();
console.log(`\n${fallos.length === 0 ? "TODO BIEN" : `FALLARON ${fallos.length}:\n - ${fallos.join("\n - ")}`}`);
process.exit(fallos.length === 0 ? 0 : 1);
