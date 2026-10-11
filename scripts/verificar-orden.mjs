/**
 * Reordenar la lista arrastrando. Lo complicado es que al sacar el
 * elemento todas las ranuras posteriores se corren una.
 *
 *   node --experimental-strip-types scripts/verificar-orden.mjs
 */

import {
  agruparParaMostrar,
  mover,
  nombreDeSeccionLibre,
  ranuraEn,
  sanearSecciones,
} from "../src/lib/watchlist/orden.ts";

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

// ── categorías ────────────────────────────────────────────────────────
const sec = (id, nombre, plegada = false) => ({ id, nombre, plegada });

{
  const simbolos = ["BTC", "ETH", "AAPL", "SOL", "TSLA"];
  const grupo = { AAPL: "bolsa", TSLA: "bolsa", BTC: "cripto" };
  const secciones = [sec("cripto", "Cripto"), sec("bolsa", "Bolsa")];
  const b = agruparParaMostrar(simbolos, grupo, secciones);

  ok("primero van los sueltos, después cada categoría", b.length === 3);
  ok("los sueltos no llevan título", b[0].seccion === null);
  ok("y son los que no están en ninguna", b[0].simbolos.join(",") === "ETH,SOL", b[0].simbolos.join(","));
  ok("cada categoría trae los suyos", b[1].simbolos.join(",") === "BTC" && b[2].simbolos.join(",") === "AAPL,TSLA");
  ok(
    "dentro de la categoría se respeta el orden de la lista",
    agruparParaMostrar(["TSLA", "AAPL"], grupo, secciones)[1].simbolos.join(",") === "TSLA,AAPL",
  );
}

{
  // Lo importante: una categoría borrada no se puede llevar activos.
  const b = agruparParaMostrar(["BTC", "ETH"], { BTC: "fantasma" }, []);
  ok("sin categorías, todos los activos están igual", b.length === 1 && b[0].simbolos.join(",") === "BTC,ETH");
  const c = agruparParaMostrar(["BTC", "ETH"], { BTC: "fantasma" }, [sec("otra", "Otra")]);
  ok(
    "un activo que apunta a una categoría que ya no existe vuelve a estar suelto",
    c[0].simbolos.join(",") === "BTC,ETH",
    JSON.stringify(c.map((x) => x.simbolos)),
  );
}

{
  const vacia = agruparParaMostrar([], {}, [sec("a", "A")]);
  ok("una categoría vacía se muestra igual (para poder soltarle algo)", vacia.some((x) => x.seccion?.id === "a"));
  ok("con lista vacía y sin categorías hay un bloque vacío", agruparParaMostrar([], {}, []).length === 1);
}

ok(
  "un nombre repetido se numera",
  nombreDeSeccionLibre([sec("a", "Cripto")], "Cripto") === "Cripto (2)",
  nombreDeSeccionLibre([sec("a", "Cripto")], "Cripto"),
);
ok("uno libre se respeta", nombreDeSeccionLibre([sec("a", "Cripto")], "Bolsa") === "Bolsa");
ok("un nombre vacío cae en el genérico", nombreDeSeccionLibre([], "   ") === "Categoría");

ok(
  "lo guardado se limpia",
  sanearSecciones([sec("a", "A"), { nada: 1 }, null, { id: "b" }]).length === 2,
);
ok(
  "una categoría sin nombre recibe uno",
  sanearSecciones([{ id: "b" }])[0].nombre === "Categoría",
);
ok("lo que no es lista devuelve vacío", sanearSecciones("x").length === 0);

console.log(
  fallos === 0 ? "\n✓ orden y categorías del watchlist correctos" : `\n✗ ${fallos} fallos`,
);
process.exit(fallos === 0 ? 0 : 1);
