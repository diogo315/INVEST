/**
 * De la señal a la operación: el tamaño y la conversión.
 *
 *   node --experimental-strip-types --import ./scripts/alias.mjs scripts/verificar-smc-operar.mjs
 */

import {
  operacionDeSenal,
  senalesNuevas,
  unidadesPorRiesgo,
} from "../src/lib/smc/operar.ts";

let fallos = 0;
const ok = (que, cond, detalle = "") => {
  if (cond) console.log(`✓ ${que}`);
  else {
    fallos++;
    console.log(`✗ ${que}${detalle ? ` — ${detalle}` : ""}`);
  }
};

const cfg = (x = {}) => ({
  riesgoPorcentaje: 1,
  nocionalMaximo: 0,
  pasoCantidad: 0.00001,
  ...x,
});

const senal = (x = {}) => ({
  sesgo: 1,
  bosIndice: 5,
  indice: 7,
  time: 1700000000,
  entrada: 100,
  stop: 90,
  objetivo: 130,
  relacion: 3,
  nivel: 95,
  salida: null,
  ...x,
});

console.log("1. El tamaño sale del riesgo, no del precio");
{
  // 1 % de 10.000 son 100 dólares; con el stop a 10 de distancia, 10 unidades.
  ok("arriesga lo que dice arriesgar",
    unidadesPorRiesgo(10000, 100, 90, cfg()) === 10,
    String(unidadesPorRiesgo(10000, 100, 90, cfg())));

  // EL PUNTO DE TODO ESTO: con el stop al doble de lejos, la mitad de
  // tamaño. El dinero en riesgo no cambia.
  const cerca = unidadesPorRiesgo(10000, 100, 95, cfg());
  const lejos = unidadesPorRiesgo(10000, 100, 90, cfg());
  ok("CON EL STOP AL DOBLE DE LEJOS, LA MITAD DE TAMAÑO",
    Math.abs(cerca - 2 * lejos) < 1e-9, `${cerca} vs ${lejos}`);
  ok("y las dos arriesgan los mismos 100 dólares",
    Math.abs(cerca * 5 - 100) < 1e-6 && Math.abs(lejos * 10 - 100) < 1e-6,
    `${cerca * 5} / ${lejos * 10}`);

  ok("el porcentaje manda", unidadesPorRiesgo(10000, 100, 90, cfg({ riesgoPorcentaje: 2 })) === 20);
  ok("y el capital también", unidadesPorRiesgo(20000, 100, 90, cfg()) === 20);
  ok("una venta se dimensiona igual que una compra",
    unidadesPorRiesgo(10000, 100, 110, cfg()) === 10);
}

console.log("2. El tope del efectivo");
{
  // Sin tope entrarían 10 unidades a 100 = 1.000 de nocional.
  ok("el tope recorta", unidadesPorRiesgo(10000, 100, 90, cfg({ nocionalMaximo: 500 })) === 5);
  ok("un tope holgado no estorba",
    unidadesPorRiesgo(10000, 100, 90, cfg({ nocionalMaximo: 99999 })) === 10);
  ok("CON EL TOPE DEBAJO DE UN PASO NO SE OPERA, en vez de inventar un mínimo",
    unidadesPorRiesgo(10000, 100, 90, cfg({ nocionalMaximo: 0.0001 })) === 0);
}

console.log("3. El paso de cantidad redondea HACIA ABAJO");
{
  // 100 / 3 = 33.333...; con paso 1 tienen que ser 33, no 34.
  ok("redondea para abajo, nunca para arriba",
    unidadesPorRiesgo(10000, 100, 97, cfg({ pasoCantidad: 1 })) === 33,
    String(unidadesPorRiesgo(10000, 100, 97, cfg({ pasoCantidad: 1 }))));
  ok("REDONDEAR PARA ARRIBA SERÍA ARRIESGAR MÁS DE LO DICHO",
    33 * 3 <= 100 && 34 * 3 > 100);
  ok("no deja basura binaria en la cantidad",
    String(unidadesPorRiesgo(10000, 100, 90.123, cfg())).length < 14,
    String(unidadesPorRiesgo(10000, 100, 90.123, cfg())));
}

console.log("4. Lo que no se puede dimensionar no se opera");
{
  ok("sin distancia al stop, nada", unidadesPorRiesgo(10000, 100, 100, cfg()) === 0);
  ok("sin capital, nada", unidadesPorRiesgo(0, 100, 90, cfg()) === 0);
  ok("con capital negativo, nada", unidadesPorRiesgo(-500, 100, 90, cfg()) === 0);
  ok("con riesgo cero, nada", unidadesPorRiesgo(10000, 100, 90, cfg({ riesgoPorcentaje: 0 })) === 0);
  ok("con precios rotos, nada", unidadesPorRiesgo(10000, NaN, 90, cfg()) === 0);
  ok("y una señal así no se convierte",
    operacionDeSenal(senal({ stop: 100 }), 10000, cfg()) === null);
}

console.log("5. De la señal a la operación");
{
  const abierta = operacionDeSenal(senal(), 10000, cfg());
  ok("una compra queda del lado correcto", abierta?.lado === "compra");
  ok("con su stop y su objetivo", abierta?.stopLoss === 90 && abierta?.takeProfit === 130);
  ok("y abierta, porque la señal no terminó",
    abierta?.precioSalida === undefined && abierta?.motivo === undefined);

  const corta = operacionDeSenal(senal({ sesgo: -1, stop: 110, objetivo: 70 }), 10000, cfg());
  ok("una venta también", corta?.lado === "venta" && corta?.stopLoss === 110);

  const ganada = operacionDeSenal(
    senal({ salida: { motivo: "objetivo", precio: 130, indice: 9, time: 1700100000 } }),
    10000, cfg());
  ok("la que llegó al objetivo cierra ahí",
    ganada?.precioSalida === 130 && ganada?.motivo === "objetivo");
  ok("y con la hora de la vela que lo tocó", ganada?.tiempoSalida === 1700100000);

  const perdida = operacionDeSenal(
    senal({ salida: { motivo: "stop", precio: 90, indice: 9, time: 1700100000 } }),
    10000, cfg());
  ok("la del stop también", perdida?.precioSalida === 90 && perdida?.motivo === "stop");
  ok("y la pérdida es justo lo arriesgado",
    Math.abs((perdida.precioEntrada - perdida.precioSalida) * perdida.cantidad - 100) < 1e-6,
    String((perdida.precioEntrada - perdida.precioSalida) * perdida.cantidad));

  const ambigua = operacionDeSenal(
    senal({ salida: { motivo: "ambiguo", precio: 90, indice: 9, time: 1700100000 } }),
    10000, cfg());
  ok("LA AMBIGUA SE CUENTA COMO STOP, no como acierto",
    ambigua?.motivo === "stop" && ambigua?.precioSalida === 90,
    JSON.stringify({ m: ambigua?.motivo, p: ambigua?.precioSalida }));
}

console.log("6. No se opera dos veces la misma señal");
{
  const a = senal({ time: 100, entrada: 50 });
  const b = senal({ time: 200, entrada: 60 });
  const c = senal({ time: 300, entrada: 70 });
  ok("sin nada operado, están las tres",
    senalesNuevas([a, b, c], []).length === 3);
  ok("la ya operada desaparece",
    senalesNuevas([a, b, c], [{ tiempoEntrada: 200, precioEntrada: 60 }])
      .map((s) => s.time).join(",") === "100,300");
  ok("SE RECONOCE POR HORA Y PRECIO, no por índice de vela",
    senalesNuevas([a], [{ tiempoEntrada: 100, precioEntrada: 999 }]).length === 1);
  ok("una operación a mano en otro momento no tapa ninguna señal",
    senalesNuevas([a, b], [{ tiempoEntrada: 150, precioEntrada: 55 }]).length === 2);
}

console.log(fallos === 0 ? "\n✓ SMC operar: bien" : `\n✗ ${fallos} fallos`);
process.exit(fallos === 0 ? 0 : 1);
