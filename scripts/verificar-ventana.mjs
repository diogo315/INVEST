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

import { desdeCuando, PISO_HISTORICO } from "../src/lib/exchanges/ventana-barras.ts";

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

console.log(fallos === 0 ? "\n✓ ventana de velas correcta" : `\n✗ ${fallos} fallos`);
process.exit(fallos === 0 ? 0 : 1);
