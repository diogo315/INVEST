/**
 * Stop loss y take profit: la decisión de cuándo se cierra una operación.
 *
 *   node --experimental-strip-types --import ./scripts/alias.mjs \
 *     scripts/verificar-niveles.mjs
 *
 * Lo que se cuida acá es lo que convierte un simulador en un cuento:
 *
 * 1. QUE EL STOP LE GANE AL OBJETIVO cuando los dos caben en la misma
 *    vela. El OHLC no guarda el orden en que se tocaron los precios.
 *    Resolver a favor infla el resultado de forma sistemática.
 * 2. QUE SE MIRE CON MÁXIMO Y MÍNIMO, no con el cierre. Una vela que fue
 *    a tocar el stop y se recuperó ejecutó el stop de verdad.
 * 3. QUE NO SE EJECUTE CON LA VELA DE ENTRADA. Abrir al cierre de una
 *    vela y cobrarse su propio recorrido es mirar hacia atrás.
 * 4. QUE NO MIRE EL FUTURO: cortar la serie no puede cambiar un toque ya
 *    ocurrido.
 */
import {
  cantidadEfectiva,
  ladoValido,
  nivelesPorPct,
  premioPorUnidad,
  primerToque,
  problemaDeNiveles,
  redondearNivel,
  relacionRB,
  riesgoPorUnidad,
  sanearNiveles,
  toqueEnVela,
} from "../src/lib/backtest/niveles.ts";

let bien = 0;
const malos = [];
const ck = (n, c, d = "") => {
  if (c) bien++;
  else malos.push(`${n}${d ? ` — ${d}` : ""}`);
  console.log(`  ${c ? "ok " : "MAL"} ${n}${!c && d ? ` — ${d}` : ""}`);
};
const v = (time, high, low) => ({ time, high, low });

console.log("De qué lado va cada nivel");
{
  ck("compra: el objetivo va arriba", ladoValido("compra", 100, 110, "objetivo"));
  ck("compra: el objetivo NO va abajo", !ladoValido("compra", 100, 90, "objetivo"));
  ck("compra: el stop va abajo", ladoValido("compra", 100, 90, "stop"));
  ck("compra: el stop NO va arriba", !ladoValido("compra", 100, 110, "stop"));
  ck("venta: el objetivo va abajo", ladoValido("venta", 100, 90, "objetivo"));
  ck("venta: el stop va arriba", ladoValido("venta", 100, 110, "stop"));
  ck("un nivel negativo nunca vale", !ladoValido("compra", 100, -5, "stop"));
  ck("un nivel no numérico nunca vale", !ladoValido("compra", 100, NaN, "stop"));
}

console.log("El mensaje dice qué está mal");
{
  ck("compra bien puesta no da problema",
    problemaDeNiveles("compra", 100, { stopLoss: 95, takeProfit: 110 }) === null);
  ck("venta bien puesta no da problema",
    problemaDeNiveles("venta", 100, { stopLoss: 105, takeProfit: 90 }) === null);
  ck("stop al revés en una compra se detecta",
    /DEBAJO/.test(problemaDeNiveles("compra", 100, { stopLoss: 105 }) ?? ""),
    String(problemaDeNiveles("compra", 100, { stopLoss: 105 })));
  ck("objetivo al revés en una venta se detecta",
    /DEBAJO/.test(problemaDeNiveles("venta", 100, { takeProfit: 110 }) ?? ""),
    String(problemaDeNiveles("venta", 100, { takeProfit: 110 })));
  ck("sin niveles no hay problema", problemaDeNiveles("compra", 100, {}) === null);
}

console.log("Riesgo, premio y relación");
{
  ck("riesgo de 100 a 95 es 5", riesgoPorUnidad(100, 95) === 5);
  ck("riesgo de 100 a 105 también es 5 (venta)", riesgoPorUnidad(100, 105) === 5);
  ck("premio de 100 a 110 es 10", premioPorUnidad(100, 110) === 10);
  ck("relación 10/5 = 2", relacionRB(100, { stopLoss: 95, takeProfit: 110 }) === 2);
  ck("sin stop, la relación es null (no cero)",
    relacionRB(100, { takeProfit: 110 }) === null);
  ck("sin objetivo, la relación es null",
    relacionRB(100, { stopLoss: 95 }) === null);
  ck("con riesgo cero la relación es null, no infinito",
    relacionRB(100, { stopLoss: 100, takeProfit: 110 }) === null);
}

console.log("Una vela toca, o no toca");
{
  const n = { stopLoss: 95, takeProfit: 110 };
  ck("vela que no llega a ninguno no toca",
    toqueEnVela("compra", v(1, 104, 99), n) === null);
  ck("vela que llega al objetivo toca objetivo",
    toqueEnVela("compra", v(1, 111, 99), n)?.motivo === "objetivo");
  ck("vela que llega al stop toca stop",
    toqueEnVela("compra", v(1, 104, 94), n)?.motivo === "stop");
  ck("se ejecuta AL PRECIO DEL NIVEL, no al extremo de la vela",
    toqueEnVela("compra", v(1, 104, 90), n)?.precio === 95,
    String(toqueEnVela("compra", v(1, 104, 90), n)?.precio));
  ck("tocar exactamente el nivel cuenta",
    toqueEnVela("compra", v(1, 104, 95), n)?.motivo === "stop");
}

console.log("LA REGLA QUE MÁS IMPORTA: con los dos en la misma vela, gana el stop");
{
  const n = { stopLoss: 95, takeProfit: 110 };
  const t = toqueEnVela("compra", v(1, 115, 90), n);
  ck("compra: la vela que abarca los dos resuelve por el stop", t?.motivo === "stop",
    String(t?.motivo));
  ck("y al precio del stop", t?.precio === 95);
  const nv = { stopLoss: 105, takeProfit: 90 };
  const tv = toqueEnVela("venta", v(1, 115, 85), nv);
  ck("venta: también resuelve por el stop", tv?.motivo === "stop", String(tv?.motivo));
  ck("y al precio del stop de la venta", tv?.precio === 105);
}

console.log("La venta es simétrica");
{
  const n = { stopLoss: 105, takeProfit: 90 };
  ck("baja al objetivo: toca objetivo",
    toqueEnVela("venta", v(1, 101, 89), n)?.motivo === "objetivo");
  ck("sube al stop: toca stop",
    toqueEnVela("venta", v(1, 106, 99), n)?.motivo === "stop");
  ck("ni una cosa ni la otra: no toca",
    toqueEnVela("venta", v(1, 101, 95), n) === null);
}

console.log("Con un solo nivel puesto, el otro no inventa nada");
{
  ck("solo stop: una subida enorme no cierra",
    toqueEnVela("compra", v(1, 500, 99), { stopLoss: 95 }) === null);
  ck("solo objetivo: una caída enorme no cierra",
    toqueEnVela("compra", v(1, 104, 1), { takeProfit: 110 }) === null);
  ck("sin ningún nivel nunca toca", toqueEnVela("compra", v(1, 500, 1), {}) === null);
}

console.log("El primer toque de un tramo, y la vela de entrada que no cuenta");
{
  const velas = [v(10, 104, 99), v(20, 106, 98), v(30, 112, 94), v(40, 120, 90)];
  const n = { stopLoss: 95, takeProfit: 110 };
  const t = primerToque("compra", velas, n, 5);
  ck("devuelve el PRIMERO, no el último", t?.time === 30, String(t?.time));
  ck("y en esa vela gana el stop (abarca los dos)", t?.motivo === "stop", String(t?.motivo));

  // La vela de entrada no puede ejecutar: su recorrido ya pasó.
  const entrada = [v(10, 115, 90), v(20, 104, 99)];
  ck("la vela de entrada NO ejecuta",
    primerToque("compra", entrada, n, 10) === null,
    JSON.stringify(primerToque("compra", entrada, n, 10)));
  ck("pero una vela posterior igual sí ejecuta",
    primerToque("compra", [v(10, 115, 90), v(20, 115, 90)], n, 10)?.time === 20);
  ck("sin niveles, el tramo entero no toca",
    primerToque("compra", velas, {}, 5) === null);
}

console.log("No mira el futuro: cortar la serie no cambia un toque ya ocurrido");
{
  const largo = [v(10, 104, 99), v(20, 112, 94), v(30, 130, 80), v(40, 140, 70)];
  const n = { stopLoss: 95, takeProfit: 110 };
  const a = primerToque("compra", largo, n, 5);
  const b = primerToque("compra", largo.slice(0, 2), n, 5);
  ck("el toque es el mismo con la serie cortada",
    a?.time === b?.time && a?.motivo === b?.motivo && a?.precio === b?.precio,
    `${JSON.stringify(a)} vs ${JSON.stringify(b)}`);
  // Y un tramo que todavía no llegó al toque tiene que devolver null.
  ck("si el tramo no llega al toque, no hay toque",
    primerToque("compra", largo.slice(0, 1), n, 5) === null);
}

console.log("Niveles propuestos por porcentaje");
{
  const c = nivelesPorPct("compra", 100, 2, 4);
  ck("compra: stop 2 % abajo", Math.abs(c.stopLoss - 98) < 1e-9, String(c.stopLoss));
  ck("compra: objetivo 4 % arriba", Math.abs(c.takeProfit - 104) < 1e-9, String(c.takeProfit));
  ck("compra: la relación sale 2", Math.abs((relacionRB(100, c) ?? 0) - 2) < 1e-9);
  const vt = nivelesPorPct("venta", 100, 2, 4);
  ck("venta: stop 2 % ARRIBA", Math.abs(vt.stopLoss - 102) < 1e-9, String(vt.stopLoss));
  ck("venta: objetivo 4 % ABAJO", Math.abs(vt.takeProfit - 96) < 1e-9, String(vt.takeProfit));
  ck("venta: los propuestos son válidos",
    problemaDeNiveles("venta", 100, vt) === null,
    String(problemaDeNiveles("venta", 100, vt)));
  ck("compra: los propuestos son válidos",
    problemaDeNiveles("compra", 100, c) === null);
}

console.log("Redondeo y saneado");
{
  ck("un precio grande va a 2 decimales", redondearNivel(81234.56789) === 81234.57);
  ck("uno mediano a 4", redondearNivel(12.3456789) === 12.3457);
  ck("uno chiquito a 8", redondearNivel(0.000012345678912) === 0.00001235);
  ck("un precio inválido da 0", redondearNivel(NaN) === 0);
  ck("saneado deja lo bueno",
    JSON.stringify(sanearNiveles({ stopLoss: 95, takeProfit: 110 })) ===
      JSON.stringify({ stopLoss: 95, takeProfit: 110 }));
  ck("saneado tira lo negativo",
    JSON.stringify(sanearNiveles({ stopLoss: -5, takeProfit: 110 })) ===
      JSON.stringify({ takeProfit: 110 }));
  ck("saneado tira el texto",
    JSON.stringify(sanearNiveles({ stopLoss: "95" })) === "{}");
  ck("saneado de basura da objeto vacío", JSON.stringify(sanearNiveles(null)) === "{}");
}

console.log("La cantidad: una sola fórmula para el panel y para el gráfico");
{
  ck("sin cantidad manual, lo máximo que entra", cantidadEfectiva(null, 1000, 300) === 3);
  ck("con cantidad manual, la que dijo el usuario", cantidadEfectiva(7, 1000, 300) === 7);
  ck("nunca menos de 1 aunque no alcance", cantidadEfectiva(null, 10, 300) === 1);
  ck("una manual de 0 igual da 1", cantidadEfectiva(0, 1000, 300) === 1);
  ck("redondea la manual", cantidadEfectiva(2.7, 1000, 300) === 3);
  ck("precio cero no rompe", cantidadEfectiva(null, 1000, 0) === 1);
  ck("precio inválido no rompe", cantidadEfectiva(null, 1000, NaN) === 1);
}

console.log("\nCaso completo: una operación de punta a punta");
{
  // Compra a 100 con stop en 95 y objetivo en 110. Las velas siguientes
  // suben despacio y la cuarta se va a 112 sin haber bajado nunca de 97.
  const velas = [
    v(100, 101, 99),   // vela de entrada
    v(200, 103, 97),
    v(300, 106, 101),
    v(400, 112, 105),
  ];
  const n = { stopLoss: 95, takeProfit: 110 };
  const t = primerToque("compra", velas, n, 100);
  ck("cierra en la cuarta vela", t?.time === 400, String(t?.time));
  ck("por objetivo", t?.motivo === "objetivo", String(t?.motivo));
  ck("a 110 exacto, no a 112", t?.precio === 110, String(t?.precio));
  const ganancia = (t.precio - 100) * 50;   // 50 acciones
  ck("50 acciones ganan 500", ganancia === 500, String(ganancia));
}

console.log(
  `\n${malos.length === 0 ? `TODO BIEN (${bien})` : `FALLARON ${malos.length} de ${bien + malos.length}:\n - ${malos.join("\n - ")}`}`,
);
process.exit(malos.length === 0 ? 0 : 1);
