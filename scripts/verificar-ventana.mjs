/**
 * Prueba la ventana que la ruta le pide a Alpaca para las velas.
 *
 *   node --experimental-strip-types scripts/verificar-ventana.mjs
 *
 * Lo que se verifica es lo que rompió el gráfico de AMZN: sin `start`,
 * Alpaca asume "desde el principio del día de hoy" y un sábado devuelve
 * cero velas. Acá se comprueba que la ventana siempre alcanza para las
 * velas pedidas, incluso cayendo en fin de semana.
 */

import {
  desdeCuando,
  ventanasDeBarras,
  MAX_VENTANAS,
  PISO_HISTORICO,
} from "../src/lib/exchanges/ventana-barras.ts";

/** Un sábado y un lunes feriado, que son los días que destapan el bug. */
const SABADO = Date.parse("2026-10-10T15:00:00Z");
const LUNES = Date.parse("2026-10-12T15:00:00Z");

/** Días de rueda (sin sábados ni domingos) entre dos fechas. */
function diasDeRueda(desdeISO, hasta) {
  let n = 0;
  for (let t = Date.parse(`${desdeISO}T00:00:00Z`); t <= hasta; t += 86_400_000) {
    const d = new Date(t).getUTCDay();
    if (d !== 0 && d !== 6) n++;
  }
  return n;
}

/** Cuántas velas de esa temporalidad entran en la ventana, aproximando. */
function velasQueEntran(tf, desdeISO, ahora) {
  const [, cant, unidad] = /^(\d+)(Min|Hour|Day|Week|Month)$/.exec(tf);
  const rueda = diasDeRueda(desdeISO, ahora);
  const n = Number(cant);
  if (unidad === "Min") return (rueda * 390) / n;
  if (unidad === "Hour") return (rueda * 6.5) / n;
  if (unidad === "Day") return rueda / n;
  if (unidad === "Week") return rueda / 5 / n;
  return rueda / 21 / n;
}

const CASOS = [
  { tf: "1Min", limite: 1000 },
  { tf: "5Min", limite: 1000 },
  { tf: "15Min", limite: 1000 },
  { tf: "30Min", limite: 1000 },
  { tf: "1Hour", limite: 1000 },
  { tf: "4Hour", limite: 1000 },
  { tf: "1Day", limite: 1000 },
  // El sondeo en vivo pide solo las dos últimas: es el caso que más fácil
  // se queda corto si la ventana no tiene colchón.
  { tf: "15Min", limite: 2 },
  { tf: "1Day", limite: 2 },
];

let fallos = 0;

for (const ahora of [SABADO, LUNES]) {
  const dia = new Date(ahora).toISOString().slice(0, 10);
  for (const { tf, limite } of CASOS) {
    const desde = desdeCuando(tf, limite, ahora);
    const entran = velasQueEntran(tf, desde, ahora);
    const ok = desde.length === 10 && entran >= limite;
    if (ok) {
      console.log(
        `✓ ${dia} · ${tf.padEnd(6)} × ${String(limite).padStart(4)} → desde ${desde} (entran ~${Math.round(entran)})`,
      );
    } else {
      fallos++;
      console.log(
        `✗ ${dia} · ${tf} × ${limite} → desde ${desde}: solo entran ~${Math.round(entran)} velas`,
      );
    }
  }
}

// Nunca antes del histórico que existe.
const viejo = desdeCuando("1Month", 1000, SABADO);
if (viejo === PISO_HISTORICO) {
  console.log(`✓ 1Month × 1000 se recorta al piso histórico (${PISO_HISTORICO})`);
} else {
  fallos++;
  console.log(`✗ 1Month × 1000 debería recortarse a ${PISO_HISTORICO}, dio ${viejo}`);
}

// Algo que no tiene forma de temporalidad de Alpaca (la ruta ya las valida
// antes, pero la función no puede devolver una ventana vacía igual).
const raro = desdeCuando("3d", 100, SABADO);
if (raro === PISO_HISTORICO) {
  console.log("✓ una temporalidad desconocida cae al piso, nunca a \"sin start\"");
} else {
  fallos++;
  console.log(`✗ temporalidad desconocida dio ${raro}`);
}

// ── ventanas en paralelo ───────────────────────────────────────────────
// Alpaca pagina por tramo de tiempo, no por cantidad de velas: cada página
// cubre ~26 días de rueda. Las ventanas tienen que ser más chicas que eso.
const VENTANAS = [
  { tf: "15Min", limite: 1000, max: 3 },
  { tf: "1Hour", limite: 1000, max: MAX_VENTANAS },
  { tf: "4Hour", limite: 1000, max: MAX_VENTANAS },
  { tf: "1Day", limite: 1000, max: 1 },
  { tf: "1Week", limite: 1000, max: 1 },
  // El sondeo en vivo pide dos velas: una sola llamada, no diez.
  { tf: "15Min", limite: 2, max: 1 },
  { tf: "4Hour", limite: 2, max: 1 },
];

for (const { tf, limite, max } of VENTANAS) {
  const v = ventanasDeBarras(tf, limite, SABADO);
  const problemas = [];
  if (v.length === 0) problemas.push("ninguna ventana");
  if (v.length > max) problemas.push(`${v.length} ventanas, el tope es ${max}`);
  // Ninguna ventana puede ser más larga que una página de Alpaca (~26 días
  // de rueda, o sea ~36 de calendario): si lo es, se pierden velas adentro.
  for (const w of v) {
    const dias = (Date.parse(w.hasta) - Date.parse(w.desde)) / 86_400_000;
    if (tf.endsWith("Min") || tf.endsWith("Hour")) {
      if (dias > 36) problemas.push(`ventana de ${dias} días en ${tf}`);
    }
    if (Date.parse(w.desde) >= Date.parse(w.hasta)) problemas.push("ventana vacía");
  }
  // La más nueva tiene que llegar hasta hoy, si no falta el tramo reciente.
  const masNueva = v[0];
  if (Date.parse(masNueva.hasta) < SABADO) problemas.push("no llega hasta hoy");
  // Y entre todas no puede quedar un hueco.
  for (let i = 1; i < v.length; i++) {
    if (Date.parse(v[i].hasta) < Date.parse(v[i - 1].desde)) {
      problemas.push(`hueco entre ${v[i].hasta} y ${v[i - 1].desde}`);
    }
  }
  if (problemas.length === 0) {
    console.log(
      `✓ ${tf.padEnd(6)} × ${limite} → ${v.length} ventana(s), de ${v[v.length - 1].desde} a ${v[0].hasta}`,
    );
  } else {
    fallos++;
    console.log(`✗ ${tf}: ${problemas.join("; ")}`);
  }
}

console.log(fallos === 0 ? "\n✓ ventana de velas correcta" : `\n✗ ${fallos} fallos`);
process.exit(fallos === 0 ? 0 : 1);
