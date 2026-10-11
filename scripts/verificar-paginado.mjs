/**
 * Paginado de velas: cómo se parte un pedido de más de 1.000 y cómo se
 * vuelven a juntar las páginas.
 *
 *   node --experimental-strip-types scripts/verificar-paginado.mjs
 */

import {
  OPCIONES_HISTORIA,
  traerPaginado,
  unirVelas,
  ventanasKlines,
} from "../src/lib/binance/paginado.ts";

let fallos = 0;
const ok = (que, cond, detalle = "") => {
  if (cond) console.log(`✓ ${que}`);
  else {
    fallos++;
    console.log(`✗ ${que}${detalle ? ` — ${detalle}` : ""}`);
  }
};

const MIN15 = 900;
const AHORA = 1_760_000_000_000;

// ── cómo se parte ──────────────────────────────────────────────────────
ok("1.000 velas entran en una sola página", ventanasKlines(MIN15, 1000, AHORA).length === 1);
ok("10.000 velas son 11 páginas (el solape se compensa)", ventanasKlines(MIN15, 10000, AHORA).length === 11, String(ventanasKlines(MIN15, 10000, AHORA).length));
ok("2.500 velas son 3 páginas", ventanasKlines(MIN15, 2500, AHORA).length === 3);

const v = ventanasKlines(MIN15, 5000, AHORA);
ok("la primera página termina ahora", v[0] === AHORA);
ok(
  "cada página retrocede 999 velas (una de solape)",
  v[1] === AHORA - 999 * MIN15 * 1000 && v[2] === AHORA - 2 * 999 * MIN15 * 1000,
  JSON.stringify(v.map((x) => (AHORA - x) / (MIN15 * 1000))),
);
ok(
  "las páginas van de la más nueva a la más vieja",
  v.every((x, i) => i === 0 || x < v[i - 1]),
);
ok(
  "en 1 día las páginas cubren años, no días",
  (AHORA - ventanasKlines(86400, 5000, AHORA).at(-1)) / 86_400_000 > 3000,
);

// ── cómo se juntan ─────────────────────────────────────────────────────
const vela = (t) => ({ time: t, close: t });
ok(
  "se ordenan de vieja a nueva",
  unirVelas([[vela(30), vela(40)], [vela(10), vela(20)]], 10)
    .map((x) => x.time)
    .join(",") === "10,20,30,40",
);
ok(
  "la vela repetida en el solape entra una sola vez",
  unirVelas([[vela(20), vela(30)], [vela(10), vela(20)]], 10).length === 3,
);
ok(
  "se devuelven las últimas N, no las primeras",
  unirVelas([[vela(10), vela(20), vela(30), vela(40)]], 2)
    .map((x) => x.time)
    .join(",") === "30,40",
);
ok("sin páginas no explota", unirVelas([], 10).length === 0);

// ── el pedido completo ─────────────────────────────────────────────────
const pedidos = [];
const falso = async (fin, n) => {
  pedidos.push(fin);
  const base = fin ?? AHORA;
  // Devuelve n velas terminando en `fin`.
  return Array.from({ length: n }, (_, i) => vela(Math.floor(base / 1000) - (n - 1 - i) * MIN15));
};

const pocas = await traerPaginado(falso, MIN15, 500, 1000, AHORA);
ok("pidiendo 500 se hace un solo pedido sin fin", pedidos.length === 1 && pedidos[0] === undefined);
ok("y vuelven 500", pocas.length === 500);

pedidos.length = 0;
const muchas = await traerPaginado(falso, MIN15, 3000, 1000, AHORA);
ok("pidiendo 3.000 se hacen 4 pedidos, no 3", pedidos.length === 4, String(pedidos.length));
ok("el primero va sin fin (las más nuevas)", pedidos[0] === undefined);
ok("vuelven 3.000 velas sin repetidas", muchas.length === 3000, String(muchas.length));
ok(
  "ordenadas y sin huecos",
  muchas.every((x, i) => i === 0 || x.time === muchas[i - 1].time + MIN15),
);

// Una página que falla no tira todo el pedido.
let llamada = 0;
const aVeces = async (fin, n) => {
  llamada++;
  if (llamada === 2) throw new Error("503 del exchange");
  const base = fin ?? AHORA;
  return Array.from({ length: n }, (_, i) => vela(Math.floor(base / 1000) - (n - 1 - i) * MIN15));
};
const parcial = await traerPaginado(aVeces, MIN15, 3000, 1000, AHORA);
ok(
  "si una página falla, se muestran las otras en vez de nada",
  parcial.length > 1500 && parcial.length < 3000,
  String(parcial.length),
);

ok("las opciones de historia son 1k, 2,5k, 5k y 10k", OPCIONES_HISTORIA.join(",") === "1000,2500,5000,10000");

console.log(fallos === 0 ? "\n✓ paginado de velas correcto" : `\n✗ ${fallos} fallos`);
process.exit(fallos === 0 ? 0 : 1);
