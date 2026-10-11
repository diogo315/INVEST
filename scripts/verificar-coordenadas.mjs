/**
 * De fecha a posición en la escala y al revés. Es lo que hacía que una
 * diagonal terminada en el aire de la derecha no se dibujara nunca.
 *
 *   node --experimental-strip-types scripts/verificar-coordenadas.mjs
 */

import {
  indiceDeTiempo,
  pasoDeVelas,
  tiempoDeIndice,
} from "../src/lib/dibujos/coordenadas.ts";

let fallos = 0;
const ok = (que, cond, detalle = "") => {
  if (cond) console.log(`✓ ${que}`);
  else {
    fallos++;
    console.log(`✗ ${que}${detalle ? ` — ${detalle}` : ""}`);
  }
};
const cerca = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;

const DIA = 86400;
const T0 = 1_700_000_000;

// Serie pareja de 100 velas diarias.
const parejas = Array.from({ length: 100 }, (_, i) => ({ time: T0 + i * DIA }));

ok("el paso sale de la serie", pasoDeVelas(parejas) === DIA);
ok("con una sola vela no se rompe", pasoDeVelas([{ time: 1 }]) === 60);
ok("sin velas tampoco", pasoDeVelas([]) === 60);

ok("la primera vela está en 0", cerca(indiceDeTiempo(parejas, T0), 0));
ok("la décima, en 9", cerca(indiceDeTiempo(parejas, T0 + 9 * DIA), 9));
ok("la última, en 99", cerca(indiceDeTiempo(parejas, T0 + 99 * DIA), 99));
ok(
  "a mitad de camino entre dos velas, en el medio",
  cerca(indiceDeTiempo(parejas, T0 + 9 * DIA + DIA / 2), 9.5),
);

// Lo que estaba roto: fechas MÁS ALLÁ de la última vela.
ok(
  "diez velas después de la última: índice 109, no un error",
  cerca(indiceDeTiempo(parejas, T0 + 109 * DIA), 109),
);
ok(
  "y antes de la primera, índice negativo",
  cerca(indiceDeTiempo(parejas, T0 - 5 * DIA), -5),
);
ok("sin velas devuelve 0 en vez de romper", indiceDeTiempo([], 123) === 0);

// ── la vuelta ──────────────────────────────────────────────────────────
ok("índice 0 → primera vela", tiempoDeIndice(parejas, 0) === T0);
ok("índice 99 → última vela", tiempoDeIndice(parejas, 99) === T0 + 99 * DIA);
ok("índice 109 → diez días después", tiempoDeIndice(parejas, 109) === T0 + 109 * DIA);
ok("índice −3 → tres días antes", tiempoDeIndice(parejas, -3) === T0 - 3 * DIA);
ok("índice 9,5 → el mediodía entre dos velas", tiempoDeIndice(parejas, 9.5) === T0 + 9 * DIA + DIA / 2);

// Ida y vuelta: lo que se dibuja tiene que volver al mismo lugar.
{
  let peor = 0;
  for (const idx of [-20, -0.5, 0, 1.25, 50, 98.75, 99, 130.5]) {
    const t = tiempoDeIndice(parejas, idx);
    peor = Math.max(peor, Math.abs(indiceDeTiempo(parejas, t) - idx));
  }
  ok("ida y vuelta sin desvío", peor < 1e-4, String(peor));
}

// ── una acción: con huecos de fin de semana ────────────────────────────
{
  const habiles = [];
  let t = T0;
  while (habiles.length < 60) {
    const dia = new Date(t * 1000).getUTCDay();
    if (dia !== 0 && dia !== 6) habiles.push({ time: t });
    t += DIA;
  }
  ok("en una acción el paso sigue siendo un día", pasoDeVelas(habiles) === DIA);
  ok(
    "cada vela cae en su índice entero aunque haya fines de semana",
    habiles.every((v, i) => cerca(indiceDeTiempo(habiles, v.time), i)),
  );
  // Un sábado: entre el viernes y el lunes, nunca fuera de la serie.
  const viernes = habiles.find((v) => new Date(v.time * 1000).getUTCDay() === 5);
  const iSab = indiceDeTiempo(habiles, viernes.time + DIA);
  const iVie = indiceDeTiempo(habiles, viernes.time);
  ok(
    "un sábado cae ENTRE el viernes y el lunes, no en el limbo",
    iSab > iVie && iSab < iVie + 1,
    `${iVie} → ${iSab}`,
  );
  ok(
    "una fecha un mes después de la última no se sale de la escala",
    Number.isFinite(indiceDeTiempo(habiles, habiles[habiles.length - 1].time + 30 * DIA)),
  );
}

// ── temporalidad intradía ──────────────────────────────────────────────
{
  const m15 = Array.from({ length: 200 }, (_, i) => ({ time: T0 + i * 900 }));
  ok("15m: el paso son 900 segundos", pasoDeVelas(m15) === 900);
  ok(
    "una fecha diaria cae donde corresponde dentro de una serie de 15m",
    cerca(indiceDeTiempo(m15, T0 + DIA), 96),
  );
}

console.log(
  fallos === 0
    ? "\n✓ coordenadas: toda fecha tiene un lugar en la escala"
    : `\n✗ ${fallos} fallos`,
);
process.exit(fallos === 0 ? 0 : 1);
