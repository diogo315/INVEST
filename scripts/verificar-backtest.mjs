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
import { FUTUROS_POR_DEFECTO } from "../src/lib/backtest/futuros.ts";
import {
  CONFIG_BT,
  INDICADORES_BT,
  indicadorPorClave,
  mediasPorDefecto,
  sanearIndicadores,
} from "../src/lib/backtest/indicadores.ts";

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
// Los nombres que de verdad se operan cotizan de 1 en 1 aunque valgan
// 760: SPY no tiene solo 760 y 770, tiene 761, 762, 763…
comprobar("papel barato va de medio en medio", pasoDeStrike(18) === 0.5);
comprobar("un papel de 60 va de 1 en 1", pasoDeStrike(60) === 1);
comprobar("uno de 180 también", pasoDeStrike(180) === 1);
comprobar("y SPY a 763 también", pasoDeStrike(763) === 1);
comprobar("solo por encima de 1000 se abre a 5", pasoDeStrike(1500) === 5);
{
  const s = strikesCerca(100, 3);
  comprobar("devuelve 2n+1 strikes", s.length === 7, String(s.length));
  comprobar("centrado en el precio", s[3] === 100, JSON.stringify(s));
  comprobar("separados por el paso", s[4] - s[3] === pasoDeStrike(100), JSON.stringify(s));
  // Se puede forzar el salto, porque los reales cambian por papel.
  const forzados = strikesCerca(763, 3, 2.5);
  comprobar("se puede forzar el salto", forzados[1] - forzados[0] === 2.5, JSON.stringify(forzados));
  comprobar("y el forzado manda sobre la tabla",
    strikesCerca(763, 3, 10)[1] - strikesCerca(763, 3, 10)[0] === 10);
  const spy = strikesCerca(763.89, 3);
  comprobar("SPY a 763,89 da 761,762,763,764…",
    spy.join() === "761,762,763,764,765,766,767", spy.join());
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
  const anchas = cadenaEn(763, 0, 30 * DIA, 0.3, 4, 0.04, 5);
  comprobar("la cadena acepta el salto forzado",
    anchas[1].strike - anchas[0].strike === 5, String(anchas[1].strike - anchas[0].strike));
  comprobar("y pide las filas que se le digan", anchas.length === 9, String(anchas.length));
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
  // Sin costos: estas comprobaciones son de la contabilidad base, no de
  // comisiones. Los costos tienen su propio archivo (verificar-futuros).
  const sinCostos = (valorar) => ({
    valorar, ahora: 0, cfg: FUTUROS_POR_DEFECTO, conComisiones: false,
  });
  const r = resumir(bt, sinCostos(() => 6)); // el call abierto vale 6 → +400
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
    resumir({ ...bt, operaciones: [] }, sinCostos(() => 0)).pct === 0);
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

console.log("La curva con y sin costos sale de las MISMAS operaciones")
{
  const op = {
    id: "x", instrumento: "activo", lado: "compra", cantidad: 1,
    precioEntrada: 100, tiempoEntrada: 0,
  };
  const b = {
    id: "c", nombre: "costos", simbolo: "BIN:BTCUSDT", temporalidad: "1d",
    desde: 0, capitalInicial: 1000, operaciones: [op], tiempoActual: 86400,
    historiaPrevia: 365, medias: [], indicadores: [], creado: 0,
  };
  const velas = [
    { time: 0, open: 100, high: 100, low: 100, close: 100 },
    { time: 86400, open: 110, high: 110, low: 110, close: 110 },
  ];
  const cfg = { apalancamiento: 1, comision: 0.1, financiamiento: 0, mantenimiento: 0.005 };
  const bruta = curvaDeCapital(b, velas, () => 0.5, cfg, false);
  const neta = curvaDeCapital(b, velas, () => 0.5, cfg, true);
  comprobar("sin costos, el capital sube los 10 enteros",
    bruta.at(-1).value === 1010, String(bruta.at(-1).value));
  // 0,1 % de 100 al abrir + 0,1 % de 110 al valorar = 0,21
  comprobar("con costos, descuenta comisión de entrada y de salida",
    Math.abs(neta.at(-1).value - (1010 - 0.21)) < 0.005, String(neta.at(-1).value));
  comprobar("la diferencia entre las dos es exactamente la comisión",
    Math.abs((bruta.at(-1).value - neta.at(-1).value) - 0.21) < 0.005);
  comprobar("las dos curvas tienen los mismos puntos", bruta.length === neta.length);
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

// ───────────────────────── indicadores ────────────────────────────────
console.log("Indicadores del backtest");
{
  const velas = Array.from({ length: 300 }, (_, i) => {
    const c = 100 + Math.sin(i / 7) * 8 + i * 0.05;
    return { time: i * DIA, open: c * 0.998, high: c * 1.01, low: c * 0.99, close: c, volume: 1000 + i };
  });

  const MEDIAS = mediasPorDefecto();
  comprobar("hay al menos 17 indicadores", INDICADORES_BT.length >= 17, String(INDICADORES_BT.length));
  comprobar("está el Stoch RSI", !!indicadorPorClave("srsi"));
  comprobar("está el Cipher B", !!indicadorPorClave("cipher"));
  comprobar("las claves no se repiten",
    new Set(INDICADORES_BT.map((i) => i.clave)).size === INDICADORES_BT.length);
  comprobar("todos tienen etiqueta legible",
    INDICADORES_BT.every((i) => i.etiqueta && i.etiqueta !== i.clave || ["medias","bb","volumen","rsi","macd"].includes(i.clave)));
  comprobar("todos declaran al menos una serie",
    INDICADORES_BT.every((i) => i.series.length > 0));
  comprobar("hay de los dos tipos",
    INDICADORES_BT.some((i) => i.conPanel) && INDICADORES_BT.some((i) => !i.conPanel));
  comprobar("están los clásicos",
    ["medias", "bb", "volumen", "rsi", "macd"].every((c) => indicadorPorClave(c)));
  comprobar("y los del registro compartido",
    ["supertrend", "sar", "keltner", "obv"].every((c) => indicadorPorClave(c)));

  // Cada indicador calcula sin romperse y devuelve las series que promete.
  for (const ind of INDICADORES_BT) {
    let datos;
    try {
      datos = ind.calcular(velas, CONFIG_BT, MEDIAS);
    } catch (e) {
      comprobar(`${ind.clave} calcula sin reventar`, false, String(e));
      continue;
    }
    const specs = ind.seriesDe ? ind.seriesDe(MEDIAS) : ind.series;
    comprobar(`${ind.clave} devuelve todas sus series`,
      specs.every((sp) => Array.isArray(datos[sp.clave])),
      Object.keys(datos).join(","));
    const valores = Object.values(datos).flat().map((p) => p.value).filter((v) => v !== undefined);
    comprobar(`${ind.clave} no devuelve NaN`, valores.every((v) => Number.isFinite(v)));
  }

  // EL PUNTO CRÍTICO: con menos velas, el resultado de las que sí hay no
  // puede cambiar. Si cambiara, el indicador estaría mirando el futuro.
  const corte = 200;
  for (const ind of INDICADORES_BT) {
    const todo = ind.calcular(velas, CONFIG_BT, MEDIAS);
    const parcial = ind.calcular(velas.slice(0, corte), CONFIG_BT, MEDIAS);
    const hastaCorte = velas[corte - 1].time;
    let iguales = true;
    let detalle = "";
    for (const sp of (ind.seriesDe ? ind.seriesDe(MEDIAS) : ind.series)) {
      // Las líneas de nivel (el 30 y el 70 del RSI, el 50 del Aroon, el
      // cero del AO) se dibujan con dos puntos, de la primera vela a la
      // última: su segundo punto SE MUEVE a propósito al avanzar. No son
      // un cálculo, así que no aplica la prueba.
      const serieCompleta = todo[sp.clave] ?? [];
      if (serieCompleta.length === 2) continue;
      const a = new Map(serieCompleta.map((p) => [p.time, p.value]));
      for (const p of parcial[sp.clave] ?? []) {
        if (p.time > hastaCorte) continue;
        const ref = a.get(p.time);
        if (ref === undefined && p.value === undefined) continue;
        if (ref === undefined || p.value === undefined || Math.abs(ref - p.value) > 1e-9) {
          iguales = false;
          detalle = `${sp.clave} en ${p.time}: ${p.value} vs ${ref}`;
          break;
        }
      }
      if (!iguales) break;
    }
    comprobar(`${ind.clave} NO mira el futuro`, iguales, detalle);
  }

  // ── el Cipher B dibuja lo mismo que en el gráfico principal ──────
  //
  // Diego lo pidió explícito: "que se vea el cipher b como en la gráfica".
  // Acá no se puede mirar el dibujo, pero sí comprobar que están todas las
  // piezas visuales que el gráfico principal pinta, y que las señales caen
  // donde tienen que caer.
  console.log("Cipher B igual al del gráfico");
  {
    const def = indicadorPorClave("cipher");
    const specs = def.series;
    const porClave = new Map(specs.map((s) => [s.clave, s]));
    const datos = def.calcular(velas, CONFIG_BT, MEDIAS);

    // Las cuatro ondas van como área que cruza el cero, no como barras.
    for (const k of ["ola", "wt2", "rapida", "mfi"]) {
      comprobar(`${k} se dibuja como área`, porClave.get(k)?.forma === "area",
        String(porClave.get(k)?.forma));
      comprobar(`${k} trae sus cuatro colores de relleno`,
        !!porClave.get(k)?.area?.arriba?.length && !!porClave.get(k)?.area?.abajo?.length);
    }
    comprobar("la onda rápida es wt1 − wt2",
      datos.rapida.every((p, i) => Math.abs(p.value - (datos.ola[i].value - datos.wt2[i].value)) < 1e-9));
    comprobar("el MFI verde arriba y rojo abajo",
      porClave.get("mfi").area.lineaArriba.startsWith("#3ee145") &&
      porClave.get("mfi").area.lineaAbajo.startsWith("#ff3d2e"));
    comprobar("el RSI va como línea", porClave.get("rsi")?.forma === "linea");
    comprobar("el RSI vive entre 0 y 100",
      datos.rsi.every((p) => p.value >= 0 && p.value <= 100));

    // Los seis niveles de sobrecompra/sobreventa más el cero.
    const niveles = { ob: 53, ob2: 60, ob3: 100, os: -53, os2: -60, os3: -75, cero: 0 };
    for (const [k, v] of Object.entries(niveles)) {
      comprobar(`el nivel ${k} está en ${v}`,
        datos[k].length === 2 && datos[k].every((p) => p.value === v),
        JSON.stringify(datos[k].map((p) => p.value)));
    }

    // Las filas de señal: siempre a ±106, nunca sobre la onda.
    comprobar("la fila de compra siempre a −106",
      datos.filaCompra.every((p) => p.value === -106), String(datos.filaCompra.length));
    comprobar("la fila de venta siempre a +106",
      datos.filaVenta.every((p) => p.value === 106), String(datos.filaVenta.length));
    comprobar("el panel reserva el alto de las filas",
      def.rango.min <= -106 && def.rango.max >= 106,
      JSON.stringify(def.rango));

    // Una señal de compra es un cruce al alza en sobreventa: su punto
    // sobre la onda tiene que estar por debajo del nivel de sobreventa.
    comprobar("las compras caen en sobreventa",
      datos.compra.every((p) => p.value <= CONFIG_BT.wtOsLevel),
      String(datos.compra.length));
    comprobar("las ventas caen en sobrecompra",
      datos.venta.every((p) => p.value >= CONFIG_BT.wtObLevel),
      String(datos.venta.length));
    comprobar("hay señales de los dos lados",
      datos.compra.length > 0 && datos.venta.length > 0,
      `${datos.compra.length} compras / ${datos.venta.length} ventas`);
    // Cada señal fuerte pone su punto en la fila; los cruces sueltos no.
    comprobar("una fila por cada señal",
      datos.filaCompra.length === datos.compra.length &&
      datos.filaVenta.length === datos.venta.length &&
      datos.filaOro.length === datos.oro.length,
      `${datos.filaCompra.length}/${datos.compra.length} · ${datos.filaOro.length}/${datos.oro.length}`);
    // El oro tiene fila PROPIA, dorada y más grande: es la señal que Diego
    // mira y no puede quedar mezclada entre los puntitos verdes.
    const specOro = porClave.get("oro");
    const specFilaOro = porClave.get("filaOro");
    comprobar("el oro se dibuja más grande que los demás puntos",
      (specOro?.radio ?? 0) > 4 && (specFilaOro?.radio ?? 0) > 4,
      `${specOro?.radio} / ${specFilaOro?.radio}`);
    comprobar("y en dorado", specOro?.color === "#e2a400" && specFilaOro?.color === "#e2a400");
    comprobar("el oro se dibuja al final, encima de todo",
      specs.at(-1).clave === "filaOro" && specs.at(-2).clave === "oro",
      `${specs.at(-2)?.clave}, ${specs.at(-1)?.clave}`);
    comprobar("los cruces sueltos no ensucian las filas",
      datos.cruceArriba.every((p) => Math.abs(p.value) < 106) &&
      datos.cruceAbajo.every((p) => Math.abs(p.value) < 106));
    // Ninguna señal puede estar en dos listas a la vez.
    const tiempos = [...datos.compra, ...datos.venta, ...datos.oro,
                     ...datos.cruceArriba, ...datos.cruceAbajo].map((p) => p.time);
    comprobar("ninguna señal se repite en dos listas",
      new Set(tiempos).size === tiempos.length,
      `${new Set(tiempos).size} de ${tiempos.length}`);

    // La serie limpia de arriba es tan prolija que TODO cruce es extremo:
    // la rama de los cruces sueltos nunca se ejecutaba. Con ruido sí, que
    // es lo que se ve en el gráfico de verdad (los puntitos chicos).
    let semilla = 7;
    const ruido = () => ((semilla = (semilla * 9301 + 49297) % 233280) / 233280 - 0.5);
    const conRuido = Array.from({ length: 300 }, (_, i) => {
      const c = 100 + Math.sin(i / 7) * 8 + i * 0.05 + ruido() * 6;
      return { time: i * DIA, open: c, high: c * 1.01, low: c * 0.99, close: c, volume: 1000 + i };
    });
    const dr = def.calcular(conRuido, CONFIG_BT, MEDIAS);
    comprobar("con ruido también aparecen los cruces sueltos",
      dr.cruceArriba.length > 0 && dr.cruceAbajo.length > 0,
      `${dr.cruceArriba.length} / ${dr.cruceAbajo.length}`);
    comprobar("un cruce suelto nunca es una señal extrema",
      dr.cruceArriba.every((p) => p.value > CONFIG_BT.wtOsLevel) &&
      dr.cruceAbajo.every((p) => p.value < CONFIG_BT.wtObLevel));

    // El punto de oro: cruce al alza desde el fondo con el RSI hundido.
    // Hace falta un derrumbe de verdad para que salga.
    const derrumbe = Array.from({ length: 220 }, (_, i) => {
      const c = i < 120 ? 100 + Math.sin(i / 9) * 2
        : i < 160 ? 100 - (i - 120) * 1.6
        : 36 + (i - 160) * 1.4;
      return { time: i * DIA, open: c, high: c * 1.005, low: c * 0.995, close: c, volume: 1000 };
    });
    const dd = def.calcular(derrumbe, CONFIG_BT, MEDIAS);
    comprobar("tras un derrumbe sale el punto de oro", dd.oro.length > 0, String(dd.oro.length));
    comprobar("el punto de oro sale del fondo",
      dd.oro.every((p) => p.value <= CONFIG_BT.wtOsLevel),
      JSON.stringify(dd.oro.map((p) => p.value)));
    comprobar("el oro pone su propia fila, aparte de la verde",
      dd.filaOro.length === dd.oro.length && dd.filaCompra.length === dd.compra.length,
      `oro ${dd.filaOro.length}/${dd.oro.length}, compra ${dd.filaCompra.length}/${dd.compra.length}`);
    comprobar("la fila de oro va a la altura de abajo",
      dd.filaOro.every((p) => p.value === -106), JSON.stringify(dd.filaOro.map((p) => p.value)));
  }

    // ── medias configurables ────────────────────────────────────────
  console.log("Medias móviles configurables");
  {
    const def = indicadorPorClave("medias");
    comprobar("las medias son editables", def.editable === true);
    comprobar("arma sus series desde la lista", typeof def.seriesDe === "function");
    comprobar("una línea por media visible", def.seriesDe(MEDIAS).length === 3, String(def.seriesDe(MEDIAS).length));
    comprobar("una media oculta no dibuja línea",
      def.seriesDe(MEDIAS.map((m, i) => (i === 0 ? { ...m, visible: false } : m))).length === 2);
    comprobar("cada línea usa el color de su media",
      def.seriesDe(MEDIAS)[0].color === MEDIAS[0].color);
    comprobar("y su grosor", def.seriesDe(MEDIAS)[2].grosor === 2);

    // El período manda de verdad: cambiarlo cambia el número.
    const corta = [{ ...MEDIAS[0], periodo: 5 }];
    const larga = [{ ...MEDIAS[0], periodo: 100 }];
    const a = def.calcular(velas, CONFIG_BT, corta)[MEDIAS[0].id];
    const b = def.calcular(velas, CONFIG_BT, larga)[MEDIAS[0].id];
    comprobar("un período corto da más puntos que uno largo", a.length > b.length,
      `${a.length} vs ${b.length}`);
    comprobar("y valores distintos", a.at(-1).value !== b.at(-1).value);

    // El tipo también.
    const sma = def.calcular(velas, CONFIG_BT, [{ ...MEDIAS[0], tipo: "MA", periodo: 20 }]);
    const ema = def.calcular(velas, CONFIG_BT, [{ ...MEDIAS[0], tipo: "EMA", periodo: 20 }]);
    comprobar("SMA y EMA del mismo período no coinciden",
      sma[MEDIAS[0].id].at(-1).value !== ema[MEDIAS[0].id].at(-1).value);
    comprobar("una lista vacía no rompe",
      Object.keys(def.calcular(velas, CONFIG_BT, [])).length === 0);
  }

  console.log("Saneo de indicadores");
  comprobar("null da lista vacía", sanearIndicadores(null).length === 0);
  comprobar("tira claves inventadas", sanearIndicadores(["rsi", "nada"]).join() === "rsi");
  comprobar("quita repetidos", sanearIndicadores(["rsi", "rsi"]).length === 1);
  comprobar("corta en ocho", sanearIndicadores(INDICADORES_BT.map((i) => i.clave)).length === 8);
  comprobar("el backtest saneado trae la lista",
    Array.isArray(sanearBacktests([{ id: "x", simbolo: "A", operaciones: [], indicadores: ["rsi"] }])[0].indicadores));
  comprobar("y medias, aunque no estuvieran guardadas",
    sanearBacktests([{ id: "x", simbolo: "A", operaciones: [] }])[0].medias.length === 3);
  comprobar("respeta las medias guardadas",
    sanearBacktests([{ id: "x", simbolo: "A", operaciones: [],
      medias: [{ id: "a", tipo: "EMA", periodo: 9, color: "#fff", grosor: 1, visible: true }] }])[0].medias[0].periodo === 9);
}

console.log(`\n${ok} bien, ${mal} mal`);
process.exit(mal === 0 ? 0 : 1);
