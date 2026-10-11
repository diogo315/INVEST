/**
 * La búsqueda de la vela que contiene una fecha, que es lo que hace que la
 * cruz compartida funcione entre gráficos en temporalidades distintas.
 *
 *   node --experimental-strip-types scripts/verificar-sincronia.mjs
 */

import { buscadorDeVelas } from "../src/lib/chart/sincronia.ts";

let fallos = 0;
const ok = (que, cond, detalle = "") => {
  if (cond) console.log(`✓ ${que}`);
  else {
    fallos++;
    console.log(`✗ ${que}${detalle ? ` — ${detalle}` : ""}`);
  }
};

const DIA = 86400;
// Un gráfico diario: velas a las 00:00 de cinco días seguidos.
const diarias = Array.from({ length: 5 }, (_, i) => ({ time: 1_700_000_000 + i * DIA, close: 100 + i }));
const buscar = buscadorDeVelas(diarias);

ok("la fecha exacta devuelve su vela", buscar(diarias[2].time)?.close === 102);
ok(
  "una fecha de 4H del mismo día cae en la vela diaria",
  buscar(diarias[2].time + 4 * 3600)?.close === 102,
);
ok(
  "a un minuto de la vela siguiente, todavía es la anterior",
  buscar(diarias[3].time - 60)?.close === 102,
);
ok("la última vela sirve para cualquier fecha posterior", buscar(diarias[4].time + 10 * DIA)?.close === 104);
ok("antes de la primera vela no hay nada", buscar(diarias[0].time - 1) === undefined);
ok("sin velas no explota", buscadorDeVelas([])(123) === undefined);
ok("con una sola vela", buscadorDeVelas([{ time: 10, close: 5 }])(99)?.close === 5);

// Con mil velas tiene que seguir cayendo en la correcta (es binaria).
const muchas = Array.from({ length: 1000 }, (_, i) => ({ time: i * 900, close: i }));
const b2 = buscadorDeVelas(muchas);
let malos = 0;
for (let i = 0; i < 1000; i++) {
  if (b2(i * 900 + 450)?.close !== i) malos++;
}
ok("mil velas: todas las fechas caen en su vela", malos === 0, `${malos} fallos`);

console.log(fallos === 0 ? "\n✓ cruz compartida: la vela se encuentra bien" : `\n✗ ${fallos} fallos`);
process.exit(fallos === 0 ? 0 : 1);
