/**
 * Prueba la migración de las medias móviles: antes eran tres indicadores
 * sueltos (ema20/ema50/ema200) con su período en el config; ahora son una
 * lista. Lo que no puede pasar es que alguien pierda las que tenía.
 *
 *   node --experimental-strip-types scripts/verificar-medias.mjs
 */

import {
  COLORES_MEDIA,
  MAX_MEDIAS,
  migrarMedias,
  nuevaMedia,
  sanearMedias,
} from "../src/lib/chart/medias.ts";

let fallos = 0;
function ok(que, condicion, detalle = "") {
  if (condicion) console.log(`✓ ${que}`);
  else {
    fallos++;
    console.log(`✗ ${que}${detalle ? ` — ${detalle}` : ""}`);
  }
}

// ── migración ──────────────────────────────────────────────────────────
const porDefecto = migrarMedias({
  periodos: { ema20: 20, ema50: 50, ema200: 200 },
  prendidos: { ema20: true, ema50: true, ema200: false },
  ocultos: {},
});
ok(
  "lo que estaba prendido pasa a la lista, lo apagado no",
  porDefecto.medias.length === 2 &&
    porDefecto.medias.map((m) => m.periodo).join(",") === "20,50" &&
    porDefecto.prendido === true,
  JSON.stringify(porDefecto.medias.map((m) => m.periodo)),
);

const personalizado = migrarMedias({
  periodos: { ema20: 9, ema50: 21, ema200: 55 },
  prendidos: { ema20: true, ema50: true, ema200: true },
  ocultos: { ema50: true },
});
ok(
  "se respetan los períodos que el usuario había cambiado",
  personalizado.medias.map((m) => m.periodo).join(",") === "9,21,55",
  JSON.stringify(personalizado.medias.map((m) => m.periodo)),
);
ok(
  "el ojo apagado de un slot queda como línea oculta, no se borra",
  personalizado.medias.length === 3 &&
    personalizado.medias.find((m) => m.periodo === 21)?.visible === false,
);
ok(
  "los colores de siempre se conservan",
  personalizado.medias.map((m) => m.color).join(",") ===
    [COLORES_MEDIA[0], COLORES_MEDIA[1], COLORES_MEDIA[2]].join(","),
);

const ninguno = migrarMedias({
  periodos: {},
  prendidos: {},
  ocultos: {},
});
ok(
  "sin ninguna EMA prendida: quedan las tres por defecto pero apagadas",
  ninguno.medias.length === 3 && ninguno.prendido === false,
);

const basura = migrarMedias({
  periodos: { ema20: "veinte", ema50: null, ema200: -3 },
  prendidos: { ema20: true, ema50: true, ema200: true },
  ocultos: {},
});
ok(
  "un período guardado corrupto cae al valor de siempre",
  basura.medias.map((m) => m.periodo).join(",") === "20,50,200",
  JSON.stringify(basura.medias.map((m) => m.periodo)),
);

// ── saneo de la lista guardada ─────────────────────────────────────────
ok("una lista que no es lista se descarta", sanearMedias("nada") === null);
ok("una lista vacía se descarta", sanearMedias([]) === null);

const sucia = sanearMedias([
  { id: "a", tipo: "EMA", periodo: 20, color: "#fff", grosor: 1, visible: true },
  { id: "b", periodo: 9999, tipo: "raro", color: "", grosor: 7 },
  { no: "sirve" },
  null,
]);
ok(
  "se filtran las entradas rotas y se acotan los valores",
  sucia?.length === 2 &&
    sucia[1].periodo === 2000 &&
    sucia[1].tipo === "EMA" &&
    sucia[1].grosor === 1 &&
    sucia[1].color === COLORES_MEDIA[0] &&
    sucia[1].visible === true,
  JSON.stringify(sucia),
);

const muchas = sanearMedias(
  Array.from({ length: 30 }, (_, i) => ({
    id: `x${i}`,
    tipo: "EMA",
    periodo: i + 2,
    color: "#fff",
    grosor: 1,
    visible: true,
  })),
);
ok(`la lista guardada se corta en ${MAX_MEDIAS}`, muchas?.length === MAX_MEDIAS);

// ── alta de una media nueva ────────────────────────────────────────────
const nueva = nuevaMedia(100, [COLORES_MEDIA[0], COLORES_MEDIA[1]]);
ok(
  "una media nueva toma el primer color libre",
  nueva.color === COLORES_MEDIA[2],
  nueva.color,
);
ok("las lentas salen con línea gruesa", nueva.grosor === 2);
ok("las rápidas salen con línea fina", nuevaMedia(9).grosor === 1);
ok(
  "el período se acota y se redondea",
  nuevaMedia(0.4).periodo === 1 && nuevaMedia(99999).periodo === 2000,
);
ok(
  "dos medias seguidas no comparten id",
  nuevaMedia(10).id !== nuevaMedia(10).id,
);

console.log(
  fallos === 0 ? "\n✓ medias móviles: migración correcta" : `\n✗ ${fallos} fallos`,
);
process.exit(fallos === 0 ? 0 : 1);
