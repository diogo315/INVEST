/**
 * Pruebas del backtesting: la cadena reconstruida y la contabilidad.
 *   node --experimental-strip-types scripts/verificar-backtest.mjs
 */
import {
  MULTIPLICADOR,
  cadenaEn,
  indiceHasta,
  pasoDeStrike,
  precioContrato,
  strikesCerca,
  tercerViernes,
  vencimientosDesde,
  volRealizada,
} from "../src/lib/backtest/cadena.ts";
import {
  caidaMaxima,
  costoApertura,
  curvaDeCapital,
  estaAbierta,
  nombreLibre,
  precioDe,
  resultadoA,
  resultadoFinal,
  resumir,
  sanearBacktests,
  unidades,
} from "../src/lib/backtest/tipos.ts";

let ok = 0;
let mal = 0;
const comprobar = (n, c, d = "") => {
  if (c) ok++;
  else {
    mal++;
    console.log(`  FALLA: ${n}${d ? ` — ${d}` : ""}`);
  }
};
const cerca = (a, b, tol = 0.01) => Math.abs(a - b) <= tol;
const DIA = 86400;

// ───────────────────────── strikes y vencimientos ──────────────────────
console.log("Strikes");
comprobar("papel barato va de 1 en 1", pasoDeStrike(18) === 1);
comprobar("papel medio va de 2,5", pasoDeStrike(60) === 2.5);
comprobar("papel caro va de 5", pasoDeStrike(180) === 5);
comprobar("papel muy caro va de 10", pasoDeStrike(600) === 10);
{
  const s = strikesCerca(100, 3);
  comprobar("devuelve 2n+1 strikes", s.length === 7, String(s.length));
  comprobar("centrado en el precio", s[3] === 100, JSON.stringify(s));
  // A 100 exactos el paso ya es de 5: el tramo de 2,5 es por debajo de 100.
  comprobar("separados por el paso", s[4] - s[3] === pasoDeStrike(100), JSON.stringify(s));
  comprobar("por debajo de 100 el paso es 2,5", strikesCerca(60, 1)[1] - strikesCerca(60, 1)[0] === 2.5);
  comprobar("ordenados de menor a mayor", s.every((v, i) => i === 0 || v > s[i - 1]));
  comprobar("nunca hay strike negativo", strikesCerca(2, 8).every((v) => v > 0));
}

console.log("Vencimientos");
{
  // Miércoles 15 de enero de 2025.
  const miercoles = Math.floor(Date.UTC(2025, 0, 15, 15, 0, 0) / 1000);
  const v = vencimientosDesde(miercoles, 6);
  comprobar("devuelve los que se piden", v.length === 6, String(v.length));
  comprobar("todos son posteriores", v.every((t) => t > miercoles));
  comprobar("todos caen en viernes", v.every((t) => new Date(t * 1000).getUTCDay() === 5),
    JSON.stringify(v.map((t) => new Date(t * 1000).toISOString().slice(0, 10))));
  comprobar("van en orden", v.every((t, i) => i === 0 || t > v[i - 1]));
  comprobar("el primero es el viernes siguiente",
    new Date(v[0] * 1000).toISOString().slice(0, 10) === "2025-01-17",
    new Date(v[0] * 1000).toISOString());
  comprobar("los cuatro primeros son semanales",
    v[1] - v[0] === 7 * DIA && v[2] - v[1] === 7 * DIA && v[3] - v[2] === 7 * DIA);
}
comprobar("tercer viernes de enero 2025 es el 17",
  new Date(tercerViernes(2025, 0) * 1000).toISOString().slice(0, 10) === "2025-01-17",
  new Date(tercerViernes(2025, 0) * 1000).toISOString());
comprobar("tercer viernes de junio 2024 es el 21",
  new Date(tercerViernes(2024, 5) * 1000).toISOString().slice(0, 10) === "2024-06-21");
comprobar("un viernes no se devuelve a sí mismo",
  vencimientosDesde(tercerViernes(2025, 0), 1)[0] > tercerViernes(2025, 0));

// ───────────────────────── volatilidad ─────────────────────────────────
console.log("Volatilidad realizada");
{
  const quieto = Array.from({ length: 60 }, (_, i) => ({ time: i * DIA, close: 100 }));
  comprobar("un papel quieto no da cero", volRealizada(quieto, 59 * DIA) >= 0.05);
  const movido = Array.from({ length: 60 }, (_, i) => ({
    time: i * DIA,
    close: 100 * Math.exp(((i % 2 === 0 ? 1 : -1) * 0.02 * i) / 10),
  }));
  const v = volRealizada(movido, 59 * DIA);
  comprobar("un papel movido da más que uno quieto", v > volRealizada(quieto, 59 * DIA));
  comprobar("nunca pasa de 300 %", v <= 3, String(v));
  comprobar("con pocas velas cae a un valor razonable",
    volRealizada([{ time: 0, close: 100 }], 0) === 0.3);
}
console.log("indiceHasta");
{
  const v = Array.from({ length: 10 }, (_, i) => ({ time: i * DIA, close: 100 }));
  comprobar("encuentra el exacto", indiceHasta(v, 5 * DIA) === 5);
  comprobar("cae al anterior si está en medio", indiceHasta(v, 5 * DIA + 100) === 5);
  comprobar("antes del principio da 0", indiceHasta(v, -DIA) === 0);
  comprobar("después del final da el último", indiceHasta(v, 99 * DIA) === 9);
}

// ───────────────────────── precio de contratos ─────────────────────────
console.log("Precio de contratos");
{
  const hoy = 0;
  const vence = 30 * DIA;
  const call = precioContrato(100, 100, "call", hoy, vence, 0.3);
  const put = precioContrato(100, 100, "put", hoy, vence, 0.3);
  comprobar("un call al dinero vale algo", call.prima > 2 && call.prima < 6, String(call.prima));
  comprobar("su delta ronda 0,5", cerca(call.delta, 0.53, 0.06), String(call.delta));
  comprobar("el put al dinero tiene delta negativo", put.delta < 0, String(put.delta));
  comprobar("cuenta bien los días", call.dias === 30, String(call.dias));
  const lejos = precioContrato(100, 130, "call", hoy, vence, 0.3);
  comprobar("un call muy fuera vale menos", lejos.prima < call.prima);
  comprobar("y tiene delta más chico", lejos.delta < call.delta);
  const masPlazo = precioContrato(100, 100, "call", hoy, 90 * DIA, 0.3);
  comprobar("más plazo vale más", masPlazo.prima > call.prima);
  const masVol = precioContrato(100, 100, "call", hoy, vence, 0.6);
  comprobar("más volatilidad vale más", masVol.prima > call.prima);
  // Al vencimiento solo queda el intrínseco.
  const vencido = precioContrato(115, 100, "call", vence, vence, 0.3);
  comprobar("vencido dentro del dinero vale el intrínseco", cerca(vencido.prima, 15, 0.02), String(vencido.prima));
  const vencidoFuera = precioContrato(90, 100, "call", vence, vence, 0.3);
  comprobar("vencido fuera del dinero no vale nada", vencidoFuera.prima <= 0.01, String(vencidoFuera.prima));
  comprobar("nunca devuelve precio negativo",
    precioContrato(1, 500, "call", hoy, vence, 0.3).prima > 0);
  // Paridad put-call: C - P = S - K·e^(-rT)
  const T = 30 / 365;
  comprobar("se cumple la paridad put-call",
    cerca(call.prima - put.prima, 100 - 100 * Math.exp(-0.04 * T), 0.02),
    `${call.prima - put.prima}`);
}
console.log("Cadena completa");
{
  const c = cadenaEn(100, 0, 30 * DIA, 0.3, 5);
  comprobar("una fila por strike", c.length === 11, String(c.length));
  comprobar("cada fila trae call y put", c.every((f) => f.call && f.put));
  comprobar("los calls bajan de precio al subir el strike",
    c.every((f, i) => i === 0 || f.call.prima <= c[i - 1].call.prima));
  comprobar("los puts suben de precio al subir el strike",
    c.every((f, i) => i === 0 || f.put.prima >= c[i - 1].put.prima));
  comprobar("el strike de la fila coincide con el del contrato",
    c.every((f) => f.call.strike === f.strike && f.put.strike === f.strike));
}

// ───────────────────────── contabilidad ────────────────────────────────
console.log("Unidades y costo");
const accion = {
  id: "a", instrumento: "activo", lado: "compra", cantidad: 10,
  precioEntrada: 50, tiempoEntrada: 0,
};
const callComprado = {
  id: "c", instrumento: "call", lado: "compra", cantidad: 2,
  precioEntrada: 4, tiempoEntrada: 0, strike: 100, vencimiento: 30 * DIA, volEntrada: 0.3,
};
comprobar("10 acciones son 10 unidades", unidades(accion) === 10);
comprobar("2 contratos son 200 unidades", unidades(callComprado) === 200, String(unidades(callComprado)));
comprobar("el multiplicador es 100", MULTIPLICADOR === 100);
comprobar("10 acciones a 50 cuestan 500", costoApertura(accion) === 500);
comprobar("2 calls a 4 cuestan 800", costoApertura(callComprado) === 800);

console.log("Resultado");
comprobar("acción comprada gana si sube", resultadoA(accion, 55) === 50);
comprobar("acción comprada pierde si baja", resultadoA(accion, 45) === -50);
{
  const corto = { ...accion, lado: "venta" };
  comprobar("acción vendida gana si baja", resultadoA(corto, 45) === 50);
  comprobar("acción vendida pierde si sube", resultadoA(corto, 55) === -50);
}
comprobar("call comprado: la prima se multiplica por 100", resultadoA(callComprado, 6) === 400);
{
  const vendido = { ...callComprado, lado: "venta" };
  comprobar("call vendido gana si la prima cae", resultadoA(vendido, 1) === 600);
}
comprobar("abierta mientras no haya salida", estaAbierta(accion));
comprobar("sin salida no hay resultado final", resultadoFinal(accion) === null);
comprobar("con salida sí lo hay", resultadoFinal({ ...accion, precioSalida: 55 }) === 50);

console.log("Valorar una posición");
{
  // Una opción se revalora con la MISMA fórmula que la vendió.
  const p = precioDe(callComprado, 100, 0, 0.3);
  const directo = precioContrato(100, 100, "call", 0, 30 * DIA, 0.3).prima;
  comprobar("opción: coincide con la cadena", p === directo, `${p} vs ${directo}`);
  comprobar("activo: es el precio del activo", precioDe(accion, 77, 0, 0.3) === 77);
  const trasVencer = precioDe(callComprado, 120, 40 * DIA, 0.3);
  comprobar("pasado el vencimiento solo queda el intrínseco", cerca(trasVencer, 20, 0.02), String(trasVencer));
}

console.log("Resumen");
{
  const bt = {
    id: "b", nombre: "t", simbolo: "ALP:AAPL", temporalidad: "1d",
    desde: 0, capitalInicial: 10000, tiempoActual: 0, creado: 0,
    operaciones: [
      { ...accion, precioSalida: 55, tiempoSalida: DIA },       // +50 cerrada
      { ...callComprado },                                       // abierta
      { id: "d", instrumento: "activo", lado: "compra", cantidad: 5,
        precioEntrada: 20, tiempoEntrada: 0, precioSalida: 18, tiempoSalida: DIA }, // -10
    ],
  };
  const r = resumir(bt, () => 6); // el call abierto vale 6 → +400
  comprobar("cuenta todas las operaciones", r.operaciones === 3);
  comprobar("cuenta las abiertas", r.abiertas === 1);
  comprobar("suma lo realizado", r.realizado === 40, String(r.realizado));
  comprobar("suma lo abierto", r.abierto === 400, String(r.abierto));
  comprobar("capital = inicial + realizado + abierto", r.capital === 10440, String(r.capital));
  comprobar("el porcentaje sale del capital inicial", cerca(r.pct, 4.4, 0.001), String(r.pct));
  comprobar("expuesto es el costo de lo abierto", r.expuesto === 800, String(r.expuesto));
  comprobar("efectivo = inicial + realizado − expuesto", r.efectivo === 9240, String(r.efectivo));
  comprobar("cuenta ganadoras", r.ganadoras === 1, String(r.ganadoras));
  comprobar("cuenta perdedoras", r.perdedoras === 1, String(r.perdedoras));
  comprobar("sin operaciones el resultado es cero",
    resumir({ ...bt, operaciones: [] }, () => 0).pct === 0);
}

console.log("Caída máxima");
comprobar("una curva que solo sube no cae", caidaMaxima([100, 110, 120]) === 0);
comprobar("mide la caída desde el pico", cerca(caidaMaxima([100, 120, 90]), 25, 0.01), String(caidaMaxima([100, 120, 90])));
comprobar("se queda con la peor", cerca(caidaMaxima([100, 120, 90, 130, 117]), 25, 0.01));
comprobar("curva vacía da cero", caidaMaxima([]) === 0);

console.log("Curva de capital");
{
  const velas = Array.from({ length: 5 }, (_, i) => ({ time: i * DIA, close: 50 + i }));
  const bt = {
    id: "b", nombre: "t", simbolo: "X", temporalidad: "1d", desde: 0,
    capitalInicial: 1000, tiempoActual: 0, creado: 0,
    operaciones: [{ id: "a", instrumento: "activo", lado: "compra", cantidad: 10, precioEntrada: 50, tiempoEntrada: 0 }],
  };
  const c = curvaDeCapital(bt, velas, () => 0.3);
  comprobar("un punto por vela", c.length === 5, String(c.length));
  comprobar("arranca en el capital inicial", c[0].value === 1000, String(c[0].value));
  comprobar("sube con el precio", c[4].value === 1040, String(c[4].value));
  const cerrada = {
    ...bt,
    operaciones: [{ ...bt.operaciones[0], precioSalida: 52, tiempoSalida: 2 * DIA }],
  };
  const c2 = curvaDeCapital(cerrada, velas, () => 0.3);
  comprobar("tras cerrar, la curva se queda quieta",
    c2[2].value === 1020 && c2[4].value === 1020, JSON.stringify(c2.map((p) => p.value)));
  comprobar("antes de abrir no cuenta",
    curvaDeCapital({ ...bt, operaciones: [{ ...bt.operaciones[0], tiempoEntrada: 3 * DIA }] }, velas, () => 0.3)[0].value === 1000);
}

console.log("Nombres y saneo");
comprobar("nombre libre se respeta", nombreLibre(["a"], "b") === "b");
comprobar("nombre repetido se numera", nombreLibre(["Backtest"], "Backtest") === "Backtest (2)");
comprobar("ignora mayúsculas", nombreLibre(["backtest"], "Backtest") === "Backtest (2)");
comprobar("null da lista vacía", sanearBacktests(null).length === 0);
comprobar("tira lo que no tiene forma", sanearBacktests([{ foo: 1 }]).length === 0);
{
  const s = sanearBacktests([
    { id: "x", simbolo: "ALP:AAPL", operaciones: [{ id: "o", precioEntrada: 1, cantidad: 1 }, { basura: true }] },
  ]);
  comprobar("conserva el que sí la tiene", s.length === 1);
  comprobar("rellena lo que falta", s[0].capitalInicial === 10000 && s[0].nombre === "Backtest");
  comprobar("filtra operaciones rotas", s[0].operaciones.length === 1, String(s[0].operaciones.length));
}

console.log(`\n${ok} bien, ${mal} mal`);
process.exit(mal === 0 ? 0 : 1);
