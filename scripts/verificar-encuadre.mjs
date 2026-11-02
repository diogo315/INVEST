/**
 * El encuadre del gráfico del backtest.
 *
 *   node --experimental-strip-types --import ./scripts/alias.mjs scripts/verificar-encuadre.mjs
 */

import {
  aireDerecho,
  desplazamientoDeHistoria,
  encuadreSiguiente,
} from "../src/lib/backtest/encuadre.ts";

let fallos = 0;
const ok = (que, cond, detalle = "") => {
  if (cond) console.log(`✓ ${que}`);
  else {
    fallos++;
    console.log(`✗ ${que}${detalle ? ` — ${detalle}` : ""}`);
  }
};

const PASO = 900;
const T0 = 1700000000;
/** Tiempos de `n` velas a partir de la número `desde`. */
const serie = (desde, n) =>
  Array.from({ length: n }, (_, i) => T0 + (desde + i) * PASO);

const op = (x = {}) => ({ anchoInicial: 120, margenDerecho: 6, ...x });

console.log("1. El primer encuadre");
{
  ok("el aire es un quinto de lo que se ve", aireDerecho(120, 6) === 24,
    String(aireDerecho(120, 6)));
  ok("pero nunca menos que el mínimo pedido", aireDerecho(10, 6) === 6);

  const r = encuadreSiguiente(null, [], serie(0, 200), op());
  ok("la última vela queda con aire a la derecha", r.to === 199 + 24, String(r.to));
  ok("con el ancho pedido", r.to - r.from === 120, String(r.to - r.from));
  ok("sin velas no hay nada que encuadrar",
    encuadreSiguiente(null, [], [], op()) === null);
  ok("un rango previo absurdo se trata como si no hubiera",
    encuadreSiguiente({ from: 5, to: 5 }, serie(0, 10), serie(0, 200), op()).to === 223);
}

console.log("2. UNA VELA NUEVA NO MUEVE LO YA DIBUJADO");
{
  // Esto es todo el pedido: el gráfico se queda quieto y la vela nueva
  // se agrega en el aire que hay a la derecha.
  const antes = { from: 80, to: 205 };   // última vela 199, aire hasta 205
  const r = encuadreSiguiente(antes, serie(0, 200), serie(0, 201), op());
  ok("EL RANGO NO SE MUEVE", r.from === 80 && r.to === 205, JSON.stringify(r));

  // Y así cinco veces: la vela 205 todavía entra.
  let rango = antes;
  let velas = 200;
  for (let i = 0; i < 5; i++) {
    const prev = serie(0, velas);
    velas++;
    rango = encuadreSiguiente(rango, prev, serie(0, velas), op());
  }
  ok("ni después de cinco velas", rango.from === 80 && rango.to === 205,
    JSON.stringify(rango));
}

console.log("3. Cuando la vela llega al borde, el gráfico pasa de página");
{
  // Rango de 125 de ancho: el aire al desplazar son 25 velas. Con el
  // borde en 205, la vela 205 es la primera que ya no entra.
  const antes = { from: 80, to: 205 };
  const justoAntes = encuadreSiguiente(antes, serie(0, 200), serie(0, 205), op());
  ok("la vela 204 todavía entra: nada se mueve",
    justoAntes.to === 205, String(justoAntes.to));

  const r = encuadreSiguiente(antes, serie(0, 200), serie(0, 206), op());
  ok("LA 205 NO ENTRA: se pasa de página y vuelve a haber aire",
    r.to === 205 + 25, String(r.to));
  ok("conservando el ancho", r.to - r.from === 125, String(r.to - r.from));
  ok("y después de pasar de página se queda quieto otra vez",
    encuadreSiguiente(r, serie(0, 206), serie(0, 207), op()).to === r.to);
}

console.log("4. El zoom del usuario manda");
{
  // Si alguien acercó a 40 velas, el ancho que se conserva es el suyo.
  const estrecho = { from: 165, to: 205 };
  const r = encuadreSiguiente(estrecho, serie(0, 200), serie(0, 201), op());
  ok("conserva 40 velas de ancho, no las 120 de fábrica",
    r.to - r.from === 40, String(r.to - r.from));
  const ancho = { from: -300, to: 205 };
  const r2 = encuadreSiguiente(ancho, serie(0, 200), serie(0, 201), op());
  ok("y si alejó, también", r2.to - r2.from === 505, String(r2.to - r2.from));
}

console.log("5. NUNCA ARRASTRA HACIA ATRÁS");
{
  // Alguien se fue a mirar un tramo viejo. El reproductor no lo saca
  // de ahí: la vela nueva aparece fuera de la vista y está bien.
  const mirandoAtras = { from: 10, to: 60 };
  const r = encuadreSiguiente(mirandoAtras, serie(0, 200), serie(0, 201), op());
  ok("el que se fue al pasado se queda en el pasado",
    r.from === 10 && r.to === 60, JSON.stringify(r));
  // Ni siquiera con un vencimiento lejos: eso también sería un tirón.
  const conVenc = encuadreSiguiente(mirandoAtras, serie(0, 200), serie(0, 201),
    op({ hastaIndice: 400 }));
  ok("ni un vencimiento lo arrastra", conVenc.to === 60, String(conVenc.to));
  // Pero si la vista SÍ venía siguiendo, se mueve como corresponde.
  ok("CONTROL: siguiendo al reproductor, sí se mueve cuando hace falta",
    encuadreSiguiente({ from: 80, to: 205 }, serie(0, 200), serie(0, 206), op()).to > 205);
}

console.log("6. LA VENTANA QUE TRAE HISTORIA NO HACE SALTAR EL GRÁFICO");
{
  // En 15m el backtest carga una ventana que se desliza. Cuando trae
  // 300 velas nuevas POR LA IZQUIERDA, todos los índices se corren;
  // sin traducir por tiempo, el gráfico pegaba un salto.
  const previos = serie(500, 200);              // velas 500..699
  const nuevos = serie(200, 500);               // velas 200..699: 300 nuevas adelante
  ok("se detectan las 300 velas agregadas adelante",
    desplazamientoDeHistoria(previos, nuevos) === 300,
    String(desplazamientoDeHistoria(previos, nuevos)));

  const antes = { from: 80, to: 205 };
  const r = encuadreSiguiente(antes, previos, nuevos, op());
  ok("EL RANGO SE TRADUCE, así la vista queda en el mismo momento",
    r.from === 380 && r.to === 505, JSON.stringify(r));
  ok("y el ancho no cambia", r.to - r.from === 125);

  // Al revés: la ventana soltó velas viejas.
  const soltadas = serie(560, 140);             // perdió 60 del principio
  ok("también se detecta lo que se soltó",
    desplazamientoDeHistoria(previos, soltadas) === -60,
    String(desplazamientoDeHistoria(previos, soltadas)));
  const r2 = encuadreSiguiente({ from: 100, to: 225 }, previos, soltadas, op());
  ok("y el rango se traduce para el otro lado", r2.from === 40 && r2.to === 165,
    JSON.stringify(r2));

  ok("sin ninguna vela en común no se inventa un desplazamiento",
    desplazamientoDeHistoria(serie(0, 10), serie(9000, 10)) === 0);
  ok("y con series vacías tampoco",
    desplazamientoDeHistoria([], serie(0, 10)) === 0 &&
      desplazamientoDeHistoria(serie(0, 10), []) === 0);
}

console.log("7. El vencimiento de una opción estira la vista");
{
  // Una opción vence 40 velas después de la última que existe: el hueco
  // a la derecha ES el tiempo que le queda, y hay que verlo.
  const r = encuadreSiguiente(
    { from: 80, to: 205 },
    serie(0, 200),
    serie(0, 201),
    op({ hastaIndice: 240 }),
  );
  ok("la vista llega hasta el vencimiento", r.to === 240, String(r.to));
  ok("conservando el ancho", r.to - r.from === 125, String(r.to - r.from));

  const sinFalta = encuadreSiguiente(
    { from: 80, to: 300 },
    serie(0, 200),
    serie(0, 201),
    op({ hastaIndice: 240 }),
  );
  ok("si ya se veía más allá, no se achica", sinFalta.to === 300, String(sinFalta.to));
}

console.log("8. Casos de borde");
{
  ok("una sola vela no revienta",
    encuadreSiguiente(null, [], serie(0, 1), op()).to === 24,
    String(encuadreSiguiente(null, [], serie(0, 1), op()).to));
  const angosto = encuadreSiguiente(null, [], serie(0, 50), op({ anchoInicial: 1 }));
  ok("el ancho nunca baja de 10", angosto.to - angosto.from === 10,
    String(angosto.to - angosto.from));
  ok("un margen negativo no rompe nada",
    encuadreSiguiente(null, [], serie(0, 50), op({ margenDerecho: -5 })).to === 49 + 24,
    String(encuadreSiguiente(null, [], serie(0, 50), op({ margenDerecho: -5 })).to));
}

console.log(fallos === 0 ? "\n✓ encuadre: bien" : `\n✗ ${fallos} fallos`);
process.exit(fallos === 0 ? 0 : 1);
