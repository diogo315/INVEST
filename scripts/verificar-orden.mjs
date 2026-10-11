/**
 * Reordenar la lista arrastrando. Lo complicado es que al sacar el
 * elemento todas las ranuras posteriores se corren una.
 *
 *   node --experimental-strip-types scripts/verificar-orden.mjs
 */

import { mover, ranuraEn } from "../src/lib/watchlist/orden.ts";

let fallos = 0;
const ok = (que, cond, detalle = "") => {
  if (cond) console.log(`✓ ${que}`);
  else {
    fallos++;
    console.log(`✗ ${que}${detalle ? ` — ${detalle}` : ""}`);
  }
};
const L = ["A", "B", "C", "D"];
const txt = (a) => a.join("");

ok("mover el primero al final", txt(mover(L, 0, 4)) === "BCDA", txt(mover(L, 0, 4)));
ok("mover el último al principio", txt(mover(L, 3, 0)) === "DABC", txt(mover(L, 3, 0)));
ok("mover B después de C", txt(mover(L, 1, 3)) === "ACBD", txt(mover(L, 1, 3)));
ok("mover C antes de B", txt(mover(L, 2, 1)) === "ACBD", txt(mover(L, 2, 1)));
ok("mover D a la ranura 2", txt(mover(L, 3, 2)) === "ABDC", txt(mover(L, 3, 2)));

ok("soltar en su propio lugar no cambia nada", mover(L, 1, 1) === L);
ok("soltar justo después de sí mismo tampoco", mover(L, 1, 2) === L);
ok("la lista original no se toca", txt(L) === "ABCD");

ok("una ranura más allá del final se acota", txt(mover(L, 0, 99)) === "BCDA");
ok("una ranura negativa también", txt(mover(L, 3, -5)) === "DABC");
ok("un índice que no existe devuelve la lista igual", mover(L, 9, 0) === L);
ok("una lista de uno no se rompe", txt(mover(["A"], 0, 1)) === "A");
ok("una lista vacía tampoco", mover([], 0, 0).length === 0);

// Mover todo de a uno y volver: la lista tiene que quedar igual.
{
  let x = [...L];
  x = mover(x, 0, 3); // BCAD
  x = mover(x, 2, 0); // ABCD
  ok("ida y vuelta deja la lista como estaba", txt(x) === "ABCD", txt(x));
}

// ── en qué ranura cae el puntero ──────────────────────────────────────
const filas = [
  { arriba: 0, alto: 20 },
  { arriba: 20, alto: 20 },
  { arriba: 40, alto: 20 },
];
ok("arriba de todo: ranura 0", ranuraEn(2, filas) === 0);
ok("mitad de arriba de la segunda: ranura 1", ranuraEn(25, filas) === 1);
ok("mitad de abajo de la segunda: ranura 2", ranuraEn(35, filas) === 2);
ok("abajo de todo: la última ranura", ranuraEn(100, filas) === 3);
ok("sin filas, ranura 0", ranuraEn(50, []) === 0);

console.log(
  fallos === 0 ? "\n✓ orden del watchlist correcto" : `\n✗ ${fallos} fallos`,
);
process.exit(fallos === 0 ? 0 : 1);
