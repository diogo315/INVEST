/**
 * Las señales del Cipher B y el freno del reproductor.
 *
 *   node --experimental-strip-types --import ./scripts/alias.mjs \
 *     scripts/verificar-senales.mjs
 *
 * Dos cosas se cuidan acá:
 *
 * 1. QUE NO MIRE EL FUTURO. El reproductor calcula las señales sobre la
 *    serie completa una sola vez, por velocidad. Eso solo vale si la
 *    señal de una vela sale igual con los datos posteriores que sin
 *    ellos. Si algún día alguien mete una media centrada o un pivote con
 *    desplazamiento, esto se cae y hay que enterarse acá, no en marcha.
 *
 * 2. QUE EL PUNTO Y LA PAUSA SEAN LO MISMO. El indicador dibuja el punto
 *    y el reproductor frena; los dos leen de `senalesCipher`. La prueba
 *    compara las dos listas vela por vela.
 */
import {
  NOMBRE_SENAL,
  senalesCipher,
  tiemposDe,
} from "../src/lib/backtest/senales.ts";
import { CONFIG_BT, indicadorPorClave } from "../src/lib/backtest/indicadores.ts";
import { mediasPorDefecto } from "../src/lib/chart/medias.ts";

let bien = 0;
const malos = [];
const comprobar = (n, c, d = "") => {
  if (c) bien++;
  else {
    malos.push(n);
    console.log(`  MAL ${n}${d ? ` — ${d}` : ""}`);
  }
};

const DIA = 86400;

/** Lateral, derrumbe y rebote: es donde el Cipher B da puntos de oro. */
function serieConDerrumbe(n = 260) {
  return Array.from({ length: n }, (_, i) => {
    const c =
      i < 120 ? 100 + Math.sin(i / 9) * 2
      : i < 160 ? 100 - (i - 120) * 1.6
      : 36 + (i - 160) * 1.4;
    return { time: i * DIA, open: c, high: c * 1.005, low: c * 0.995, close: c, volume: 1000 };
  });
}

/** Serie con ruido: da de los otros tipos de señal. */
function serieConRuido(n = 320) {
  let s = 99;
  const r = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648 - 0.5);
  return Array.from({ length: n }, (_, i) => {
    const c = 100 + Math.sin(i / 7) * 9 + i * 0.04 + r() * 6;
    return { time: i * DIA, open: c, high: c * 1.01, low: c * 0.99, close: c, volume: 1000 + i };
  });
}

const derrumbe = serieConDerrumbe();
const ruidosa = serieConRuido();

// ── salen señales, y de todos los tipos ─────────────────────────────
console.log("Las señales salen");
{
  const sd = senalesCipher(derrumbe, CONFIG_BT);
  const sr = senalesCipher(ruidosa, CONFIG_BT);
  const oro = sd.filter((x) => x.tipo === "oro");
  comprobar("tras un derrumbe hay punto de oro", oro.length > 0, String(oro.length));
  comprobar("el oro sale pocas veces (si saliera siempre no serviría de señal)",
    oro.length <= 3, String(oro.length));
  comprobar("el oro sale del fondo",
    oro.every((x) => x.valor <= CONFIG_BT.wtOsLevel),
    JSON.stringify(oro.map((x) => x.valor.toFixed(1))));
  for (const t of ["compra", "venta", "cruceArriba", "cruceAbajo"]) {
    comprobar(`con ruido aparecen señales de tipo ${t}`,
      sr.some((x) => x.tipo === t), String(sr.filter((x) => x.tipo === t).length));
  }
  comprobar("cada señal cae en una vela de la serie",
    sd.every((x) => derrumbe.some((v) => v.time === x.time)));
  comprobar("no hay dos señales en la misma vela",
    new Set(sd.map((x) => x.time)).size === sd.length,
    `${new Set(sd.map((x) => x.time)).size} de ${sd.length}`);
  comprobar("van en orden de tiempo",
    sd.every((x, i) => i === 0 || x.time > sd[i - 1].time));
  comprobar("todos los tipos tienen nombre",
    sr.every((x) => typeof NOMBRE_SENAL[x.tipo] === "string" && NOMBRE_SENAL[x.tipo]));
  comprobar("ningún valor es NaN", sd.every((x) => Number.isFinite(x.valor)));
}

// ── LA PRUEBA 1: no mira el futuro ──────────────────────────────────
console.log("Calcular con la serie entera da lo mismo que con lo vivido");
{
  // Esto es lo que justifica que el reproductor calcule una sola vez
  // sobre toda la serie en vez de recalcular en cada vela.
  for (const [nombre, serie] of [["derrumbe", derrumbe], ["ruidosa", ruidosa]]) {
    const completa = senalesCipher(serie, CONFIG_BT);
    let desvios = 0;
    let detalle = "";
    for (let corte = 60; corte < serie.length; corte += 13) {
      const parcial = senalesCipher(serie.slice(0, corte), CONFIG_BT);
      const hasta = serie[corte - 1].time;
      const esperadas = completa.filter((x) => x.time <= hasta);
      if (JSON.stringify(esperadas) !== JSON.stringify(parcial)) {
        desvios++;
        if (!detalle) {
          detalle = `corte ${corte}: ${parcial.length} vs ${esperadas.length}`;
        }
      }
    }
    comprobar(`${nombre}: ningún corte cambia las señales anteriores`,
      desvios === 0, detalle);
  }
}

// ── LA PRUEBA 2: el punto y la pausa son lo mismo ───────────────────
console.log("El punto dibujado y el freno salen de la misma lista");
{
  const def = indicadorPorClave("cipher");
  for (const [nombre, serie] of [["derrumbe", derrumbe], ["ruidosa", ruidosa]]) {
    const datos = def.calcular(serie, CONFIG_BT, mediasPorDefecto());
    const senales = senalesCipher(serie, CONFIG_BT);
    const oroDibujado = datos.oro.map((p) => p.time).sort((a, b) => a - b);
    const oroFreno = [...tiemposDe(senales, "oro")].sort((a, b) => a - b);
    comprobar(`${nombre}: los puntos de oro dibujados son exactamente los del freno`,
      JSON.stringify(oroDibujado) === JSON.stringify(oroFreno),
      `${oroDibujado.length} dibujados vs ${oroFreno.length} del freno`);
    comprobar(`${nombre}: la fila dorada acompaña a cada punto de oro`,
      JSON.stringify(datos.filaOro.map((p) => p.time)) === JSON.stringify(oroDibujado));
    // Y los demás tipos también, para que nadie los desincronice después.
    for (const t of ["compra", "venta", "cruceArriba", "cruceAbajo"]) {
      comprobar(`${nombre}: ${t} coincide entre el dibujo y la lista`,
        JSON.stringify(datos[t].map((p) => p.time)) ===
          JSON.stringify([...tiemposDe(senales, t)].sort((a, b) => a - b)));
    }
  }
}

// ── tiemposDe ───────────────────────────────────────────────────────
console.log("tiemposDe");
{
  const s = senalesCipher(derrumbe, CONFIG_BT);
  const oro = tiemposDe(s, "oro");
  comprobar("devuelve un Set que se puede preguntar por fecha",
    oro instanceof Set && [...oro].every((t) => typeof t === "number"));
  comprobar("tiene tantos como señales de ese tipo",
    oro.size === s.filter((x) => x.tipo === "oro").length);
  comprobar("un tipo que no salió devuelve vacío",
    tiemposDe([], "oro").size === 0);
  // Lo que el reproductor pregunta de verdad.
  const alguno = [...oro][0];
  comprobar("la vela del oro responde que sí", oro.has(alguno));
  comprobar("la de al lado responde que no", !oro.has(alguno + DIA) || oro.size > 1);
}

// ── bordes ──────────────────────────────────────────────────────────
console.log("Bordes");
{
  comprobar("sin velas no explota", senalesCipher([], CONFIG_BT).length === 0);
  comprobar("con dos velas tampoco",
    senalesCipher(derrumbe.slice(0, 2), CONFIG_BT).length === 0);
  const plana = Array.from({ length: 200 }, (_, i) => ({
    time: i * DIA, open: 100, high: 100, low: 100, close: 100, volume: 1000,
  }));
  comprobar("una serie plana no inventa señales",
    senalesCipher(plana, CONFIG_BT).length === 0,
    String(senalesCipher(plana, CONFIG_BT).length));
}

console.log(`\n${bien} bien, ${malos.length} mal`);
process.exit(malos.length === 0 ? 0 : 1);
