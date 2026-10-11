/**
 * Cuándo salta una alerta. Lo importante acá es que un cruce NO salte en la
 * primera lectura (si no, toda alerta nueva dispara al crearse) y que un
 * "mayor que" sí.
 *
 *   node --experimental-strip-types scripts/verificar-alertas.mjs
 */

import {
  CONDICIONES,
  FUENTES,
  alertaNueva,
  describirAlerta,
  redondear,
  seDispara,
  textoDisparo,
  usaNivel,
} from "../src/lib/alertas/tipos.ts";

let fallos = 0;
const ok = (que, cond, detalle = "") => {
  if (cond) console.log(`✓ ${que}`);
  else {
    fallos++;
    console.log(`✗ ${que}${detalle ? ` — ${detalle}` : ""}`);
  }
};

const a = (condicion, valor) => ({ condicion, valor });

// ── cruces ─────────────────────────────────────────────────────────────
ok("cruza hacia arriba: de abajo del nivel a arriba", seDispara(a("cruzaArriba", 100), 99, 101));
ok("no salta si ya venía arriba", !seDispara(a("cruzaArriba", 100), 101, 102));
ok("no salta si sigue abajo", !seDispara(a("cruzaArriba", 100), 98, 99));
ok("justo en el nivel todavía no cruzó", !seDispara(a("cruzaArriba", 100), 99, 100));
ok("del nivel exacto hacia arriba sí cruza", seDispara(a("cruzaArriba", 100), 100, 101));
ok("cruza hacia abajo", seDispara(a("cruzaAbajo", 100), 101, 99));
ok("no cruza hacia abajo si sube", !seDispara(a("cruzaAbajo", 100), 99, 101));

ok(
  "SIN lectura anterior un cruce nunca salta (si no, toda alerta nueva dispara al crearse)",
  !seDispara(a("cruzaArriba", 100), undefined, 500) &&
    !seDispara(a("cruzaAbajo", 100), undefined, 1),
);

// ── umbrales ───────────────────────────────────────────────────────────
ok("mayor que: salta sin necesitar lectura anterior", seDispara(a("mayorQue", 70), undefined, 71));
ok("mayor que: no salta en el límite", !seDispara(a("mayorQue", 70), undefined, 70));
ok("menor que", seDispara(a("menorQue", 30), undefined, 29.9));
ok("un valor que no es número nunca dispara", !seDispara(a("mayorQue", 1), 0, NaN));

// ── supertrend y cruce de medias usan cero como nivel ──────────────────
ok("el Supertrend pasando a alcista es cruzar 0 hacia arriba", seDispara(a("cruzaArriba", 0), -1, 1));
ok("y a bajista, hacia abajo", seDispara(a("cruzaAbajo", 0), 1, -1));
ok("si se mantiene del mismo lado, no salta", !seDispara(a("cruzaArriba", 0), 1, 1));

// ── qué fuentes llevan nivel ───────────────────────────────────────────
ok("precio y RSI llevan nivel", usaNivel("precio") && usaNivel("rsi"));
ok("Supertrend y cruce de medias no", !usaNivel("supertrend") && !usaNivel("cruceMedias"));
ok("hay cuatro fuentes y cuatro condiciones", FUENTES.length === 4 && CONDICIONES.length === 4);

// ── textos ─────────────────────────────────────────────────────────────
const base = alertaNueva("x", "BIN:BTCUSDT", "15m", 83044.1234);
ok("el nivel propuesto sale redondeado del precio", base.valor === 83044, String(base.valor));
ok("una moneda de centésimas conserva decimales", redondear(0.0865123) === 0.08651234 || redondear(0.0865123) === 0.0865123, String(redondear(0.0865123)));
ok("una alerta nueva arranca activa y de una sola vez", base.activa && base.unaVez);
ok(
  "el texto del precio no menciona temporalidad",
  describirAlerta(base) === "BTCUSDT: el precio cruza hacia arriba 83044",
  describirAlerta(base),
);
ok(
  "el del RSI sí la menciona",
  describirAlerta({ ...base, fuente: "rsi", valor: 70 }) ===
    "BTCUSDT 15m: el RSI 14 cruza hacia arriba 70",
  describirAlerta({ ...base, fuente: "rsi", valor: 70 }),
);
ok(
  "el del Supertrend se lee como cambio de lado",
  describirAlerta({ ...base, fuente: "supertrend" }) ===
    "BTCUSDT 15m: el Supertrend se pone alcista",
  describirAlerta({ ...base, fuente: "supertrend" }),
);
ok(
  "el del cruce nombra las dos medias",
  describirAlerta({ ...base, fuente: "cruceMedias" }) ===
    "BTCUSDT 15m: la media 14 cruza hacia arriba a la 50",
  describirAlerta({ ...base, fuente: "cruceMedias" }),
);
ok("el texto del disparo lleva el valor", textoDisparo(base, 83100) === "BTCUSDT tocó 83100");

console.log(fallos === 0 ? "\n✓ alertas: salta cuando tiene que saltar" : `\n✗ ${fallos} fallos`);
process.exit(fallos === 0 ? 0 : 1);
